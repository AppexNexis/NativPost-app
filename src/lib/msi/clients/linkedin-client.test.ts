import { describe, expect, it } from 'vitest';

import { parseLinkedInCredentials } from './linkedin-client';

describe('parseLinkedInCredentials', () => {
  it('parses a valid credential blob', () => {
    expect(
      parseLinkedInCredentials(JSON.stringify({ accessToken: 'tok', authorUrn: 'urn:li:person:1' })),
    ).toEqual({
      accessToken: 'tok',
      authorUrn: 'urn:li:person:1',
      refreshToken: undefined,
      expiresAt: undefined,
    });
  });

  it('carries refreshToken + expiresAt for proactive refresh', () => {
    const cred = parseLinkedInCredentials(
      JSON.stringify({
        accessToken: 'tok',
        authorUrn: 'urn:li:person:1',
        refreshToken: 'r',
        expiresAt: 42,
      }),
    );
    expect(cred).toMatchObject({ refreshToken: 'r', expiresAt: 42 });
  });

  it('rejects an empty vault', () => {
    expect(() => parseLinkedInCredentials(null)).toThrow(/no stored credentials/);
  });

  it('rejects a blob missing the author urn', () => {
    expect(() => parseLinkedInCredentials(JSON.stringify({ accessToken: 'tok' }))).toThrow(
      /missing accessToken or authorUrn/,
    );
  });
});
