import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getOrgBillingState, getOrgUsage } from '@/lib/billing';

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

    if (!billing) {
      return NextResponse.json({ error: 'Organisation not found' }, { status: 404 });
    }

    return NextResponse.json({
      plan: billing.plan,
      planStatus: billing.planStatus,
      isActive: billing.isActive,
      isTrialing: billing.isTrialing,
      trialDaysLeft: billing.trialDaysLeft,
      trialExpired: billing.trialExpired,
      trialEndsAt: billing.trialEndsAt?.toISOString() ?? null,
      setupFeePaid: billing.setupFeePaid,
      hasStripe: !!billing.stripeCustomerId,
      hasPaystack: !!billing.paystackCustomerCode,
      features: billing.features,
      usage: {
        postsThisMonth: usage.postsThisMonth,
        postsLimit: billing.features.postsPerMonth,
        platformsLimit: billing.features.platformsLimit,
      },
    });
  } catch (err) {
    console.error('[Billing Status] Error:', err);
    return NextResponse.json({ error: 'Failed to load billing status' }, { status: 500 });
  }
}
