// Credential vault service (docs §9). Composes the envelope crypto (./vault)
// with a pluggable blob store. The security property: the ciphertext blob and
// the wrapped DEK are stored SEPARATELY — the blob in the store (vaultRef), the
// wrapped DEK in the DB (msi_credential.encrypted_dek). Revealing a secret
// requires BOTH plus the master key, so a leak of any single store is not
// enough. Pure of `db`/`Env`; the master key and store are injected.

import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';

import type { SealedSecret } from './vault';
import { openSecret, rewrapDek, sealSecret } from './vault';

/** The ciphertext half of a sealed secret — lives in the blob store. */
export type CredentialBlob = Pick<
  SealedSecret,
  'v' | 'ciphertext' | 'iv' | 'authTag'
>;

/** The wrapped-DEK half — lives in the DB (msi_credential.encrypted_dek). */
type WrappedDek = Pick<SealedSecret, 'wrappedDek' | 'dekIv' | 'dekAuthTag'>;

/** Fields persisted on the msi_credential row. Never contains plaintext. */
export type ProtectedCredential = {
  vaultRef: string;
  encryptedDek: string;
};

/**
 * Namespaces in the Infrastructure Vault — MSI managed accounts are the first
 * consumer; future products (email, phone numbers, domains, exports) get their
 * own namespace so storage never has to be reorganized. The vaultRef is
 * `${namespace}/${uuid}`, stored at `vault/${namespace}/${uuid}.blob`.
 */
export type VaultNamespace =
  | 'managed-account'
  | 'authorization'
  | 'recovery'
  | 'exports';

export type SealedBlobStore = {
  put: (ref: string, blob: CredentialBlob) => Promise<void>;
  get: (ref: string) => Promise<CredentialBlob | null>;
};

/**
 * In-memory blob store for dev/tests. Production wires an external secrets
 * vault / object store here (Phase 3 infra — docs §17).
 */
export class InMemorySealedBlobStore implements SealedBlobStore {
  private readonly store = new Map<string, CredentialBlob>();

  async put(ref: string, blob: CredentialBlob): Promise<void> {
    this.store.set(ref, blob);
  }

  async get(ref: string): Promise<CredentialBlob | null> {
    return this.store.get(ref) ?? null;
  }
}

function encodeDek(w: WrappedDek): string {
  return Buffer.from(JSON.stringify(w), 'utf8').toString('base64');
}

function decodeDek(encoded: string): WrappedDek {
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as WrappedDek;
}

export class CredentialVault {
  constructor(
    private readonly blobStore: SealedBlobStore,
    private readonly masterKey: Buffer,
  ) {}

  /**
   * Seal a secret. Stores the ciphertext blob and returns the two fields to
   * persist on the msi_credential row. The plaintext is discarded here.
   */
  async protect(
    secret: string,
    namespace: VaultNamespace = 'managed-account',
  ): Promise<ProtectedCredential> {
    const sealed = sealSecret(secret, this.masterKey);
    const vaultRef = `${namespace}/${randomUUID()}`;
    await this.blobStore.put(vaultRef, {
      v: sealed.v,
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      authTag: sealed.authTag,
    });
    return { vaultRef, encryptedDek: encodeDek(sealed) };
  }

  /** Reveal the plaintext — needs the blob AND the wrapped DEK AND the key. */
  async reveal(cred: ProtectedCredential): Promise<string> {
    const blob = await this.blobStore.get(cred.vaultRef);
    if (!blob) {
      throw new Error(`sealed credential blob not found: ${cred.vaultRef}`);
    }
    return openSecret({ ...blob, ...decodeDek(cred.encryptedDek) }, this.masterKey);
  }

  /**
   * Rotate the master key for one credential: re-wrap the DEK only. Returns the
   * new `encryptedDek` to persist. The blob (ciphertext) is unchanged.
   */
  async rotateMasterKey(
    cred: ProtectedCredential,
    newMasterKey: Buffer,
  ): Promise<string> {
    const blob = await this.blobStore.get(cred.vaultRef);
    if (!blob) {
      throw new Error(`sealed credential blob not found: ${cred.vaultRef}`);
    }
    const rewrapped = rewrapDek(
      { ...blob, ...decodeDek(cred.encryptedDek) },
      this.masterKey,
      newMasterKey,
    );
    return encodeDek(rewrapped);
  }
}
