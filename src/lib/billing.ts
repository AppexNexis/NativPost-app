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

import { and, count, eq, gte, isNotNull } from 'drizzle-orm';

// import { db } from '@/libs/DB';
import { getDb } from '@/libs/DB';
import { contentItemSchema, organizationSchema, publishingQueueSchema } from '@/models/Schema';

import { FREE_TRIAL_DAYS, getEffectivePlanFeatures, type PlanFeatures, TRIAL_FEATURES } from './plans';

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
  const db = await getDb();

  let [org] = await db
    .select()
    .from(organizationSchema)
    .where(eq(organizationSchema.id, orgId))
    .limit(1);

  // -----------------------------------------------------------
  // FALLBACK: Org missing (webhook failed or delayed)
  // -----------------------------------------------------------
  if (!org) {
    console.warn(`[Billing] Org ${orgId} not found in DB — creating fallback row`);

    try {
      await db
        .insert(organizationSchema)
        .values({
          id: orgId,
          plan: 'starter',
          planStatus: 'inactive', // important: DO NOT set trial here
          postsPerMonth: 0,
          platformsLimit: 0,
          setupFeePaid: false,
          trialEndsAt: null,
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          paystackCustomerCode: null,
          paystackSubscriptionCode: null,
        })
        .onConflictDoNothing();
    } catch (error) {
      console.error('[Billing] Failed to create fallback org:', error);
    }

    // Re-fetch after insert attempt
    [org] = await db
      .select()
      .from(organizationSchema)
      .where(eq(organizationSchema.id, orgId))
      .limit(1);
  }

  // Still no org → real DB issue
  if (!org) {
    console.error(`[Billing] Org ${orgId} still not found after fallback`);
    return null;
  }

  // -----------------------------------------------------------
  // BILLING LOGIC
  // -----------------------------------------------------------
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

    // Important: active includes valid trial
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
//
// Post quota is counted per PUBLISHED platform delivery:
//   - A post published to Instagram + LinkedIn = 2 posts used
//   - A draft or pending post = 0 posts used
//
// For trialing orgs: quota counts all published deliveries
// since the trial started (not just this calendar month).
// -----------------------------------------------------------
export async function checkPostLimit(orgId: string): Promise<LimitCheckResult> {
  const db = await getDb();
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

  // Determine the count window:
  // - Trialing orgs: count from trial start (trialEndsAt - 7 days)
  // - Active orgs: count from start of current calendar month
  let windowStart: Date;
  if (billing.isTrialing && billing.trialEndsAt) {
    windowStart = new Date(billing.trialEndsAt);
    windowStart.setDate(windowStart.getDate() - FREE_TRIAL_DAYS);
    windowStart.setHours(0, 0, 0, 0);
  } else {
    windowStart = new Date();
    windowStart.setDate(1);
    windowStart.setHours(0, 0, 0, 0);
  }

  // Count per-platform published deliveries in the window
  const [result] = await db
    .select({ count: count() })
    .from(publishingQueueSchema)
    .innerJoin(contentItemSchema, eq(publishingQueueSchema.contentItemId, contentItemSchema.id))
    .where(
      and(
        eq(contentItemSchema.orgId, orgId),
        eq(publishingQueueSchema.status, 'published'),
        isNotNull(publishingQueueSchema.publishedAt),
        gte(publishingQueueSchema.publishedAt, windowStart),
      ),
    );

  const used = result?.count ?? 0;

  if (used >= postsPerMonth) {
    const limitLabel = billing.isTrialing
      ? `${postsPerMonth} posts for your trial`
      : `${postsPerMonth} posts for this month`;
    return {
      allowed: false,
      reason: `You've used all ${limitLabel}. ${billing.isTrialing ? 'Subscribe to a plan to continue.' : 'Your limit resets on the 1st. Upgrade for more.'}`,
      upgradeRequired: true,
    };
  }

  return { allowed: true };
}

// -----------------------------------------------------------
// PLATFORMS-PER-POST CHECK
//
// Separate from "how many accounts can be connected" —
// this checks how many platforms a SINGLE post can target.
//
// Trial rule: max 1 platform per post.
// Paid rule: up to plan's platformsLimit.
// -----------------------------------------------------------
export async function checkPlatformsPerPost(
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

  // Trial: max 1 platform per post
  if (billing.isTrialing) {
    if (requestedPlatforms.length > 1) {
      return {
        allowed: false,
        reason: 'During your trial, you can only publish to 1 platform per post. Subscribe to publish to multiple platforms.',
        upgradeRequired: true,
      };
    }
    return { allowed: true };
  }

  const { platformsLimit } = billing.features;
  if (platformsLimit === -1) {
    return { allowed: true };
  }

  if (requestedPlatforms.length > platformsLimit) {
    return {
      allowed: false,
      reason: `Your plan supports up to ${platformsLimit} platform${platformsLimit === 1 ? '' : 's'} per post. You selected ${requestedPlatforms.length}. Upgrade to publish to more platforms.`,
      upgradeRequired: true,
    };
  }

  return { allowed: true };
}

// -----------------------------------------------------------
// PLATFORM CONNECTION LIMIT CHECK
// How many social accounts an org can connect in total.
// Trial: 2 connections max. Paid: per plan.
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
  }

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
    const trialSuffix = billing.isTrialing ? ' Subscribe to unlock this feature.' : ' Upgrade your plan to access it.';
    return {
      allowed: false,
      reason: `This feature is not available on your current plan.${trialSuffix}`,
      upgradeRequired: true,
    };
  }

  return { allowed: true };
}

// -----------------------------------------------------------
// GET USAGE STATS FOR BILLING PAGE
// Counts per published platform deliveries, not raw content items
// -----------------------------------------------------------
export async function getOrgUsage(orgId: string) {
  const db = await getDb();

  const billing = await getOrgBillingState(orgId);

  // Window: trial start or calendar month start
  let windowStart: Date;
  if (billing?.isTrialing && billing.trialEndsAt) {
    windowStart = new Date(billing.trialEndsAt);
    windowStart.setDate(windowStart.getDate() - FREE_TRIAL_DAYS);
    windowStart.setHours(0, 0, 0, 0);
  } else {
    windowStart = new Date();
    windowStart.setDate(1);
    windowStart.setHours(0, 0, 0, 0);
  }

  const [result] = await db
    .select({ count: count() })
    .from(publishingQueueSchema)
    .innerJoin(contentItemSchema, eq(publishingQueueSchema.contentItemId, contentItemSchema.id))
    .where(
      and(
        eq(contentItemSchema.orgId, orgId),
        eq(publishingQueueSchema.status, 'published'),
        isNotNull(publishingQueueSchema.publishedAt),
        gte(publishingQueueSchema.publishedAt, windowStart),
      ),
    );

  return {
    postsThisMonth: result?.count ?? 0,
    monthStart: windowStart.toISOString(),
  };
}

// -----------------------------------------------------------
// INIT ORG TRIAL
// Called when a new org is created to set trial end date
// -----------------------------------------------------------
export async function initOrgTrial(orgId: string) {
  const db = await getDb();
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + FREE_TRIAL_DAYS);

  await db
    .update(organizationSchema)
    .set({
      planStatus: 'trialing',
      plan: 'starter', // trial always shows as starter
      trialEndsAt,
      // Trial limits — 2 connectable platforms, 3 posts
      postsPerMonth: TRIAL_FEATURES.postsPerMonth,
      platformsLimit: TRIAL_FEATURES.platformsLimit,
    })
    .where(eq(organizationSchema.id, orgId));
}
