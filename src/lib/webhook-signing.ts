/**
 * Webhook signature generation + verification.
 *
 * Header format (mirrors Stripe): `t=<unix_seconds>,v1=<hex_hmac_sha256>`
 * The signed payload is `${t}.${body}` so replaying a captured body
 * against a different timestamp fails verification.
 *
 * Consumers verify by:
 *   1. Splitting the header on ','
 *   2. Rebuilding the signed payload with the received timestamp
 *   3. HMAC-SHA256 with their endpoint secret
 *   4. Constant-time comparing against v1
 *
 * The docs site publishes copy-paste verification snippets in
 * Node / Python / PHP.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

export const SIGNATURE_HEADER = 'NativPost-Signature';
export const EVENT_HEADER = 'NativPost-Event';
export const DELIVERY_ID_HEADER = 'NativPost-Delivery-Id';
export const WEBHOOK_SECRET_PREFIX = 'whsec';

/**
 * Generate a fresh webhook secret.
 * Format: `whsec_<48 base64url chars>` (~36 bytes of entropy).
 */
export function generateWebhookSecret(): string {
  return `${WEBHOOK_SECRET_PREFIX}_${randomBytes(36).toString('base64url')}`;
}

/**
 * Build the signature header for an outgoing webhook.
 * The `body` should be the EXACT string that will be sent as the
 * request body (JSON.stringify(payload) before the fetch call).
 */
export function signPayload(body: string, secret: string, timestamp?: number): string {
  const t = timestamp ?? Math.floor(Date.now() / 1000);
  const signedPayload = `${t}.${body}`;
  const v1 = createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
  return `t=${t},v1=${v1}`;
}

/**
 * Verify an incoming signature header.
 * Returns true iff:
 *   - header parses
 *   - the timestamp is within `toleranceSec` of now (replay protection)
 *   - the computed v1 matches in constant time
 *
 * Exported so consumers integrating INBOUND webhooks (or our own test
 * endpoint) can use the same code path. Default tolerance = 5 minutes.
 */
export function verifySignature(
  body: string,
  header: string | null | undefined,
  secret: string,
  toleranceSec = 300,
): boolean {
  if (!header) {
    return false;
  }
  const parts = header.split(',').reduce<Record<string, string>>((acc, chunk) => {
    const [k, v] = chunk.split('=');
    if (k && v) {
      acc[k.trim()] = v.trim();
    }
    return acc;
  }, {});
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!t || !v1 || !Number.isFinite(t)) {
    return false;
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > toleranceSec) {
    return false;
  }
  const expected = createHmac('sha256', secret)
    .update(`${t}.${body}`, 'utf8')
    .digest('hex');
  if (expected.length !== v1.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'));
  } catch {
    return false;
  }
}
