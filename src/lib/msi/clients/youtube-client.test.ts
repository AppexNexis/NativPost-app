import { describe, expect, it } from 'vitest';

import { parseYouTubeCredentials } from './youtube-client';

describe('parseYouTubeCredentials', () => {
  it('parses a valid credential blob', () => {
    expect(parseYouTubeCredentials(JSON.stringify({ accessToken: 'tok' }))).toEqual({
      accessToken: 'tok',
      refreshToken: undefined,
      expiresAt: undefined,
    });
  });

  it('carries refreshToken + expiresAt for proactive refresh', () => {
    expect(
      parseYouTubeCredentials(
        JSON.stringify({ accessToken: 'tok', refreshToken: 'r', expiresAt: 55 }),
      ),
    ).toMatchObject({ refreshToken: 'r', expiresAt: 55 });
  });

  it('rejects an empty vault', () => {
    expect(() => parseYouTubeCredentials(null)).toThrow(/no stored credentials/);
  });

  it('rejects a blob missing the access token', () => {
    expect(() => parseYouTubeCredentials(JSON.stringify({ refreshToken: 'r' }))).toThrow(
      /missing accessToken/,
    );
  });
});
