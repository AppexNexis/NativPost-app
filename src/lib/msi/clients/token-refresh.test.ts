import { describe, expect, it } from 'vitest';

import type { FetchLike } from './token-refresh';
import {
  expiryFromNow,
  needsRefresh,
  refreshMetaToken,
  refreshTikTokToken,
} from './token-refresh';

function oneResponse(body: any, ok = true, status = 200): FetchLike {
  return async () => ({ ok, status, json: async () => body });
}

describe('needsRefresh', () => {
  const now = 1_000_000_000_000;
  it('is false when expiry is unknown (cannot refresh proactively)', () => {
    expect(needsRefresh(undefined, now)).toBe(false);
  });
  it('is false well before expiry', () => {
    expect(needsRefresh(now + 60 * 60 * 1000, now)).toBe(false);
  });
  it('is true within the skew window of expiry', () => {
    expect(needsRefresh(now + 60 * 1000, now)).toBe(true); // 1 min left < 5 min skew
    expect(needsRefresh(now - 1, now)).toBe(true); // already expired
  });
});

describe('expiryFromNow', () => {
  it('converts expires_in seconds to an absolute ms expiry', () => {
    expect(expiryFromNow(3600, 1000)).toBe(1000 + 3600 * 1000);
    expect(expiryFromNow(0, 1000)).toBeUndefined();
    expect(expiryFromNow(undefined, 1000)).toBeUndefined();
  });
});

describe('refreshMetaToken', () => {
  it('exchanges the token and derives an absolute expiry', async () => {
    const res = await refreshMetaToken(
      { accessToken: 'old', appId: 'a', appSecret: 's' },
      oneResponse({ access_token: 'new', expires_in: 100 }),
      5000,
    );
    expect(res).toEqual({ accessToken: 'new', expiresAt: 5000 + 100 * 1000 });
  });

  it('throws when Meta rejects the exchange', async () => {
    await expect(
      refreshMetaToken(
        { accessToken: 'old', appId: 'a', appSecret: 's' },
        oneResponse({ error: { message: 'invalid token' } }, false, 400),
      ),
    ).rejects.toThrow(/Meta token refresh failed \(400\): invalid token/);
  });
});

describe('refreshTikTokToken', () => {
  it('rotates the token and keeps the old refresh token if none returned', async () => {
    const res = await refreshTikTokToken(
      { refreshToken: 'r-old', clientKey: 'k', clientSecret: 's' },
      oneResponse({ access_token: 'a-new', expires_in: 86400 }),
      5000,
    );
    expect(res).toEqual({
      accessToken: 'a-new',
      refreshToken: 'r-old',
      expiresAt: 5000 + 86400 * 1000,
    });
  });

  it('uses the rotated refresh token when TikTok returns one', async () => {
    const res = await refreshTikTokToken(
      { refreshToken: 'r-old', clientKey: 'k', clientSecret: 's' },
      oneResponse({ access_token: 'a-new', refresh_token: 'r-new', expires_in: 86400 }),
      5000,
    );
    expect(res.refreshToken).toBe('r-new');
  });

  it('throws when TikTok rejects the refresh', async () => {
    await expect(
      refreshTikTokToken(
        { refreshToken: 'r-old', clientKey: 'k', clientSecret: 's' },
        oneResponse({ error: 'invalid_grant', error_description: 'expired' }, false, 400),
      ),
    ).rejects.toThrow(/TikTok token refresh failed \(400\): expired/);
  });
});
