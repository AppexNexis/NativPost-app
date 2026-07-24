// Managed-account provisioning — the enforcement point for the compliance
// spine (docs §2, §4.1). `assertCanProvision` is pure and unit-tested;
// `createManagedAccount` is the DB service that composes it so that NO managed
// account row can be created without an active, in-scope authorization grant.

import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  authorizationGrantSchema,
  managedAccountSchema,
  msiActivityLogSchema,
  msiJobSchema,
  msiProvisioningOrderSchema,
  msiTaskSchema,
} from '@/models/Schema';

import { buildActivityEvent } from './audit';
import { resolveStrategy } from './execution';
import type { GrantLike, ScopeRequest } from './grant';
import { assertActiveGrant, assertGrantCoversScope, isGrantActive } from './grant';
import { transitionAccount } from './lifecycle';
import { buildProvisioningJob } from './provisioning-jobs';

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

/**
 * Move an ordered account into provisioning and spin up its create_account job.
 * Sets the execution strategy (platform default). Called by fulfilment.
 */
export async function startProvisioning(
  managedAccountId: string,
  orgId: string,
  platform: string,
  grantActive: boolean,
) {
  // Guarded transition: prereqs are satisfied at fulfilment time.
  transitionAccount('ordered', 'provisioning', {
    grantActive,
    paymentConfirmed: true,
    capacityReserved: true,
  });

  await db
    .update(managedAccountSchema)
    .set({
      lifecycleState: 'provisioning',
      executionStrategy: resolveStrategy({ executionStrategy: null, platform }),
    })
    .where(eq(managedAccountSchema.id, managedAccountId));

  const { job, tasks } = buildProvisioningJob({ orgId, managedAccountId });
  const [row] = await db
    .insert(msiJobSchema)
    .values(job)
    .returning({ id: msiJobSchema.id });
  if (row) {
    await db.insert(msiTaskSchema).values(
      tasks.map(t => ({ jobId: row.id, taskType: t.taskType, sequence: t.sequence })),
    );
    await db.insert(msiActivityLogSchema).values(
      buildActivityEvent({
        managedAccountId,
        jobId: row.id,
        actorType: 'system',
        action: 'provisioning_started',
      }),
    );
  }
}

type OrderConfig = {
  country?: string;
  platform?: string;
  niche?: string | null;
  handlePreferences?: string[];
  grantId?: string;
};

/**
 * Fulfil a pending/paid order: create the managed account(s) under the order's
 * grant and start provisioning each. The bridge from "order" to real work —
 * called by the billing webhook on payment (or manually by staff).
 */
export async function fulfillOrder(orderId: string) {
  const [order] = await db
    .select()
    .from(msiProvisioningOrderSchema)
    .where(
      and(
        eq(msiProvisioningOrderSchema.id, orderId),
        inArray(msiProvisioningOrderSchema.status, ['pending', 'paid']),
      ),
    )
    .limit(1);
  if (!order) {
    throw new Error('Order not found or not fulfillable');
  }

  const config = (order.configSnapshot ?? {}) as OrderConfig;
  if (!config.grantId || !config.country || !config.platform) {
    throw new Error('Order configuration is incomplete');
  }

  const [grant] = await db
    .select()
    .from(authorizationGrantSchema)
    .where(eq(authorizationGrantSchema.id, config.grantId))
    .limit(1);
  if (!grant) {
    throw new Error('Authorization grant not found');
  }

  const created: string[] = [];
  for (let i = 0; i < order.quantity; i++) {
    // eslint-disable-next-line no-await-in-loop
    const account = await createManagedAccount({
      orgId: order.orgId,
      brandProfileId: grant.brandProfileId,
      grantId: grant.id,
      platform: config.platform,
      country: config.country,
      niche: config.niche ?? undefined,
      handlePreferences: config.handlePreferences ?? [],
      orderId: order.id,
    });
    // eslint-disable-next-line no-await-in-loop
    await startProvisioning(account.id, order.orgId, config.platform, isGrantActive(grant));
    created.push(account.id);
  }

  await db
    .update(msiProvisioningOrderSchema)
    .set({ status: 'fulfilling', paidAt: order.paidAt ?? new Date() })
    .where(eq(msiProvisioningOrderSchema.id, orderId));

  return created;
}
