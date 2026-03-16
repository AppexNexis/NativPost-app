/**
 * NativPost Plan Enforcement
 *
 * Checks org usage against plan limits before allowing:
 * - Content generation (posts per month)
 * - Platform connections (platforms limit)
 * - Feature access (analytics level, etc.)
 *
 * Called from API routes before performing gated actions.
 */

import { and, eq, gte, sql } from 'drizzle-orm';

import { db } from '@/libs/DB';
import {
  contentItemSchema,
  organizationSchema,
  socialAccountSchema,
} from '@/models/Schema';
import { FREE_TRIAL_DAYS, PLANS } from '@/lib/plans';

interface UsageCheck {
  allowed: boolean;
  reason?: string;
  current: number;
  limit: number;
  plan: string;
}

/**
 * Check if the org can create more content this month.
 */
export async function checkPostLimit(orgId: string): Promise<UsageCheck> {
  const org = await getOrg(orgId);
  if (!org) return deny('Organization not found', 0, 0, 'unknown');

  // Check trial expiry
  const trialCheck = checkTrialStatus(org);
  if (!trialCheck.allowed) return trialCheck;

  const plan = PLANS[org.plan] || PLANS['starter']!;
  const limit = plan.postsPerMonth;

  // Count posts created this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(contentItemSchema)
    .where(
      and(
        eq(contentItemSchema.orgId, orgId),
        gte(contentItemSchema.createdAt, startOfMonth),
      ),
    );

  const current = Number(result?.count || 0);

  if (current >= limit) {
    return deny(
      `You've reached your ${plan.name} plan limit of ${limit} posts/month. Upgrade for more.`,
      current,
      limit,
      org.plan,
    );
  }

  return { allowed: true, current, limit, plan: org.plan };
}

/**
 * Check if the org can connect more social platforms.
 */
export async function checkPlatformLimit(orgId: string): Promise<UsageCheck> {
  const org = await getOrg(orgId);
  if (!org) return deny('Organization not found', 0, 0, 'unknown');

  const trialCheck = checkTrialStatus(org);
  if (!trialCheck.allowed) return trialCheck;

  const plan = PLANS[org.plan] || PLANS['starter']!;
  const limit = plan.platformsLimit;

  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(socialAccountSchema)
    .where(
      and(
        eq(socialAccountSchema.orgId, orgId),
        eq(socialAccountSchema.isActive, true),
      ),
    );

  const current = Number(result?.count || 0);

  if (current >= limit) {
    return deny(
      `You've reached your ${plan.name} plan limit of ${limit} connected platforms. Upgrade for more.`,
      current,
      limit,
      org.plan,
    );
  }

  return { allowed: true, current, limit, plan: org.plan };
}

/**
 * Check trial status — is the trial still active or has it expired?
 */
function checkTrialStatus(org: {
  planStatus: string;
  trialEndsAt: Date | null;
}): UsageCheck & { allowed: boolean } {
  if (org.planStatus === 'trialing' && org.trialEndsAt) {
    if (new Date() > org.trialEndsAt) {
      return deny(
        'Your free trial has expired. Please upgrade to continue using NativPost.',
        0,
        0,
        'trial_expired',
      );
    }
  }

  if (org.planStatus === 'cancelled' || org.planStatus === 'past_due') {
    return deny(
      `Your subscription is ${org.planStatus}. Please update your payment method.`,
      0,
      0,
      org.planStatus,
    );
  }

  return { allowed: true, current: 0, limit: 0, plan: '' };
}

// -----------------------------------------------------------
// HELPERS
// -----------------------------------------------------------

async function getOrg(orgId: string) {
  const [org] = await db
    .select()
    .from(organizationSchema)
    .where(eq(organizationSchema.id, orgId))
    .limit(1);
  return org || null;
}

function deny(reason: string, current: number, limit: number, plan: string): UsageCheck {
  return { allowed: false, reason, current, limit, plan };
}

/**
 * Initialize a new org with free trial.
 * Called when a Clerk org is first created.
 */
export async function initializeOrgWithTrial(orgId: string): Promise<void> {
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + FREE_TRIAL_DAYS);

  const [existing] = await db
    .select({ id: organizationSchema.id })
    .from(organizationSchema)
    .where(eq(organizationSchema.id, orgId))
    .limit(1);

  if (existing) return; // Already exists

  await db.insert(organizationSchema).values({
    id: orgId,
    plan: 'starter',
    planStatus: 'trialing',
    postsPerMonth: PLANS['starter']!.postsPerMonth,
    platformsLimit: PLANS['starter']!.platformsLimit,
    trialEndsAt: trialEnd,
  });
}
