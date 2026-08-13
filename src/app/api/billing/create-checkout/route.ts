import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { BillingConfigError, getBillingProvider } from '@/lib/billing/provider';
import { PLAN_CONFIGS } from '@/lib/plans';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// -----------------------------------------------------------
// POST /api/billing/create-checkout   body: { planId, interval }
//
// Single mode: subscribe to a paid plan. Called from
// /dashboard/billing when a free user upgrades or a subscriber
// changes tier.
//
// There is no setup fee and no pre-dashboard purchase step — every
// org is auto-enrolled on the free plan at signup. Checkout charges
// the plan price and nothing else.
//
// The rail (Stripe or Polar) is chosen by BILLING_PROVIDER and resolved
// through src/lib/billing/provider.ts — this route is provider-agnostic.
// Paystack is NOT reached from here; it has its own route.
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  try {
    const body = await request.json();
    const { planId, interval = 'month' } = body;
    const plan = PLAN_CONFIGS[planId];

    if (!plan || plan.isFree) {
      return NextResponse.json({ error: 'Invalid plan.' }, { status: 400 });
    }

    const provider = await getBillingProvider();
    const { url } = await provider.createSubscriptionCheckout({
      orgId: orgId!,
      planId,
      interval: interval === 'year' ? 'year' : 'month',
      // The provider appends its own checkout-id placeholder to this URL —
      // Stripe and Polar spell that token differently.
      successUrl: `${APP_URL}/dashboard/billing?success=true&plan=${planId}`,
      cancelUrl: `${APP_URL}/dashboard/billing?cancelled=true`,
    });

    return NextResponse.json({ url });
  } catch (err: any) {
    // Configuration problems are an answer for the user, not a crash — an
    // unconfigured plan id or a missing provider key. Surface them as 400.
    if (err instanceof BillingConfigError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error('[Billing Checkout] Error type:', err?.type);
    console.error('[Billing Checkout] Error code:', err?.code);
    console.error('[Billing Checkout] Error message:', err?.message);
    return NextResponse.json(
      { error: 'Failed to create checkout session.' },
      { status: 500 },
    );
  }
}
