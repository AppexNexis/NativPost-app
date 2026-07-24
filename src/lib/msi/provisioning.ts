// Managed-account provisioning — the enforcement point for the compliance
// spine (docs §2, §4.1). `assertCanProvision` is pure and unit-tested;
// `createManagedAccount` is the DB service that composes it so that NO managed
// account row can be created without an active, in-scope authorization grant.

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  authorizationGrantSchema,
  managedAccountSchema,
  msiActivityLogSchema,
} from '@/models/Schema';

import { buildActivityEvent } from './audit';
import type { GrantLike, ScopeRequest } from './grant';
import { assertActiveGrant, assertGrantCoversScope } from './grant';

export type ProvisionRequest = {
  orgId: string;
  brandProfileId: string;
  grantId: string;
  platform: string;
  country: string;
  niche?: string;
  targetLocale?: string;
  handlePreferences?: string[];
  orderId?: string;
};

/**
 * Pure gate: an account may only be provisioned under an active grant that
 * covers the requested platform + country. Narrows away null/undefined.
 */
export function assertCanProvision<T extends GrantLike>(
  grant: T | null | undefined,
  req: ScopeRequest,
): asserts grant is T {
  assertActiveGrant(grant);
  assertGrantCoversScope(grant, req);
}

/**
 * Create a managed account. Loads the grant, enforces the gate, inserts the
 * row, and writes the first audit event — all keyed to a real brand + grant.
 */
export async function createManagedAccount(req: ProvisionRequest) {
  const [grant] = await db
    .select()
    .from(authorizationGrantSchema)
    .where(
      and(
        eq(authorizationGrantSchema.id, req.grantId),
        eq(authorizationGrantSchema.orgId, req.orgId),
      ),
    )
    .limit(1);

  // Throws GrantRequiredError if missing, revoked, or out of scope.
  assertCanProvision(grant, req);

  const [account] = await db
    .insert(managedAccountSchema)
    .values({
      orgId: req.orgId,
      brandProfileId: req.brandProfileId,
      authorizationGrantId: grant.id,
      orderId: req.orderId,
      platform: req.platform,
      country: req.country,
      targetLocale: req.targetLocale,
      niche: req.niche,
      handlePreferences: req.handlePreferences ?? [],
    })
    .returning();

  if (!account) {
    throw new Error('failed to create managed account');
  }

  await db.insert(msiActivityLogSchema).values(
    buildActivityEvent({
      managedAccountId: account.id,
      actorType: 'system',
      action: 'account_ordered',
      detail: {
        platform: req.platform,
        country: req.country,
        orderId: req.orderId ?? null,
      },
    }),
  );

  return account;
}
