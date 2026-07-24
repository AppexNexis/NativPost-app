import { describe, expect, it } from 'vitest';

import {
  credentialTemplate,
  requiredCredentialFields,
  validateCredentialBlob,
} from './credential-format';

describe('requiredCredentialFields', () => {
  it('mirrors each client parser', () => {
    expect(requiredCredentialFields('instagram')).toEqual(['accessToken', 'igUserId']);
    expect(requiredCredentialFields('tiktok')).toEqual(['accessToken']);
    expect(requiredCredentialFields('linkedin')).toEqual(['accessToken', 'authorUrn']);
    expect(requiredCredentialFields('unknown')).toEqual([]);
  });
});

describe('credentialTemplate', () => {
  it('produces valid JSON with required + optional fields', () => {
    const tpl = credentialTemplate('tiktok');
    const parsed = JSON.parse(tpl.replace(/…/g, 'x'));
    expect(parsed).toHaveProperty('accessToken');
    expect(parsed).toHaveProperty('username'); // optional hint
  });

  it('is empty for a platform with no client', () => {
    expect(credentialTemplate('unknown')).toBe('');
  });
});

describe('validateCredentialBlob', () => {
  it('accepts valid JSON with the required fields (extra fields allowed)', () => {
    const blob = JSON.stringify({
      accessToken: 'tok',
      igUserId: '123',
      email: 'x@y.com', // extra login field kept for handoff
      password: 'p',
    });
    expect(validateCredentialBlob('instagram', blob)).toEqual({ ok: true });
  });

  it('rejects plaintext (not JSON) with a helpful message', () => {
    const res = validateCredentialBlob('tiktok', 'accessToken: abc\nusername: nativpost.hq');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/must be valid JSON/);
    }
  });

  it('rejects JSON missing a required field', () => {
    const res = validateCredentialBlob('instagram', JSON.stringify({ accessToken: 'tok' }));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/igUserId/);
    }
  });

  it('rejects an empty required value', () => {
    const res = validateCredentialBlob('tiktok', JSON.stringify({ accessToken: '   ' }));
    expect(res.ok).toBe(false);
  });

  it('accepts anything for an unknown/manual platform', () => {
    expect(validateCredentialBlob('unknown', 'username: x\npassword: y')).toEqual({ ok: true });
  });
});
