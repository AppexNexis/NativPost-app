import { Buffer } from 'node:buffer';

import { describe, expect, it } from 'vitest';

import {
  CredentialVault,
  InMemorySealedBlobStore,
} from './credentials';
import { generateMasterKey } from './vault';

const key = () => Buffer.from(generateMasterKey(), 'base64');

describe('CredentialVault', () => {
  it('protects then reveals a secret', async () => {
    const vault = new CredentialVault(new InMemorySealedBlobStore(), key());
    const cred = await vault.protect('login:hunter2');
    expect(await vault.reveal(cred)).toBe('login:hunter2');
  });

  it('persists neither plaintext nor the wrapped DEK in the blob store', async () => {
    const store = new InMemorySealedBlobStore();
    const vault = new CredentialVault(store, key());
    const cred = await vault.protect('canary-secret');

    // The DB fields carry no plaintext.
    expect(JSON.stringify(cred)).not.toContain('canary');
    // The blob store holds the ciphertext but NOT the wrapped DEK.
    const blob = await store.get(cred.vaultRef);
    expect(blob).not.toBeNull();
    expect(JSON.stringify(blob)).not.toContain('canary');
    expect(JSON.stringify(blob)).not.toContain(cred.encryptedDek);
  });

  it('cannot reveal without the blob (store leak of DB alone is useless)', async () => {
    const vault = new CredentialVault(new InMemorySealedBlobStore(), key());
    const cred = await vault.protect('secret');
    // Same DB fields, but a fresh (empty) blob store.
    const isolated = new CredentialVault(new InMemorySealedBlobStore(), key());
    await expect(isolated.reveal(cred)).rejects.toThrow(/blob not found/);
  });

  it('rotates the master key and reveals under the new key only', async () => {
    const store = new InMemorySealedBlobStore();
    const oldKey = key();
    const newKey = key();
    const oldVault = new CredentialVault(store, oldKey);
    const cred = await oldVault.protect('rotate-me');

    const newEncryptedDek = await oldVault.rotateMasterKey(cred, newKey);
    const rotated = { vaultRef: cred.vaultRef, encryptedDek: newEncryptedDek };

    const newVault = new CredentialVault(store, newKey);
    expect(await newVault.reveal(rotated)).toBe('rotate-me');
    // The old key can no longer open the rotated credential.
    await expect(oldVault.reveal(rotated)).rejects.toThrow();
  });
});
