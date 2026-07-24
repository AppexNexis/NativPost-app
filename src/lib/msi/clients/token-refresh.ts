// OAuth token refresh for the execution clients (docs §Execution Layer). Managed
// accounts publish infrequently, so a stored token is often stale by the time a
// job runs (TikTok ~24h, Meta ~60d). Each client refreshes proactively by
// expiry before an API call and persists the new token back to the vault.
//
// Pure `needsRefresh` + injectable-`fetch` refreshers → fully unit-testable with
// no network. App credentials (META_APP_*, TIKTOK_CLIENT_*) are passed in by the
// client, not read here, so this module stays free of env/db.

export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

const DEFAULT_SKEW_MS = 5 * 60 * 1000; // refresh 5 min before expiry

/** True when a token with a known expiry should be refreshed now (with skew). */
export function needsRefresh(
  expiresAt: number | undefined,
  now: number,
  skewMs: number = DEFAULT_SKEW_MS,
): boolean {
  if (!expiresAt) {
    return false; // unknown expiry → can't refresh proactively; rely on the call
  }
  return now >= expiresAt - skewMs;
}

/** Absolute expiry (epoch ms) from an `expires_in` (seconds), or undefined. */
export function expiryFromNow(
  expiresInSec: number | undefined,
  now: number,
): number | undefined {
  if (!expiresInSec || expiresInSec <= 0) {
    return undefined;
  }
  return now + expiresInSec * 1000;
}

// --- Meta: extend a long-lived token via fb_exchange_token ---
export type MetaRefreshInput = {
  accessToken: string;
  appId: string;
  appSecret: string;
};

export async function refreshMetaToken(
  input: MetaRefreshInput,
  fetchImpl: FetchLike,
  now: number = Date.now(),
): Promise<{ accessToken: string; expiresAt?: number }> {
  const url
    = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token`
    + `&client_id=${encodeURIComponent(input.appId)}`
    + `&client_secret=${encodeURIComponent(input.appSecret)}`
    + `&fb_exchange_token=${encodeURIComponent(input.accessToken)}`;
  const res = await fetchImpl(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.access_token) {
    throw new Error(
      `Meta token refresh failed (${res.status}): ${data?.error?.message || 'no access_token'}`,
    );
  }
  return {
    accessToken: data.access_token,
    expiresAt: expiryFromNow(data.expires_in, now),
  };
}

// --- TikTok: refresh_token grant ---
export type TikTokRefreshInput = {
  refreshToken: string;
  clientKey: string;
  clientSecret: string;
};

export async function refreshTikTokToken(
  input: TikTokRefreshInput,
  fetchImpl: FetchLike,
  now: number = Date.now(),
): Promise<{ accessToken: string; refreshToken: string; expiresAt?: number }> {
  const body = new URLSearchParams({
    client_key: input.clientKey,
    client_secret: input.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: input.refreshToken,
  }).toString();
  const res = await fetchImpl('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.access_token) {
    throw new Error(
      `TikTok token refresh failed (${res.status}): ${data?.error_description || data?.error || 'no access_token'}`,
    );
  }
  return {
    accessToken: data.access_token,
    // TikTok rotates the refresh token; fall back to the old one if absent.
    refreshToken: data.refresh_token || input.refreshToken,
    expiresAt: expiryFromNow(data.expires_in, now),
  };
}

// --- LinkedIn: refresh_token grant ---
export type LinkedInRefreshInput = {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
};

export async function refreshLinkedInToken(
  input: LinkedInRefreshInput,
  fetchImpl: FetchLike,
  now: number = Date.now(),
): Promise<{ accessToken: string; refreshToken: string; expiresAt?: number }> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: input.refreshToken,
    client_id: input.clientId,
    client_secret: input.clientSecret,
  }).toString();
  const res = await fetchImpl('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.access_token) {
    throw new Error(
      `LinkedIn token refresh failed (${res.status}): ${data?.error_description || data?.error || 'no access_token'}`,
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || input.refreshToken,
    expiresAt: expiryFromNow(data.expires_in, now),
  };
}

// --- Google (YouTube): refresh_token grant ---
export type GoogleRefreshInput = {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
};

export async function refreshGoogleToken(
  input: GoogleRefreshInput,
  fetchImpl: FetchLike,
  now: number = Date.now(),
): Promise<{ accessToken: string; refreshToken: string; expiresAt?: number }> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: input.refreshToken,
    client_id: input.clientId,
    client_secret: input.clientSecret,
  }).toString();
  const res = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.access_token) {
    throw new Error(
      `Google token refresh failed (${res.status}): ${data?.error_description || data?.error || 'no access_token'}`,
    );
  }
  return {
    accessToken: data.access_token,
    // Google does not return a new refresh token on refresh — keep the old one.
    refreshToken: data.refresh_token || input.refreshToken,
    expiresAt: expiryFromNow(data.expires_in, now),
  };
}
