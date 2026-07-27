// Add-on operations (docs §19). Cross-org read queries for the operator admin
// surface: ad campaigns awaiting spend entry, and accounts with Managed
// Community active (where operators log replies). Staff-only — the routes that
// call these live under /api/admin (middleware-gated).

import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  managedAccountSchema,
  msiAdCampaignSchema,
  msiAddonSubscriptionSchema,
} from '@/models/Schema';

export interface AdminAdCampaign {
  id: string;
  orgId: string;
  managedAccountId: string;
  accountName: string | null;
  name: string;
  platform: string;
  status: string;
  managementPct: number;
  spendCents: number;
}

/** Every ad campaign across all orgs, newest first (operator work-list). */
export async function listAllAdCampaigns(): Promise<AdminAdCampaign[]> {
  return db
    .select({
      id: msiAdCampaignSchema.id,
      orgId: msiAdCampaignSchema.orgId,
      managedAccountId: msiAdCampaignSchema.managedAccountId,
      accountName: managedAccountSchema.displayName,
      name: msiAdCampaignSchema.name,
      platform: msiAdCampaignSchema.platform,
      status: msiAdCampaignSchema.status,
      managementPct: msiAdCampaignSchema.managementPct,
      spendCents: msiAdCampaignSchema.spendCents,
    })
    .from(msiAdCampaignSchema)
    .leftJoin(
      managedAccountSchema,
      eq(msiAdCampaignSchema.managedAccountId, managedAccountSchema.id),
    )
    .orderBy(desc(msiAdCampaignSchema.createdAt));
}

export interface CommunityTarget {
  orgId: string;
  managedAccountId: string;
  accountName: string | null;
  platform: string;
}

/** Live accounts whose org has Managed Community active — operators log here. */
export async function listCommunityTargets(): Promise<CommunityTarget[]> {
  return db
    .select({
      orgId: managedAccountSchema.orgId,
      managedAccountId: managedAccountSchema.id,
      accountName: managedAccountSchema.displayName,
      platform: managedAccountSchema.platform,
    })
    .from(managedAccountSchema)
    .innerJoin(
      msiAddonSubscriptionSchema,
      and(
        eq(msiAddonSubscriptionSchema.orgId, managedAccountSchema.orgId),
        eq(msiAddonSubscriptionSchema.addonId, 'managed_community'),
        eq(msiAddonSubscriptionSchema.status, 'active'),
      ),
    )
    .where(eq(managedAccountSchema.lifecycleState, 'live'))
    .orderBy(managedAccountSchema.orgId);
}
