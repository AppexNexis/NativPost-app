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

import { and, count, eq, gte, isNotNull, isNull } from 'drizzle-orm';

import { getOrgCloudinaryStorageBytes } from '@/lib/cloudinary-storage';
import { fireEmailEvent } from '@/lib/email-webhook';
import { getDb } from '@/libs/DB';
import { contentItemSchema, organizationSchema, publishingQueueSchema } from '@/models/Schema';

import {
  FREE_PLAN_FEATURES,
  FREE_PLAN_ID,
  FREE_TRIAL_DAYS,
  getEffectivePlanFeatures,
  isFreePlan,
  type PlanFeatures,
} from './plans';

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
  polarCustomerId: string | null;
  polarSubscriptionId: string | null;
  paystackCustomerCode: string | null;
  paystackSubscriptionCode: string | null;
  paymentType: string;
  billingInterval: string;
  // Computed
  isActive: boolean;
  isTrialing: boolean;
  trialDaysLeft: number;
  trialExpired: boolean;
  /** On the auto-granted $0 tier — has never subscribed. */
  isFree: boolean;
  /** Free window has lapsed and no paid subscription took over. */
  freeTrialEnded: boolean;
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
// FREE PLAN PROVISIONING
//
// Every org starts here. There is no purchase step before the
// dashboard — signup → onboarding → dashboard, on the free plan.
// -----------------------------------------------------------

export function freeTrialEndDate(from: Date = new Date()): Date {
  const endsAt = new Date(from);
  endsAt.setDate(endsAt.getDate() + FREE_TRIAL_DAYS);
  return endsAt;
}

/** The column values that put an org on the free plan. */
export function buildFreePlanRow(orgId: string) {
  return {
    id: orgId,
    plan: FREE_PLAN_ID,
    planStatus: 'trialing',
    trialEndsAt: freeTrialEndDate(),
    postsPerMonth: FREE_PLAN_FEATURES.postsPerMonth,
    platformsLimit: FREE_PLAN_FEATURES.platformsLimit,
    setupFeePaid: false,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    polarCustomerId: null,
    polarSubscriptionId: null,
    paystackCustomerCode: null,
    paystackSubscriptionCode: null,
  };
}

/**
 * Idempotently put an org on the free plan.
 *
 * Creates the row if it is missing, and repairs legacy rows still sitting
 * on the pre-free-plan `inactive` status. Orgs that have ever touched a
 * payment provider are never rewritten — their webhook state wins.
 *
 * This sits on the dashboard layout, so it runs on every navigation: the
 * settled case costs one primary-key SELECT and no writes at all.
 */
export async function ensureOrgFreePlan(orgId: string): Promise<void> {
  const db = await getDb();

  const [org] = await db
    .select({ planStatus: organizationSchema.planStatus })
    .from(organizationSchema)
    .where(eq(organizationSchema.id, orgId))
    .limit(1);

  // Settled org — nothing to do.
  if (org && org.planStatus !== 'inactive') {
    return;
  }

  if (!org) {
    await db
      .insert(organizationSchema)
      .values(buildFreePlanRow(orgId))
      .onConflictDoNothing();
    return;
  }

  // Repair path for orgs created before the free plan existed. Scoped to
  // `inactive` with no payment identifiers so it can never touch a
  // subscriber, a live trial, or a past_due account mid-recovery.
  await db
    .update(organizationSchema)
    .set({
      plan: FREE_PLAN_ID,
      planStatus: 'trialing',
      trialEndsAt: freeTrialEndDate(),
      postsPerMonth: FREE_PLAN_FEATURES.postsPerMonth,
      platformsLimit: FREE_PLAN_FEATURES.platformsLimit,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(organizationSchema.id, orgId),
        eq(organizationSchema.planStatus, 'inactive'),
        isNull(organizationSchema.stripeSubscriptionId),
        isNull(organizationSchema.polarSubscriptionId),
        isNull(organizationSchema.paystackSubscriptionCode),
      ),
    );
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
        .values(buildFreePlanRow(orgId))
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
  const isFree = isFreePlan(org.plan);

  let trialDaysLeft = 0;
  let trialExpired = false;

  if (isTrialing && trialEndsAt) {
    const msLeft = new Date(trialEndsAt).getTime() - Date.now();
    trialDaysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
    trialExpired = msLeft <= 0;
  }

  // A lapsed free window is not a lockout — the user stays signed in and
  // gets routed to /dashboard/billing. Write actions are still refused by
  // the limit checks below, which all key off isActive.
  const freeTrialEnded = isFree && trialExpired;

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
    polarCustomerId: org.polarCustomerId ?? null,
    polarSubscriptionId: org.polarSubscriptionId ?? null,
    paystackCustomerCode: org.paystackCustomerCode ?? null,
    paystackSubscriptionCode: org.paystackSubscriptionCode ?? null,
    paymentType: org.paymentType ?? 'stripe',
    billingInterval: org.billingInterval ?? 'month',
    isActive: isActive || (isTrialing && !trialExpired),
    isTrialing,
    trialDaysLeft,
    trialExpired,
    isFree,
    freeTrialEnded,
    features,
  };
}

