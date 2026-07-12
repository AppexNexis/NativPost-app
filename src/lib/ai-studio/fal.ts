// Thin Fal.ai queue REST wrapper. Avoids adding a new SDK dependency by
// calling the documented queue endpoints directly.
//
// Docs: https://docs.fal.ai/features/queue

import crypto from 'node:crypto';

export const FAL_KEY = process.env.FAL_KEY || '';

const FAL_QUEUE_BASE = 'https://queue.fal.run';
const FAL_JWKS_URL = 'https://rest.alpha.fal.ai/.well-known/jwks.json';
const JWKS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const WEBHOOK_MAX_SKEW_SEC = 5 * 60; // 5 min replay window

function ensureFalKey() {
  if (!FAL_KEY) {
    throw new Error('FAL_KEY environment variable is not set');
  }
}

function authHeaders() {
  ensureFalKey();
  return {
    'Content-Type': 'application/json',
    Authorization: `Key ${FAL_KEY}`,
  };
}

export interface FalSubmitResult {
  request_id: string;
  status_url: string;
  response_url: string;
  cancel_url: string;
}

export async function submitFalJob(args: {
  falModel: string;
  input: Record<string, unknown>;
  webhookUrl: string;
}): Promise<FalSubmitResult> {
  const url = `${FAL_QUEUE_BASE}/${args.falModel}`;
  const res = await fetch(`${url}?fal_webhook=${encodeURIComponent(args.webhookUrl)}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(args.input),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Fal submit failed (${res.status}): ${text || res.statusText}`);
  }

  return (await res.json()) as FalSubmitResult;
}

export interface FalStatus {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | string;
  queue_position?: number;
  logs?: Array<{ message: string; timestamp: string }>;
}

export async function getFalStatus(falModel: string, requestId: string): Promise<FalStatus> {
  const url = `${FAL_QUEUE_BASE}/${falModel}/requests/${requestId}/status`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Fal status failed (${res.status}): ${text || res.statusText}`);
  }
  return (await res.json()) as FalStatus;
}

export async function getFalResult<T = unknown>(falModel: string, requestId: string): Promise<T> {
  const url = `${FAL_QUEUE_BASE}/${falModel}/requests/${requestId}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Fal result failed (${res.status}): ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function cancelFalJob(falModel: string, requestId: string): Promise<void> {
  const url = `${FAL_QUEUE_BASE}/${falModel}/requests/${requestId}/cancel`;
  const res = await fetch(url, { method: 'PUT', headers: authHeaders() });
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => '');
    throw new Error(`Fal cancel failed (${res.status}): ${text || res.statusText}`);
  }
}

// ── Webhook signature verification (JWKS + Ed25519) ─────────────────────────
//
// Fal signs webhooks with rotating Ed25519 keys published at their JWKS
// endpoint. The signature covers a canonical message built from four request
// headers plus the SHA-256 of the raw body. See:
//   https://docs.fal.ai/model-endpoints/webhooks/#webhook-signature
//
// Verification steps:
//   1. Reject if any of the four headers or the body are missing.
//   2. Reject stale timestamps (5 min skew window) to block replay.
//   3. Load and cache the JWKS keys as ed25519 public KeyObjects.
//   4. Verify the hex-encoded signature against each candidate key.

interface FalJwk {
  kty: string;
  crv: string;
  x: string;
  kid?: string;
  use?: string;
}

let jwksCache: { keys: crypto.KeyObject[]; fetchedAt: number } | null = null;

async function loadFalJwks(): Promise<crypto.KeyObject[]> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS) {
    return jwksCache.keys;
  }
  const res = await fetch(FAL_JWKS_URL);
  if (!res.ok) {
    throw new Error(`Failed to load Fal JWKS: ${res.status}`);
  }
  const data = (await res.json()) as { keys: FalJwk[] };
  const keys: crypto.KeyObject[] = [];
  for (const jwk of data.keys ?? []) {
    if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || !jwk.x) continue;
    try {
      const key = crypto.createPublicKey({
        key: jwk as unknown as crypto.JsonWebKey,
        format: 'jwk',
      });
      keys.push(key);
    } catch {
      // Skip unusable keys but keep going so a rotation still leaves us with
      // at least one valid key.
    }
  }
  if (keys.length === 0) {
    throw new Error('Fal JWKS returned no usable Ed25519 keys');
  }
  jwksCache = { keys, fetchedAt: now };
  return keys;
}

