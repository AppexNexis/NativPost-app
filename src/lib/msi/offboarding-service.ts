// Off-boarding DB service (docs §9.2). Dual-authorized: the customer requests
// (sets custody transfer_requested), then staff releases (archives + rotates).
// The credential rotation + secure handoff is performed by the external vault
// (recorded here in the audit trail).

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  managedAccountSchema,
  msiActivityLogSchema,
  socialAccountSchema,
} from '@/models/Schema';

import { buildActivityEvent } from './audit';
import type { AccountState } from './lifecycle';
import { transitionAccount } from './lifecycle';
import { canOffboard } from './offboarding';

/** Customer requests off-boarding of their managed account. */
export async function requestOffboard(
  accountId: string,
  orgId: string,
  userId: string,
) {
  const [account] = await db
    .select({
      id: managedAccountSchema.id,
      lifecycleState: managedAccountSchema.lifecycleState,
    })
    .from(managedAccountSchema)
    .where(and(eq(managedAccountSchema.id, accountId), eq(managedAccountSchema.orgId, orgId)))
    .limit(1);
  if (!account) {
    throw new Error('Account not found');
  }
  if (!canOffboard(account.lifecycleState)) {
    throw new Error('This account cannot be off-boarded in its current state');
  }

  await db
    .update(managedAccountSchema)
    .set({ credentialCustody: 'transfer_requested' })
    .where(eq(managedAccountSchema.id, accountId));
  await db.insert(msiActivityLogSchema).values(
    buildActivityEvent({
      managedAccountId: accountId,
      actorType: 'customer',
      actorId: userId,
      action: 'offboard_requested',
    }),
  );
  return { credentialCustody: 'transfer_requested' as const };
}

/** Staff releases a requested off-board: archive + deactivate + hand over. */
export async function releaseAccount(accountId: string, staffUserId: string) {
  const [account] = await db
    .select({
      id: managedAccountSchema.id,
      lifecycleState: managedAccountSchema.lifecycleState,
      credentialCustody: managedAccountSchema.credentialCustody,
      socialAccountId: managedAccountSchema.socialAccountId,
    })
    .from(managedAccountSchema)
    .where(eq(managedAccountSchema.id, accountId))
    .limit(1);
  if (!account) {
    throw new Error('Account not found');
  }
  if (account.credentialCustody !== 'transfer_requested') {
    throw new Error('No pending off-board request for this account');
  }

  const next = transitionAccount(account.lifecycleState as AccountState, 'archived');
  await db
    .update(managedAccountSchema)
    .set({ lifecycleState: next, credentialCustody: 'released' })
    .where(eq(managedAccountSchema.id, accountId));

  if (account.socialAccountId) {
    await db
      .update(socialAccountSchema)
      .set({ isActive: false })
      .where(eq(socialAccountSchema.id, account.socialAccountId));
  }

  await db.insert(msiActivityLogSchema).values(
    buildActivityEvent({
      managedAccountId: accountId,
      actorType: 'system',
      actorId: staffUserId,
      action: 'credentials_released',
      detail: { note: 'credential rotation + secure handoff performed by the vault' },
    }),
  );
  return { state: next };
}
