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

import { fireEmailEvent } from '@/lib/email-webhook';
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
  paymentType: string;
  billingInterval: string;
  // Computed
  isActive: boolean;
  isTrialing: boolean;
  trialDaysLeft: number;
  trialExpired: boolean;
  features: PlanFeatures;
};

export type LimitCheckResult =
  | { allowed: true }
  | { allowed: false; reason: string; upgradeRequired: boolean };

// -----------------------------------------------------------
// FALLBACK HELPERS
// Called when the Clerk webhook was missed or delayed.
// These are lazy — they only run once per org per process lifetime,
// guarded by the Set below so they never fire on every request.
// -----------------------------------------------------------

const fallbackRanForOrg = new Set<string>();

async function runMissedWebhookFallbacks(orgId: string): Promise<void> {
  if (fallbackRanForOrg.has(orgId)) {
    return;
  }
  fallbackRanForOrg.add(orgId);

  console.log(`[Billing Fallback] Running missed webhook fallbacks for org ${orgId}`);

  // Run both in parallel — fully independent
  await Promise.allSettled([
    runAdminMembershipFallback(orgId),
    runWelcomeEmailFallback(orgId),
  ]);
}

/**
 * Ensure NativPost admin (admin@nativpost.com) is a member of the org.
 * Delegates to the shared helper in the Clerk webhook route.
 * Idempotent — 422 Already a member is handled gracefully.
 */
async function runAdminMembershipFallback(orgId: string): Promise<void> {
  try {
    const { ensureNativPostAdminInOrg } = await import('@/lib/clerk-org-helpers');
    await ensureNativPostAdminInOrg(orgId);
  } catch (err) {
    console.error(`[Billing Fallback] ensureNativPostAdminInOrg failed for org ${orgId}:`, err);
  }
}

/**
 * Fire the welcome email sequence for the org's creator.
 * The email tool deduplicates enrollments via UNIQUE KEY — safe to call more than once.
 */
async function runWelcomeEmailFallback(orgId: string): Promise<void> {
  try {
    const { fireWelcomeEmailForOrg } = await import('@/lib/clerk-org-helpers');
    await fireWelcomeEmailForOrg(orgId);
  } catch (err) {
    console.error(`[Billing Fallback] fireWelcomeEmailForOrg failed for org ${orgId}:`, err);
  }
}

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
  // Creates the org row AND runs all the side-effects the webhook
  // should have handled: admin membership + welcome email sequence.
  // -----------------------------------------------------------
  if (!org) {
    console.warn(`[Billing] Org ${orgId} not found in DB — creating fallback row`);

    try {
      await db
        .insert(organizationSchema)
        .values({
          id: orgId,
          plan: 'starter',
          planStatus: 'inactive',
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

    // Re-fetch after insert
    [org] = await db
      .select()
      .from(organizationSchema)
      .where(eq(organizationSchema.id, orgId))
      .limit(1);

    // Fire-and-forget — never slow down the billing check for this
    if (org) {
      runMissedWebhookFallbacks(orgId).catch(err =>
        console.error('[Billing] Fallback side-effects error:', err),
      );
    }
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
    paymentType: org.paymentType ?? 'stripe',
    billingInterval: org.billingInterval ?? 'month',
    isActive: isActive || (isTrialing && !trialExpired),
    isTrialing,
    trialDaysLeft,
    trialExpired,
    features,
  };
}

// -----------------------------------------------------------
// SUBSCRIPTION CHECK
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
  }

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
    const trialSuffix = billing.isTrialing
      ? ' Subscribe to unlock this feature.'
      : ' Upgrade your plan to access it.';
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
// -----------------------------------------------------------
export async function getOrgUsage(orgId: string) {
  const db = await getDb();
  const billing = await getOrgBillingState(orgId);

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
// Called when setup fee is paid to start the trial.
// Welcome email was already fired at org creation — no duplicate needed.
// -----------------------------------------------------------
export async function initOrgTrial(orgId: string) {
  const db = await getDb();
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + FREE_TRIAL_DAYS);

  await db
    .update(organizationSchema)
    .set({
      planStatus: 'trialing',
      plan: 'starter',
      trialEndsAt,
      postsPerMonth: TRIAL_FEATURES.postsPerMonth,
      platformsLimit: TRIAL_FEATURES.platformsLimit,
    })
    .where(eq(organizationSchema.id, orgId));

  console.log(`[initOrgTrial] Trial started for org ${orgId}, ends at ${trialEndsAt.toISOString()}`);
}

// -----------------------------------------------------------
// FIRE PLAN UPGRADED EMAIL
// Call this after a Stripe/Paystack subscription is activated.
// Exported so webhook routes can call it directly.
// -----------------------------------------------------------
export async function firePlanUpgradedEmail(email: string, plan: string): Promise<void> {
  try {
    await fireEmailEvent('plan.upgraded', { email, plan });
    console.log(`[Email] plan.upgraded fired for ${email} → ${plan}`);
  } catch (err) {
    console.error('[Email] plan.upgraded failed (non-fatal):', err);
  }
}

// -----------------------------------------------------------
// FIRE SUBSCRIPTION CANCELLED EMAIL
// Call this after a Stripe/Paystack subscription is cancelled.
// -----------------------------------------------------------
export async function fireSubscriptionCancelledEmail(email: string): Promise<void> {
  try {
    await fireEmailEvent('subscription.cancelled', { email });
    console.log(`[Email] subscription.cancelled fired for ${email}`);
  } catch (err) {
    console.error('[Email] subscription.cancelled failed (non-fatal):', err);
  }
}
