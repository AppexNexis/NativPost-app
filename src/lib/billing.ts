/**
 * NativPost Billing Helpers
 *
 * Server-side utilities for:
 * - Checking if an org has an active subscription
 * - Enforcing plan limits in API routes
 * - Getting current usage vs. limits
 *
 * Import these in API routes to enforce limits before processing requests.
 */

import { and, count, eq, gte } from 'drizzle-orm';

import { db } from '@/libs/DB';
import { contentItemSchema, organizationSchema } from '@/models/Schema';

import { FREE_TRIAL_DAYS, getEffectivePlanFeatures, type PlanFeatures } from './plans';

// -----------------------------------------------------------
// TYPES
// -----------------------------------------------------------
export type OrgBillingState = {
  orgId: string;
  plan: string;
  planStatus: string;
  postsPerMonth: number;
  platformsLimit: number;
  setupFeePaid: boolean;
  trialEndsAt: Date | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  paystackCustomerCode: string | null;
  paystackSubscriptionCode: string | null;
  // Computed
  isActive: boolean; // trialing or active
  isTrialing: boolean;
  trialDaysLeft: number;
  trialExpired: boolean;
  features: PlanFeatures;
};

export type LimitCheckResult =
  | { allowed: true }
  | { allowed: false; reason: string; upgradeRequired: boolean };

// -----------------------------------------------------------
// GET ORG BILLING STATE
// -----------------------------------------------------------
export async function getOrgBillingState(orgId: string): Promise<OrgBillingState | null> {
  const [org] = await db
    .select()
    .from(organizationSchema)
    .where(eq(organizationSchema.id, orgId))
    .limit(1);

  if (!org) {
    return null;
  }

  const isTrialing = org.planStatus === 'trialing';
  const isActive = org.planStatus === 'active';
  const trialEndsAt = org.trialEndsAt;

  let trialDaysLeft = 0;
  let trialExpired = false;

  if (isTrialing && trialEndsAt) {
    const msLeft = new Date(trialEndsAt).getTime() - Date.now();
    trialDaysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
    trialExpired = msLeft <= 0;
  }

  const features = getEffectivePlanFeatures(org.plan, org.planStatus);

  return {
    orgId,
    plan: org.plan,
    planStatus: org.planStatus,
    postsPerMonth: org.postsPerMonth,
    platformsLimit: org.platformsLimit,
    setupFeePaid: org.setupFeePaid,
    trialEndsAt: org.trialEndsAt ?? null,
    stripeCustomerId: org.stripeCustomerId ?? null,
    stripeSubscriptionId: org.stripeSubscriptionId ?? null,
    paystackCustomerCode: org.paystackCustomerCode ?? null,
    paystackSubscriptionCode: org.paystackSubscriptionCode ?? null,
    isActive: isActive || (isTrialing && !trialExpired),
    isTrialing,
    trialDaysLeft,
    trialExpired,
    features,
  };
}

// -----------------------------------------------------------
// SUBSCRIPTION CHECK
// Used in middleware and API routes to gate access
// -----------------------------------------------------------
export async function hasActiveSubscription(orgId: string): Promise<boolean> {
  const billing = await getOrgBillingState(orgId);
  if (!billing) {
    return false;
  }
  return billing.isActive;
}

// -----------------------------------------------------------
// CONTENT GENERATION LIMIT CHECK
// Call before allowing content generation
// -----------------------------------------------------------
export async function checkPostLimit(orgId: string): Promise<LimitCheckResult> {
  const billing = await getOrgBillingState(orgId);
  if (!billing) {
    return { allowed: false, reason: 'Organisation not found.', upgradeRequired: false };
  }
  if (!billing.isActive) {
    return { allowed: false, reason: 'Your subscription has expired. Please subscribe to continue.', upgradeRequired: true };
  }

  const { postsPerMonth } = billing.features;
  if (postsPerMonth === -1) {
    return { allowed: true };
  } // unlimited

  // Count published + pending + approved + scheduled posts created this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [result] = await db
    .select({ count: count() })
    .from(contentItemSchema)
    .where(
      and(
        eq(contentItemSchema.orgId, orgId),
        gte(contentItemSchema.createdAt, startOfMonth),
      ),
    );

  const used = result?.count ?? 0;

  if (used >= postsPerMonth) {
    return {
      allowed: false,
      reason: `You've used all ${postsPerMonth} posts for this month. Your limit resets on the 1st. Upgrade to generate more.`,
      upgradeRequired: true,
    };
  }

  return { allowed: true };
}

// -----------------------------------------------------------
// PLATFORM LIMIT CHECK
// Call before allowing platform selection in content creation
// -----------------------------------------------------------
export async function checkPlatformLimit(
  orgId: string,
  requestedPlatforms: string[],
): Promise<LimitCheckResult> {
  const billing = await getOrgBillingState(orgId);
  if (!billing) {
    return { allowed: false, reason: 'Organisation not found.', upgradeRequired: false };
  }
  if (!billing.isActive) {
    return { allowed: false, reason: 'Your subscription has expired.', upgradeRequired: true };
  }

  const { platformsLimit } = billing.features;
  if (platformsLimit === -1) {
    return { allowed: true };
  } // unlimited

  if (requestedPlatforms.length > platformsLimit) {
    return {
      allowed: false,
      reason: `Your plan supports up to ${platformsLimit} platform${platformsLimit === 1 ? '' : 's'}. You selected ${requestedPlatforms.length}. Upgrade to publish to more platforms.`,
      upgradeRequired: true,
    };
  }

  return { allowed: true };
}

// -----------------------------------------------------------
// FEATURE CHECK
// Generic check for a specific feature flag
// -----------------------------------------------------------
export async function checkFeatureAccess(
  orgId: string,
  feature: keyof PlanFeatures,
): Promise<LimitCheckResult> {
  const billing = await getOrgBillingState(orgId);
  if (!billing) {
    return { allowed: false, reason: 'Organisation not found.', upgradeRequired: false };
  }
  if (!billing.isActive) {
    return { allowed: false, reason: 'Your subscription has expired.', upgradeRequired: true };
  }

  const value = billing.features[feature];
  if (value === false) {
    return {
      allowed: false,
      reason: `This feature is not available on your current plan. Upgrade to access it.`,
      upgradeRequired: true,
    };
  }

  return { allowed: true };
}

// -----------------------------------------------------------
// GET USAGE STATS FOR BILLING PAGE
// -----------------------------------------------------------
export async function getOrgUsage(orgId: string) {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [postsThisMonth] = await db
    .select({ count: count() })
    .from(contentItemSchema)
    .where(
      and(
        eq(contentItemSchema.orgId, orgId),
        gte(contentItemSchema.createdAt, startOfMonth),
      ),
    );

  return {
    postsThisMonth: postsThisMonth?.count ?? 0,
    monthStart: startOfMonth.toISOString(),
  };
}

// -----------------------------------------------------------
// INIT ORG TRIAL
// Called when a new org is created to set trial end date
// -----------------------------------------------------------
export async function initOrgTrial(orgId: string) {
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + FREE_TRIAL_DAYS);

  await db
    .update(organizationSchema)
    .set({
      planStatus: 'trialing',
      plan: 'starter',
      trialEndsAt,
      postsPerMonth: 15,
      platformsLimit: 3,
    })
    .where(eq(organizationSchema.id, orgId));
}
