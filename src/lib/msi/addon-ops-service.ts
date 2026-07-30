// Add-on operations (docs §19). Cross-org read queries for the operator admin
// surface: ad campaigns awaiting spend entry, and accounts with Managed
// Community active (where operators log replies). Staff-only — the routes that
// call these live under /api/admin (middleware-gated).

import { and, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  managedAccountSchema,
  msiAdCampaignSchema,
  msiAddonSubscriptionSchema,
  msiAnalyticsReportSchema,
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

export interface ReviewReport {
  id: string;
  orgId: string;
  managedAccountId: string;
  accountName: string | null;
  billingPeriod: string;
  headline: string;
}

/** Analytics reports awaiting operator delivery (status in_review), newest first. */
export async function listReportsForReview(): Promise<ReviewReport[]> {
  const rows = await db
    .select({
      id: msiAnalyticsReportSchema.id,
      orgId: msiAnalyticsReportSchema.orgId,
      managedAccountId: msiAnalyticsReportSchema.managedAccountId,
      accountName: managedAccountSchema.displayName,
      billingPeriod: msiAnalyticsReportSchema.billingPeriod,
      summary: msiAnalyticsReportSchema.summary,
    })
    .from(msiAnalyticsReportSchema)
    .leftJoin(
      managedAccountSchema,
      eq(msiAnalyticsReportSchema.managedAccountId, managedAccountSchema.id),
    )
    .where(eq(msiAnalyticsReportSchema.status, 'in_review'))
    .orderBy(desc(msiAnalyticsReportSchema.createdAt));

  return rows.map(r => ({
    id: r.id,
    orgId: r.orgId,
    managedAccountId: r.managedAccountId,
    accountName: r.accountName,
    billingPeriod: r.billingPeriod,
    headline: ((r.summary ?? {}) as { headline?: string }).headline ?? 'Monthly report',
  }));
}

// High-touch, quote-priced add-ons: activation is a request the team follows up
// on with a quote (no self-serve fulfilment).
const QUOTE_ADDONS = ['managed_influencer', 'managed_localization', 'managed_recovery'];

export interface ServiceRequest {
  orgId: string;
  addonId: string;
  activatedAt: Date | null;
}

/** Orgs that requested a quote-priced add-on (operator follow-up list). */
export async function listServiceRequests(): Promise<ServiceRequest[]> {
  return db
    .select({
      orgId: msiAddonSubscriptionSchema.orgId,
      addonId: msiAddonSubscriptionSchema.addonId,
      activatedAt: msiAddonSubscriptionSchema.activatedAt,
    })
    .from(msiAddonSubscriptionSchema)
    .where(
      and(
        eq(msiAddonSubscriptionSchema.status, 'active'),
        inArray(msiAddonSubscriptionSchema.addonId, QUOTE_ADDONS),
      ),
    )
    .orderBy(desc(msiAddonSubscriptionSchema.activatedAt));
}
