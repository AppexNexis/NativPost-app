// Production SealedBlobStore backed by Supabase Storage (docs §9). The
// ciphertext blob lives in a PRIVATE bucket, separate from Postgres (which
// holds only the wrapped DEK) — so a leak of either store alone reveals
// nothing. Uses the Storage REST API via fetch (no SDK dependency). The
// SealedBlobStore interface is unchanged, so this can later be swapped for an
// S3/R2 implementation without touching the vault logic.
//
// Setup (yours): create a PRIVATE bucket (default name `vault`) and set
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. The service role key bypasses RLS;
// it must never be exposed to the client.

import type { CredentialBlob, SealedBlobStore } from './credentials';

export type SupabaseVaultConfig = {
  url: string;
  serviceKey: string;
  bucket: string;
};

/** Object path within the bucket for a vaultRef (`${namespace}/${uuid}`). */
export function vaultObjectPath(ref: string): string {
  return `${ref}.blob`;
}

export class SupabaseBlobStore implements SealedBlobStore {
  constructor(private readonly config: SupabaseVaultConfig) {}

  private endpoint(ref: string): string {
    const base = this.config.url.replace(/\/$/, '');
    return `${base}/storage/v1/object/${this.config.bucket}/${vaultObjectPath(ref)}`;
  }

  async put(ref: string, blob: CredentialBlob): Promise<void> {
    const res = await fetch(this.endpoint(ref), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.serviceKey}`,
        // The blob is JSON, but we send it as an opaque octet-stream so a
        // MIME-restricted bucket (allowed: application/octet-stream) accepts
        // it. We parse the body ourselves on read, so the stored content-type
        // is irrelevant.
        'Content-Type': 'application/octet-stream',
        'x-upsert': 'true',
        'cache-control': 'no-store',
      },
      body: JSON.stringify(blob),
    });
    if (!res.ok) {
      throw new Error(`Vault put failed (${res.status})`);
    }
  }

  async get(ref: string): Promise<CredentialBlob | null> {
    const res = await fetch(this.endpoint(ref), {
      headers: { Authorization: `Bearer ${this.config.serviceKey}` },
    });
    if (res.status === 404 || res.status === 400) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`Vault get failed (${res.status})`);
    }
    return (await res.json()) as CredentialBlob;
  }
}
