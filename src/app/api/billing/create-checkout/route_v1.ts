import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

import { getAuthContext } from '@/lib/auth';
import { getStripePriceId, isPlanConfigured, PLAN_CONFIGS } from '@/lib/plans';
// import { db } from '@/libs/DB';
import { getDb } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover',
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// -----------------------------------------------------------
// POST /api/billing/create-checkout
// Creates a Stripe Checkout Session.
// Body: { planId: string }
//
// Features:
// - Promo code field shown automatically (allow_promotion_codes: true)
// - Setup fee added as one-time line item if not already paid
// - Trial applied for new subscribers
// - Customer created/reused from org record
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  try {
    const { planId } = await request.json();
    const plan = PLAN_CONFIGS[planId];

    if (!plan) {
      return NextResponse.json({ error: 'Invalid plan.' }, { status: 400 });
    }

    if (!isPlanConfigured(planId)) {
      return NextResponse.json(
        { error: 'This plan is not yet available for purchase. Contact support.' },
        { status: 400 },
      );
    }

    const priceId = getStripePriceId(planId)!;

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

    // Build line items
    // Always include the subscription price
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      { price: priceId, quantity: 1 },
    ];

    // Add one-time setup fee if not yet paid
    const setupFeePaid = org?.setupFeePaid ?? false;
    if (plan.setupFeeUsd > 0 && !setupFeePaid) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${plan.name} Plan — Brand Profile Setup`,
            description: 'One-time onboarding fee. Includes your personalised Brand Profile workshop with the NativPost team.',
          },
          unit_amount: plan.setupFeeUsd * 100,
        },
        quantity: 1,
      });
    }

    // Determine trial: only offer trial if org is currently trialing or never subscribed
    const isEligibleForTrial = !org?.stripeSubscriptionId
      && (org?.planStatus === 'trialing' || !org?.planStatus);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: lineItems,
      // Promo code field — shown automatically in Stripe Checkout UI
      // Create codes in Stripe Dashboard → Products → Coupons
      allow_promotion_codes: true,
      subscription_data: {
        // Only apply trial for new subscribers
        ...(isEligibleForTrial ? { trial_period_days: 7 } : {}),
        metadata: { orgId: orgId!, planId },
      },
      // Billing address collection improves invoice quality
      billing_address_collection: 'auto',
      success_url: `${APP_URL}/dashboard/billing?success=true&plan=${planId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/dashboard/billing?cancelled=true`,
      metadata: { orgId: orgId!, planId },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[Stripe Checkout] Error:', err);
    return NextResponse.json({ error: 'Failed to create checkout session.' }, { status: 500 });
  }
}
