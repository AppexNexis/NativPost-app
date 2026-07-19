/**
 * NativPost API Key utilities.
 *
 * Format: `np_live_<32 url-safe base64 chars>` (approx. 24 bytes of entropy).
 * We NEVER persist the plaintext. Only:
 *   - sha256(plaintext) as the lookup + verification hash
 *   - the last 4 chars for UI display ("np_live_...ab12")
 *
 * The plaintext is returned once from POST /api/settings/api-keys and
 * displayed one time in the CreateKeyDialog. If the user loses it, they
 * must create a new key.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

export const API_KEY_PREFIX = 'np_live';

export type GeneratedApiKey = {
  /** Full plaintext key: `np_live_xxxxxxxx...` — show ONCE, never store. */
  plaintext: string;
  /** sha256 hex digest — persist as api_key.hashedKey. */
  hashedKey: string;
  /** Last 4 chars — persist as api_key.lastFour for UI display. */
  lastFour: string;
};

/**
 * Generate a fresh API key.
 */
export function generateApiKey(): GeneratedApiKey {
  // 24 bytes → 32 chars base64url (no padding)
  const raw = randomBytes(24).toString('base64url');
  const plaintext = `${API_KEY_PREFIX}_${raw}`;
  const hashedKey = hashApiKey(plaintext);
  const lastFour = plaintext.slice(-4);
  return { plaintext, hashedKey, lastFour };
}

/**
 * sha256 of the plaintext key, hex-encoded.
 * Deterministic — used for both lookup (unique index) and verification.
 */
export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex');
}

/**
 * Constant-time comparison of two sha256 hex digests.
 * Guards against timing attacks even though the caller reads by index.
 */
export function safeCompareHash(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Parse the value of an Authorization header.
 * Accepts:
 *   - "Bearer np_live_..."
 *   - "np_live_..." (raw)
 * Returns the plaintext key or null.
 */
export function parseAuthorizationHeader(header: string | null | undefined): string | null {
  if (!header) {
    return null;
  }
  const trimmed = header.trim();
  if (trimmed.startsWith('Bearer ')) {
    const value = trimmed.slice(7).trim();
    return value.startsWith(API_KEY_PREFIX) ? value : null;
  }
  if (trimmed.startsWith(API_KEY_PREFIX)) {
    return trimmed;
  }
  return null;
}

/**
 * Format a stored key for UI display.
 * Example: `np_live_...ab12` — never reveals more than the last 4 chars.
 */
export function displayApiKey(prefix: string, lastFour: string): string {
  return `${prefix}_...${lastFour}`;
}
