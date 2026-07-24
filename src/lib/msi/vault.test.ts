import { Buffer } from 'node:buffer';

import { describe, expect, it } from 'vitest';

import {
  generateMasterKey,
  openSecret,
  rewrapDek,
  sealSecret,
} from './vault';

const key = () => Buffer.from(generateMasterKey(), 'base64');

describe('vault envelope encryption', () => {
  it('round-trips a secret', () => {
    const k = key();
    const sealed = sealSecret('super-secret-password!', k);
    expect(openSecret(sealed, k)).toBe('super-secret-password!');
  });

  it('never stores the plaintext in the sealed output', () => {
    const secret = 'plaintext-canary-123';
    const sealed = sealSecret(secret, key());
    const serialized = JSON.stringify(sealed);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain('canary');
  });

  it('produces a different ciphertext each time (random DEK + IV)', () => {
    const k = key();
    const a = sealSecret('same input', k);
    const b = sealSecret('same input', k);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.wrappedDek).not.toBe(b.wrappedDek);
  });

  it('fails to open with the wrong master key', () => {
    const sealed = sealSecret('secret', key());
    expect(() => openSecret(sealed, key())).toThrow();
  });

  it('detects tampering with the ciphertext', () => {
    const k = key();
    const sealed = sealSecret('secret', k);
    const tampered = { ...sealed, ciphertext: Buffer.from('evil').toString('base64') };
    expect(() => openSecret(tampered, k)).toThrow();
  });

  it('rejects a master key of the wrong length', () => {
    expect(() => sealSecret('x', Buffer.alloc(16))).toThrow(/32 bytes/);
  });

  it('rotates the master key without re-encrypting the secret', () => {
    const oldKey = key();
    const newKey = key();
    const sealed = sealSecret('rotate-me', oldKey);
    const rewrapped = rewrapDek(sealed, oldKey, newKey);

    // Ciphertext is unchanged; only the wrapped DEK differs.
    expect(rewrapped.ciphertext).toBe(sealed.ciphertext);
    expect(rewrapped.wrappedDek).not.toBe(sealed.wrappedDek);

    expect(openSecret(rewrapped, newKey)).toBe('rotate-me');
    expect(() => openSecret(rewrapped, oldKey)).toThrow();
  });
});
