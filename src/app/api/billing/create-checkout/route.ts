import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

import { getAuthContext } from '@/lib/auth';
import { getStripePriceId, isPlanConfigured, PLAN_CONFIGS, SETUP_FEE_USD } from '@/lib/plans';
// import { db } from '@/libs/DB';
import { getDb } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// -----------------------------------------------------------
// POST /api/billing/create-checkout
//
// TWO modes based on body:
//
// 1. SETUP_FEE mode (body: { planId, setupFeeOnly: true })
//    Called from /subscribe page (trialing users).
//    Charges ONLY the one-time $5 setup fee.
//    No subscription created. No trial.
//    On success → webhook marks setupFeePaid=true.
//
// 2. SUBSCRIBE mode (body: { planId })
//    Called from /dashboard/billing (subscribing from trial or upgrading).
//    Charges the subscription plan price only.
//    Setup fee is NOT included (already paid during trial).
//    No trial period — they're already in trial, now converting.
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  try {
    const body = await request.json();
    const { planId, setupFeeOnly = false } = body;
    const plan = PLAN_CONFIGS[planId];

    if (!plan) {
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
        .set({ stripeCustomerId: customerId })
        .where(eq(organizationSchema.id, orgId!));
    }

    // ── MODE 1: Setup fee only ──────────────────────────────
    // Charge the one-time $5 setup fee as a one-time payment.
    // User is redirected to dashboard after paying.
    if (setupFeeOnly) {
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'payment', // one-time, not subscription
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'NativPost Brand Profile Setup',
                description: 'One-time onboarding fee. Sets up your personalised Brand Profile.',
              },
              unit_amount: SETUP_FEE_USD * 100,
            },
            quantity: 1,
          },
        ],
        metadata: {
          orgId: orgId!,
          planId,
          type: 'setup_fee',
        },
        success_url: `${APP_URL}/dashboard?setup=success`,
        cancel_url: `${APP_URL}/subscribe?cancelled=true`,
      });

      return NextResponse.json({ url: session.url });
    }

    // ── MODE 2: Plan subscription (no trial, no setup fee) ──
    // Used from the billing page when converting from trial.
    if (!isPlanConfigured(planId)) {
      return NextResponse.json(
        { error: 'This plan is not yet available for purchase. Contact support.' },
        { status: 400 },
      );
    }

    const priceId = getStripePriceId(planId)!;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      // No trial — they already had their trial
      subscription_data: {
        metadata: { orgId: orgId!, planId },
      },
      billing_address_collection: 'auto',
      success_url: `${APP_URL}/dashboard/billing?success=true&plan=${planId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/dashboard/billing?cancelled=true`,
      metadata: { orgId: orgId!, planId },
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
