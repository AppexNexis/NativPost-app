// Credential blob format for the vault (docs §9). For API-operated accounts
// (`official_api`) the blob is JSON that the platform client parses — it must
// carry the platform's required fields. This module is the single source of
// truth for "what shape does each platform need", used to (a) validate at
// capture time (fail fast, not at publish time) and (b) show the operator the
// right template. Pure — no db/network.

/** Required JSON fields per platform (mirrors each client's parse*Credentials). */
export const REQUIRED_CREDENTIAL_FIELDS: Record<string, string[]> = {
  instagram: ['accessToken', 'igUserId'],
  facebook: ['accessToken', 'pageId'],
  tiktok: ['accessToken'],
  linkedin: ['accessToken', 'authorUrn'],
  youtube: ['accessToken'],
};

/** Optional fields the client will use if present (for the template hint). */
const OPTIONAL_CREDENTIAL_FIELDS: Record<string, string[]> = {
  instagram: ['expiresAt'],
  facebook: ['expiresAt'],
  tiktok: ['username', 'refreshToken', 'expiresAt'],
  linkedin: ['refreshToken', 'expiresAt'],
  youtube: ['refreshToken', 'expiresAt'],
};

export function requiredCredentialFields(platform: string): string[] {
  return REQUIRED_CREDENTIAL_FIELDS[platform] ?? [];
}

/** A ready-to-edit JSON template for a platform's capture textarea. */
export function credentialTemplate(platform: string): string {
  const required = REQUIRED_CREDENTIAL_FIELDS[platform];
  if (!required) {
    return '';
  }
  const fields = [...required, ...(OPTIONAL_CREDENTIAL_FIELDS[platform] ?? [])];
  const lines = fields.map((f) => {
    const placeholder = f === 'expiresAt' ? 0 : `"…"`;
    return `  "${f}": ${placeholder}`;
  });
  return `{\n${lines.join(',\n')}\n}`;
}

export type CredentialValidation = { ok: true } | { ok: false; error: string };

/**
 * Validate a pasted blob for an API-operated account: must be valid JSON with
 * every required field present as a non-empty value. Extra fields (e.g. the
 * human login kept for off-board handoff) are allowed and preserved.
 */
export function validateCredentialBlob(
  platform: string,
  raw: string,
): CredentialValidation {
  const required = REQUIRED_CREDENTIAL_FIELDS[platform];
  if (!required) {
    return { ok: true }; // unknown/manual platform → accept freeform
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      error: `${platform} credentials must be valid JSON — e.g. ${credentialTemplate(platform)}`,
    };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: 'Credentials JSON must be an object.' };
  }

  const obj = parsed as Record<string, unknown>;
  const missing = required.filter((f) => {
    const v = obj[f];
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  });
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing required field(s) for ${platform}: ${missing.join(', ')}.`,
    };
  }
  return { ok: true };
}
