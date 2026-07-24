// Composition-root helper: read the MSI vault master key from the environment.
// Kept separate from ./vault.ts so the pure crypto stays free of `Env` (and its
// import-time validation), which keeps the vault unit tests isolated.

import { Buffer } from 'node:buffer';

import { Env } from '@/libs/Env';

/**
 * The vault master key (KEK), decoded to a Buffer. FAILS CLOSED: throws when
 * MSI_VAULT_MASTER_KEY is unset so no credential can be sealed or revealed
 * without a configured key (docs §9).
 */
export function getVaultMasterKey(): Buffer {
  const raw = Env.MSI_VAULT_MASTER_KEY;
  if (!raw) {
    throw new Error(
      'MSI_VAULT_MASTER_KEY is not set — the credential vault is unavailable (fail closed).',
    );
  }
  return Buffer.from(raw, 'base64');
}