export interface FalWebhookHeaders {
  requestId: string | null;
  userId: string | null;
  timestamp: string | null;
  signature: string | null;
}

/**
 * Verifies a Fal webhook signature using their published JWKS.
 * Returns true when the signature is valid and the timestamp is fresh.
 */
export async function verifyFalWebhook(
  headers: FalWebhookHeaders,
  rawBody: Buffer | string,
): Promise<boolean> {
  const { requestId, userId, timestamp, signature } = headers;
  if (!requestId || !userId || !timestamp || !signature) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > WEBHOOK_MAX_SKEW_SEC) return false;

  const bodyBuf = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
  const bodyHashHex = crypto.createHash('sha256').update(bodyBuf).digest('hex');
  const message = Buffer.from(
    [requestId, userId, timestamp, bodyHashHex].join('\n'),
    'utf8',
  );

  let sigBuf: Buffer;
  try {
    sigBuf = Buffer.from(signature, 'hex');
  } catch {
    return false;
  }
  if (sigBuf.length !== 64) return false;

  let keys: crypto.KeyObject[];
  try {
    keys = await loadFalJwks();
  } catch {
    return false;
  }

  for (const key of keys) {
    try {
      if (crypto.verify(null, message, key, sigBuf)) return true;
    } catch {
      // try the next key
    }
  }
  return false;
}

/**
 * Fal delivers `payload.status = 'OK' | 'ERROR'` in webhooks.
 * See https://docs.fal.ai/features/queue#webhook-payload
 */
export interface FalWebhookPayload {
  request_id: string;
  gateway_request_id?: string;
  status: 'OK' | 'ERROR';
  payload?: Record<string, unknown>;
  error?: string;
}

// ── Output extraction helpers ───────────────────────────────────────────────

export interface ExtractedMedia {
  imageUrl?: string;
  imageUrls?: string[];
  videoUrl?: string;
  audioUrl?: string;
  width?: number;
  height?: number;
  durationSec?: number;
}

/**
 * Fal model outputs are not perfectly uniform. This picks common shapes:
 * - { images: [{ url, width, height }] } (FLUX, GPT Image 2)
 * - { image: { url } } (edit)
 * - { video: { url }, duration } (Pixverse, Kling, Seedance, Veed)
 */
export function extractMediaFromFalPayload(payload: Record<string, unknown> | undefined): ExtractedMedia {
  if (!payload || typeof payload !== 'object') return {};
  const out: ExtractedMedia = {};

  const images = (payload as { images?: Array<{ url?: string; width?: number; height?: number }> }).images;
  if (Array.isArray(images) && images.length > 0) {
    const urls = images.map(i => i?.url).filter((u): u is string => typeof u === 'string');
    if (urls.length > 0) {
      out.imageUrl = urls[0];
      out.imageUrls = urls;
      out.width = images[0]?.width;
      out.height = images[0]?.height;
    }
  }

  const image = (payload as { image?: { url?: string; width?: number; height?: number } }).image;
  if (!out.imageUrl && image?.url) {
    out.imageUrl = image.url;
    out.width = image.width;
    out.height = image.height;
  }

  const video = (payload as { video?: { url?: string; duration?: number } }).video;
  if (video?.url) {
    out.videoUrl = video.url;
    if (typeof video.duration === 'number') out.durationSec = video.duration;
  }

  if (out.durationSec === undefined) {
    const rawDuration = (payload as { duration?: number }).duration;
    if (typeof rawDuration === 'number') out.durationSec = rawDuration;
  }

  const audio = (payload as { audio?: { url?: string } }).audio;
  if (audio?.url) out.audioUrl = audio.url;

  return out;
}
