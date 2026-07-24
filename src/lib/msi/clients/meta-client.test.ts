import { describe, expect, it } from 'vitest';

import { parseMetaCredentials } from './meta-client';

describe('parseMetaCredentials', () => {
  it('parses a valid credential blob', () => {
    expect(
      parseMetaCredentials(JSON.stringify({ accessToken: 'tok', igUserId: 'ig-1' })),
    ).toEqual({ accessToken: 'tok', igUserId: 'ig-1', expiresAt: undefined });
  });

  it('carries an optional expiresAt for proactive refresh', () => {
    expect(
      parseMetaCredentials(
        JSON.stringify({ accessToken: 'tok', igUserId: 'ig-1', expiresAt: 123 }),
      ).expiresAt,
    ).toBe(123);
  });

  it('rejects an empty vault', () => {
    expect(() => parseMetaCredentials(null)).toThrow(/no stored credentials/);
  });

  it('rejects non-JSON', () => {
    expect(() => parseMetaCredentials('user:pass')).toThrow(/not valid JSON/);
  });

  it('rejects a blob missing required fields', () => {
    expect(() => parseMetaCredentials(JSON.stringify({ accessToken: 'tok' }))).toThrow(
      /missing accessToken or igUserId/,
    );
  });
});