/**
 * Why an org can't perform a billable action right now. Free users who ran
 * out the clock get upgrade copy, not "your subscription expired" — they
 * never had one.
 */
function inactiveReason(billing: OrgBillingState): string {
  if (billing.freeTrialEnded) {
    return `Your ${FREE_TRIAL_DAYS}-day free trial has ended. Choose a plan to keep publishing.`;
  }
  if (billing.planStatus === 'past_due') {
    return 'Your last payment failed. Update your payment details to restore access.';
  }
  return 'Your subscription is no longer active. Choose a plan to continue.';
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
    return { allowed: false, reason: inactiveReason(billing), upgradeRequired: true };
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
      ? `${postsPerMonth} posts on the free plan`
      : `${postsPerMonth} posts for this month`;
    return {
      allowed: false,
      reason: `You've used all ${limitLabel}. ${billing.isTrialing ? 'Upgrade to a paid plan to keep publishing.' : 'Your limit resets on the 1st. Upgrade for more.'}`,
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
    return { allowed: false, reason: inactiveReason(billing), upgradeRequired: true };
  }

  if (billing.isTrialing) {
    if (requestedPlatforms.length > 1) {
      return {
        allowed: false,
        reason: 'The free plan publishes to 1 platform per post. Upgrade to publish everywhere at once.',
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
    return { allowed: false, reason: inactiveReason(billing), upgradeRequired: true };
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
    return { allowed: false, reason: inactiveReason(billing), upgradeRequired: true };
  }

  const value = billing.features[feature];
  if (value === false) {
    const trialSuffix = billing.isFree
      ? ' Upgrade to unlock it.'
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
// MEDIA STORAGE USAGE + LIMIT
// -----------------------------------------------------------
/**
 * Total bytes of media stored by an org.
 *
 * Media lives in Cloudinary (folder `nativpost/{orgId}`) and the library lists
 * directly from there, so usage is summed from Cloudinary to match what users
 * see — not from the `media_asset` DB table, which uploads bypass.
 */
export async function getOrgStorageBytes(orgId: string): Promise<number> {
  return getOrgCloudinaryStorageBytes(orgId);
}

export type StorageCheckResult = {
  allowed: boolean;
  reason: string;
  used: number;
  limit: number;
};

/**
 * Whether an org can store `incomingBytes` more media without exceeding its
 * plan's media storage cap. `mediaStorageBytes === -1` means unlimited.
 */
export async function checkStorageLimit(
  orgId: string,
  incomingBytes: number,
): Promise<StorageCheckResult> {
  const billing = await getOrgBillingState(orgId);
  const limit = billing?.features.mediaStorageBytes ?? FREE_PLAN_FEATURES.mediaStorageBytes;

  if (limit === -1) {
    return { allowed: true, reason: '', used: 0, limit };
  }

  const used = await getOrgStorageBytes(orgId);
  const incoming = Math.max(0, incomingBytes || 0);

  if (used + incoming > limit) {
    const limitGb = (limit / (1024 * 1024 * 1024)).toFixed(limit >= 1024 * 1024 * 1024 ? 0 : 2);
    return {
      allowed: false,
      reason: `You've reached your media storage limit (${limitGb} GB). Delete some media or upgrade your plan for more storage.`,
      used,
      limit,
    };
  }

  return { allowed: true, reason: '', used, limit };
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
