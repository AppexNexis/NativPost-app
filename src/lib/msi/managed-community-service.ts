// Managed Community service (docs §19). Status/quota for the customer, and a
// reply-logging action for operators. Usage = sum of logged replies this month,
// counted against the tier's quota.

import { and, eq, gte, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { managedAccountSchema, msiCommunityReplySchema } from '@/models/Schema';

import { getOrgAddon } from './addon-service';
import { communityQuotaForTier, isUnlimited, remainingReplies } from './managed-community';

const COMMUNITY_ADDON = 'managed_community';

export type CommunityStatus =
  | { active: false }
  | {
      active: true;
      tierId: string | null;
      quota: number;
      unlimited: boolean;
      used: number;
      remaining: number | null; // null = unlimited
    };

function monthStartUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Total replies logged for an org this month. */
export async function countRepliesThisPeriod(orgId: string, now: Date = new Date()): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${msiCommunityReplySchema.count}), 0)` })
    .from(msiCommunityReplySchema)
    .where(
      and(
        eq(msiCommunityReplySchema.orgId, orgId),
        gte(msiCommunityReplySchema.loggedAt, monthStartUtc(now)),
      ),
    );
  return Number(row?.total ?? 0);
}

export async function getCommunityStatus(orgId: string, now: Date = new Date()): Promise<CommunityStatus> {
  const sub = await getOrgAddon(orgId, COMMUNITY_ADDON);
  if (!sub || sub.status !== 'active') {
    return { active: false };
  }
  const quota = communityQuotaForTier(sub.tierId) ?? 0;
  const unlimited = isUnlimited(quota);
  const used = await countRepliesThisPeriod(orgId, now);
  const remaining = remainingReplies(quota, used);
  return {
    active: true,
    tierId: sub.tierId,
    quota,
    unlimited,
    used,
    remaining: unlimited ? null : remaining,
  };
}

export type LogOutcome =
  | { ok: true; logged: number }
  | { ok: false; error: string };

/** Operator logs handled replies for an account (increments monthly usage). */
export async function logReplies(input: {
  orgId: string;
  managedAccountId: string;
  count: number;
  note?: string;
}): Promise<LogOutcome> {
  if (!Number.isInteger(input.count) || input.count <= 0) {
    return { ok: false, error: 'count must be a positive integer' };
  }
  const [account] = await db
    .select({ id: managedAccountSchema.id })
    .from(managedAccountSchema)
    .where(
      and(
        eq(managedAccountSchema.id, input.managedAccountId),
        eq(managedAccountSchema.orgId, input.orgId),
      ),
    )
    .limit(1);
  if (!account) {
    return { ok: false, error: 'Managed account not found' };
  }
  await db.insert(msiCommunityReplySchema).values({
    orgId: input.orgId,
    managedAccountId: input.managedAccountId,
    count: input.count,
    note: input.note,
  });
  return { ok: true, logged: input.count };
}
