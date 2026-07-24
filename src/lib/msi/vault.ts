// Envelope encryption for the MSI credential vault (docs §9).
//
// Model: per-secret Data Encryption Key (DEK) encrypts the secret; the DEK is
// itself encrypted ("wrapped") by a long-lived master Key Encryption Key (KEK).
// Only the wrapped DEK and ciphertext are ever persisted — the plaintext secret
// and the plaintext DEK never touch storage. AES-256-GCM gives us tamper
// detection for free (a modified ciphertext or tag fails to open).
//
// This module is PURE crypto: no `Env`, no `db`. The master key is injected by
// the caller (see getVaultMasterKey in ./vault-env.ts).

import { Buffer } from 'node:buffer';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const VERSION = 1;

export type SealedSecret = {
  /** Envelope format version, for forward-compatible rotation. */
  v: number;
  /** Secret encrypted with the DEK (base64). */
  ciphertext: string;
  iv: string;
  authTag: string;
  /** DEK encrypted with the master KEK (base64). */
  wrappedDek: string;
  dekIv: string;
  dekAuthTag: string;
};

function assertKey(key: Buffer): void {
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `MSI vault master key must be ${KEY_BYTES} bytes (base64-encoded)`,
    );
  }
}

function encryptGcm(
  key: Buffer,
  plaintext: Buffer,
): { ct: Buffer; iv: Buffer; tag: Buffer } {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ct, iv, tag: cipher.getAuthTag() };
}

function decryptGcm(key: Buffer, ct: Buffer, iv: Buffer, tag: Buffer): Buffer {
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/** Seal a plaintext secret under the master key. */
export function sealSecret(plaintext: string, masterKey: Buffer): SealedSecret {
  assertKey(masterKey);
  const dek = randomBytes(KEY_BYTES);
  const secret = encryptGcm(dek, Buffer.from(plaintext, 'utf8'));
  const wrapped = encryptGcm(masterKey, dek);
  return {
    v: VERSION,
    ciphertext: secret.ct.toString('base64'),
    iv: secret.iv.toString('base64'),
    authTag: secret.tag.toString('base64'),
    wrappedDek: wrapped.ct.toString('base64'),
    dekIv: wrapped.iv.toString('base64'),
    dekAuthTag: wrapped.tag.toString('base64'),
  };
}

/** Recover the plaintext. Throws if the master key is wrong or data tampered. */
export function openSecret(sealed: SealedSecret, masterKey: Buffer): string {
  assertKey(masterKey);
  const dek = decryptGcm(
    masterKey,
    Buffer.from(sealed.wrappedDek, 'base64'),
    Buffer.from(sealed.dekIv, 'base64'),
    Buffer.from(sealed.dekAuthTag, 'base64'),
  );
  const plaintext = decryptGcm(
    dek,
    Buffer.from(sealed.ciphertext, 'base64'),
    Buffer.from(sealed.iv, 'base64'),
    Buffer.from(sealed.authTag, 'base64'),
  );
  return plaintext.toString('utf8');
}

/**
 * Re-wrap the DEK under a new master key (KEK rotation). The ciphertext is
 * untouched, so this is cheap — no need to re-encrypt the secret itself.
 */
export function rewrapDek(
  sealed: SealedSecret,
  oldMasterKey: Buffer,
  newMasterKey: Buffer,
): SealedSecret {
  assertKey(oldMasterKey);
  assertKey(newMasterKey);
  const dek = decryptGcm(
    oldMasterKey,
    Buffer.from(sealed.wrappedDek, 'base64'),
    Buffer.from(sealed.dekIv, 'base64'),
    Buffer.from(sealed.dekAuthTag, 'base64'),
  );
  const wrapped = encryptGcm(newMasterKey, dek);
  return {
    ...sealed,
    wrappedDek: wrapped.ct.toString('base64'),
    dekIv: wrapped.iv.toString('base64'),
    dekAuthTag: wrapped.tag.toString('base64'),
  };
}

/** Generate a fresh base64 master key. Use once, store in MSI_VAULT_MASTER_KEY. */
export function generateMasterKey(): string {
  return randomBytes(KEY_BYTES).toString('base64');
}
