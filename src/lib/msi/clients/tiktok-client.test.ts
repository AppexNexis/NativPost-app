import { describe, expect, it } from 'vitest';

import { parseTikTokCredentials } from './tiktok-client';

describe('parseTikTokCredentials', () => {
  it('parses a valid credential blob (username optional)', () => {
    expect(parseTikTokCredentials(JSON.stringify({ accessToken: 'tok' }))).toEqual({
      accessToken: 'tok',
      username: undefined,
    });
    expect(
      parseTikTokCredentials(JSON.stringify({ accessToken: 'tok', username: 'brand' })),
    ).toEqual({ accessToken: 'tok', username: 'brand' });
  });

  it('rejects an empty vault', () => {
    expect(() => parseTikTokCredentials(null)).toThrow(/no stored credentials/);
  });

  it('rejects non-JSON', () => {
    expect(() => parseTikTokCredentials('user:pass')).toThrow(/not valid JSON/);
  });

  it('rejects a blob missing the access token', () => {
    expect(() => parseTikTokCredentials(JSON.stringify({ username: 'brand' }))).toThrow(
      /missing accessToken/,
    );
  });
});
