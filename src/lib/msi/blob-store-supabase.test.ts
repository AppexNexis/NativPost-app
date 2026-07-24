import { describe, expect, it } from 'vitest';

import { vaultObjectPath } from './blob-store-supabase';

describe('vaultObjectPath', () => {
  it('maps a namespaced vaultRef to a bucket object path', () => {
    expect(vaultObjectPath('managed-account/abc-123')).toBe(
      'managed-account/abc-123.blob',
    );
    expect(vaultObjectPath('exports/xyz')).toBe('exports/xyz.blob');
  });
});
