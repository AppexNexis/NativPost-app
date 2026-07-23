// Thin Fal.ai queue REST wrapper. Avoids adding a new SDK dependency by
// calling the documented queue endpoints directly.
//
// Docs: https://docs.fal.ai/features/queue

import { Buffer } from 'node:buffer';
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
    'Authorization': `Key ${FAL_KEY}`,
  };
}

export type FalSubmitResult = {
  request_id: string;
  status_url: string;
  response_url: string;
  cancel_url: string;
};

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
    throw new Error(formatFalError(res.status, text || res.statusText));
  }

  return (await res.json()) as FalSubmitResult;
}

export type FalStatus = {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | string;
  queue_position?: number;
  logs?: Array<{ message: string; timestamp: string }>;
};

export async function getFalStatus(falModel: string, requestId: string): Promise<FalStatus> {
  const url = `${FAL_QUEUE_BASE}/${falModel}/requests/${requestId}/status`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(formatFalError(res.status, text || res.statusText));
  }
  return (await res.json()) as FalStatus;
}

export async function getFalResult<T = unknown>(falModel: string, requestId: string): Promise<T> {
  const url = `${FAL_QUEUE_BASE}/${falModel}/requests/${requestId}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(formatFalError(res.status, text || res.statusText));
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

type FalJwk = {
  kty: string;
  crv: string;
  x: string;
  kid?: string;
  use?: string;
};

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
    if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || !jwk.x) {
      continue;
    }
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

export type FalWebhookHeaders = {
  requestId: string | null;
  userId: string | null;
  timestamp: string | null;
  signature: string | null;
};

/**
 * Verifies a Fal webhook signature using their published JWKS.
 * Returns true when the signature is valid and the timestamp is fresh.
 */
export async function verifyFalWebhook(
  headers: FalWebhookHeaders,
  rawBody: Buffer | string,
): Promise<boolean> {
  const { requestId, userId, timestamp, signature } = headers;
  if (!requestId || !userId || !timestamp || !signature) {
    return false;
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    return false;
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > WEBHOOK_MAX_SKEW_SEC) {
    return false;
  }

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
  if (sigBuf.length !== 64) {
    return false;
  }

  let keys: crypto.KeyObject[];
  try {
    keys = await loadFalJwks();
  } catch {
    return false;
  }

  for (const key of keys) {
    try {
      if (crypto.verify(null, message, key, sigBuf)) {
        return true;
      }
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
export type FalWebhookPayload = {
  request_id: string;
  gateway_request_id?: string;
  status: 'OK' | 'ERROR';
  payload?: Record<string, unknown>;
  error?: string;
};

// ── Error parsing ───────────────────────────────────────────────────────────
//
// Fal validation and moderation errors follow FastAPI's shape:
//   { detail: [{ type, loc, msg, input, ctx? }] }
// or a bare string { detail: "..." }, or a top-level { message: "..." }.
// Turn any of these into a short user-facing sentence so the UI can show
// "Content flagged by moderation" instead of "Unexpected status code: 422".

type FalErrorDetailItem = {
  type?: string;
  loc?: unknown[];
  msg?: string;
  ctx?: Record<string, unknown>;
};

const FRIENDLY_BY_TYPE: Record<string, string> = {
  content_policy_violation: 'Content flagged by moderation. Try a different prompt or reference image.',
  image_too_large: 'Reference image is too large for this model.',
  image_load_error: 'Could not load the reference image. Confirm the URL is public.',
  invalid_image: 'Reference image was rejected by the model.',
  timeout_error: 'The model timed out. Try again with a shorter duration or simpler prompt.',
  rate_limit_exceeded: 'Rate limit hit at the model provider. Try again in a minute.',
  insufficient_balance: 'Provider account is out of credits.',
  authentication_error: 'Provider authentication failed. Contact support.',
  sequence_too_long: 'Your prompt is too long for this model. Try a shorter prompt with fewer details.',
  invalid_aspect_ratio: 'The selected aspect ratio is not supported by this model.',
  invalid_duration: 'The selected duration is not supported by this model.',
  invalid_resolution: 'The selected resolution is not supported by this model.',
  internal_server_error: 'The model provider encountered an internal error. Try again.',
};

/** Strip Fal internal URLs from user-facing error messages. */
function stripFalUrls(text: string): string {
  return text.replace(/https?:\/\/docs\.fal\.ai\S*/gi, '').replace(/\s{2,}/g, ' ').trim();
}

export function parseFalErrorPayload(raw: string | undefined | null): { message: string; type?: string } {
  if (!raw) {
    return { message: 'Fal returned error' };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { message: 'Fal returned error' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { message: stripFalUrls(trimmed).slice(0, 300) };
  }

  if (parsed && typeof parsed === 'object') {
    const obj = parsed as { detail?: unknown; message?: unknown; error?: unknown };
    if (Array.isArray(obj.detail) && obj.detail.length > 0) {
      const first = obj.detail[0] as FalErrorDetailItem;
      const type = typeof first?.type === 'string' ? first.type : undefined;
      const friendly = type && FRIENDLY_BY_TYPE[type];
      const rawMsg = typeof first?.msg === 'string' ? first.msg : undefined;
      const msg = friendly || (rawMsg ? stripFalUrls(rawMsg) : undefined);
      if (msg) {
        return { message: msg, type };
      }
    }
    if (typeof obj.detail === 'string') {
      return { message: stripFalUrls(obj.detail).slice(0, 300) };
    }
    if (typeof obj.message === 'string') {
      return { message: stripFalUrls(obj.message).slice(0, 300) };
    }
    if (typeof obj.error === 'string') {
      return { message: stripFalUrls(obj.error).slice(0, 300) };
    }
  }

  return { message: stripFalUrls(trimmed).slice(0, 300) };
}

export function formatFalError(status: number, body: string): string {
  const parsed = parseFalErrorPayload(body);
  if (parsed.type) {
    return `${parsed.message} (${parsed.type})`;
  }
  if (status >= 400 && status < 500 && parsed.message === 'Fal returned error') {
    return `Fal request rejected (${status})`;
  }
  return parsed.message;
}

// Fal delivers webhook errors as either a string or a JSON blob depending on
// the model. This normalizer accepts both shapes and tags the type when
// available so the UI shows, e.g., "Content flagged by moderation"
// instead of "Unexpected status code: 422".
export function friendlyFalWebhookError(error: unknown): string {
  if (!error) {
    return 'Fal returned error';
  }
  if (typeof error === 'string') {
    const parsed = parseFalErrorPayload(error);
    return parsed.type ? `${parsed.message} (${parsed.type})` : parsed.message;
  }
  if (typeof error === 'object') {
    try {
      const parsed = parseFalErrorPayload(JSON.stringify(error));
      return parsed.type ? `${parsed.message} (${parsed.type})` : parsed.message;
    } catch {
      return 'Fal returned error';
    }
  }
  return String(error);
}

// ── Output extraction helpers ───────────────────────────────────────────────

export type ExtractedMedia = {
  imageUrl?: string;
  imageUrls?: string[];
  videoUrl?: string;
  audioUrl?: string;
  width?: number;
  height?: number;
  durationSec?: number;
};

/**
 * Fal model outputs are not perfectly uniform. This picks common shapes:
 * - { images: [{ url, width, height }] } (FLUX, GPT Image 2)
 * - { image: { url } } (edit)
 * - { video: { url }, duration } (Pixverse, Kling, Seedance, Veed)
 */
export function extractMediaFromFalPayload(payload: Record<string, unknown> | undefined): ExtractedMedia {
  if (!payload || typeof payload !== 'object') {
    return {};
  }
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
    if (typeof video.duration === 'number') {
      out.durationSec = video.duration;
    }
  }

  if (out.durationSec === undefined) {
    const rawDuration = (payload as { duration?: number }).duration;
    if (typeof rawDuration === 'number') {
      out.durationSec = rawDuration;
    }
  }

  const audio = (payload as { audio?: { url?: string } }).audio;
  if (audio?.url) {
    out.audioUrl = audio.url;
  }

  return out;
}
