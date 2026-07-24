// Composition root for the Infrastructure Vault. Builds a CredentialVault from
// the Supabase-backed blob store + the env master key. Fails CLOSED when
// storage or the key is unconfigured — no silent plaintext handling.

import { Env } from '@/libs/Env';

import { SupabaseBlobStore } from './blob-store-supabase';
import { CredentialVault } from './credentials';
import { getVaultMasterKey } from './vault-env';

export function getInfrastructureVault(): CredentialVault {
  const url = Env.SUPABASE_URL;
  const key = Env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Vault storage not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
    );
  }
  return new CredentialVault(
    new SupabaseBlobStore({
      url,
      serviceKey: key,
      bucket: Env.MSI_VAULT_BUCKET || 'vault',
    }),
    getVaultMasterKey(),
  );
}
