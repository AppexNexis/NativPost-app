import { describe, expect, it } from 'vitest';

import { parseFacebookCredentials } from './facebook-client';

describe('parseFacebookCredentials', () => {
  it('parses a valid credential blob', () => {
    expect(
      parseFacebookCredentials(JSON.stringify({ accessToken: 'tok', pageId: '123' })),
    ).toEqual({ accessToken: 'tok', pageId: '123', expiresAt: undefined });
  });

  it('carries an optional expiresAt for proactive refresh', () => {
    expect(
      parseFacebookCredentials(
        JSON.stringify({ accessToken: 'tok', pageId: '123', expiresAt: 77 }),
      ).expiresAt,
    ).toBe(77);
  });

  it('rejects an empty vault', () => {
    expect(() => parseFacebookCredentials(null)).toThrow(/no stored credentials/);
  });

  it('rejects a blob missing the page id', () => {
    expect(() => parseFacebookCredentials(JSON.stringify({ accessToken: 'tok' }))).toThrow(
      /missing accessToken or pageId/,
    );
  });
});
