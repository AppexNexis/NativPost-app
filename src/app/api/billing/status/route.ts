import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getOrgBillingState, getOrgUsage } from '@/lib/billing';
import { FREE_PLAN_FEATURES, FREE_PLAN_ID, FREE_TRIAL_DAYS } from '@/lib/plans';

// -----------------------------------------------------------
// GET /api/billing/status
// Returns full billing state for the current org.
// Used by the billing page and plan enforcement UI.
// -----------------------------------------------------------
export async function GET(_request: NextRequest) {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  try {
    const [billing, usage] = await Promise.all([
      getOrgBillingState(orgId!),
      getOrgUsage(orgId!),
    ]);

    // -----------------------------------------------------------
    // FALLBACK RESPONSE (prevents 404 + redirect loops)
    // -----------------------------------------------------------
    if (!billing) {
      console.warn(`[Billing Status] Org ${orgId} missing — returning fallback state`);

      return NextResponse.json({
        plan: FREE_PLAN_ID,
        planStatus: 'trialing',
        isActive: true,
        isTrialing: true,
        isFree: true,
        freeTrialEnded: false,
        trialDaysLeft: FREE_TRIAL_DAYS,
        trialExpired: false,
        trialEndsAt: null,
        setupFeePaid: false,
        hasStripe: false,
        hasPaystack: false,
        paymentType: 'stripe',
        features: FREE_PLAN_FEATURES,
        usage: {
          postsThisMonth: 0,
          postsLimit: FREE_PLAN_FEATURES.postsPerMonth,
          platformsLimit: FREE_PLAN_FEATURES.platformsLimit,
        },
      });
    }

    return NextResponse.json({
      plan: billing.plan,
      planStatus: billing.planStatus,
      isActive: billing.isActive,
      isTrialing: billing.isTrialing,
      isFree: billing.isFree,
      freeTrialEnded: billing.freeTrialEnded,
      trialDaysLeft: billing.trialDaysLeft,
      trialExpired: billing.trialExpired,
      trialEndsAt: billing.trialEndsAt?.toISOString() ?? null,
      setupFeePaid: billing.setupFeePaid,
      hasStripe: !!billing.stripeCustomerId,
      hasPaystack: !!billing.paystackCustomerCode,
      hasPaystackSub: !!billing.paystackSubscriptionCode,
      // Derive payment type from actual subscription fields first — the column
      // may be wrong for orgs created before the migration. hasPaystackSub means
      // they definitely used Paystack. hasPaystack && !hasStripe is also Paystack.
      paymentType: (!!billing.paystackSubscriptionCode || (!!billing.paystackCustomerCode && !billing.stripeCustomerId))
        ? 'paystack'
        : (billing.paymentType ?? 'stripe'),
      billingInterval: billing.billingInterval ?? 'month',
      features: billing.features,
      usage: {
        postsThisMonth: usage.postsThisMonth,
        // Normalize -1 (unlimited) to sentinel values for UI display
        postsLimit: billing.features?.postsPerMonth === -1
          ? 999999
          : (billing.features?.postsPerMonth ?? billing.postsPerMonth ?? 0),
        platformsLimit: billing.features?.platformsLimit === -1
          ? 99
          : (billing.features?.platformsLimit ?? billing.platformsLimit ?? 0),
      },
    });
  } catch (err) {
    console.error('[Billing Status] Error:', err);

    return NextResponse.json(
      { error: 'Failed to load billing status' },
      { status: 500 },
    );
  }
}
