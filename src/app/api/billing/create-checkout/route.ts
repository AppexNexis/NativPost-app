import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

import { getAuthContext } from '@/lib/auth';
import { getStripePriceId, isPlanConfigured, PLAN_CONFIGS } from '@/lib/plans';
// import { db } from '@/libs/DB';
import { getDb } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
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
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const db = await getDb();
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

    // Load org record
    const [org] = await db
      .select()
      .from(organizationSchema)
      .where(eq(organizationSchema.id, orgId!))
      .limit(1);

    // Get or create Stripe customer
    let customerId = org?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { orgId: orgId! },
      });
      customerId = customer.id;
      await db
        .update(organizationSchema)
        .set({ stripeCustomerId: customerId, paymentType: 'stripe' })
        .where(eq(organizationSchema.id, orgId!));
    } else {
      // Existing Stripe customer — ensure paymentType is recorded
      await db
        .update(organizationSchema)
        .set({ paymentType: 'stripe' })
        .where(eq(organizationSchema.id, orgId!));
    }

    // ── Plan subscription (no trial, no setup fee) ──
    if (!isPlanConfigured(planId)) {
      return NextResponse.json(
        { error: 'This plan is not yet available for purchase. Contact support.' },
        { status: 400 },
      );
    }

    const priceId = getStripePriceId(planId, interval as 'month' | 'year')!;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      // No trial — they already had their trial
      subscription_data: {
        metadata: { orgId: orgId!, planId, billingInterval: interval },
      },
      billing_address_collection: 'auto',
      success_url: `${APP_URL}/dashboard/billing?success=true&plan=${planId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/dashboard/billing?cancelled=true`,
      metadata: { orgId: orgId!, planId, billingInterval: interval },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('[Stripe Checkout] Error type:', err?.type);
    console.error('[Stripe Checkout] Error code:', err?.code);
    console.error('[Stripe Checkout] Error message:', err?.message);
    return NextResponse.json(
      { error: 'Failed to create checkout session.' },
      { status: 500 },
    );
  }
}
