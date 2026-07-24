// Account credential capture + reveal (docs §9). Stores an account's login in
// the vault (ciphertext → Supabase, wrapped DEK → msi_credential) and reveals
// it on off-board. The plaintext never lands in Postgres.

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { msiActivityLogSchema, msiCredentialSchema } from '@/models/Schema';

import { buildActivityEvent } from './audit';
import { getInfrastructureVault } from './vault-config';

/** Seal an account's credentials into the vault (upsert one row per account). */
export async function storeAccountCredentials(
  managedAccountId: string,
  secret: string,
  byUserId: string,
) {
  const vault = getInfrastructureVault();
  const { vaultRef, encryptedDek } = await vault.protect(secret, 'managed-account');

  const [existing] = await db
    .select({ id: msiCredentialSchema.id })
    .from(msiCredentialSchema)
    .where(eq(msiCredentialSchema.managedAccountId, managedAccountId))
    .limit(1);

  if (existing) {
    await db
      .update(msiCredentialSchema)
      .set({
        vaultRef,
        encryptedDek,
        custodyState: 'nativpost_operating',
        lastRotatedAt: new Date(),
      })
      .where(eq(msiCredentialSchema.managedAccountId, managedAccountId));
  } else {
    await db.insert(msiCredentialSchema).values({
      managedAccountId,
      vaultRef,
      encryptedDek,
      custodyState: 'nativpost_operating',
    });
  }

  await db.insert(msiActivityLogSchema).values(
    buildActivityEvent({
      managedAccountId,
      actorType: 'operator',
      actorId: byUserId,
      action: 'credentials_stored',
    }),
  );
}

/** Reveal an account's credentials (needs the blob + wrapped DEK + key). */
export async function revealAccountCredentials(
  managedAccountId: string,
): Promise<string | null> {
  const [cred] = await db
    .select({
      vaultRef: msiCredentialSchema.vaultRef,
      encryptedDek: msiCredentialSchema.encryptedDek,
    })
    .from(msiCredentialSchema)
    .where(eq(msiCredentialSchema.managedAccountId, managedAccountId))
    .limit(1);
  if (!cred || !cred.encryptedDek) {
    return null;
  }
  const vault = getInfrastructureVault();
  return vault.reveal({ vaultRef: cred.vaultRef, encryptedDek: cred.encryptedDek });
}
