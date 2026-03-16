import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

import { getAuthContext } from '@/lib/auth';
import { db } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';
import { getStripePriceId, PLANS } from '@/lib/plans';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2026-02-25.clover',
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// -----------------------------------------------------------
// POST /api/billing/create-checkout
// Creates a Stripe Checkout Session for a plan upgrade
// Body: { planId: "growth" }
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  try {
    const { planId } = await request.json();
    const plan = PLANS[planId];

    if (!plan) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const priceId = getStripePriceId(planId);
    if (!priceId || priceId.includes('REPLACE')) {
      return NextResponse.json(
        { error: 'Stripe price not configured for this plan. Contact support.' },
        { status: 400 },
      );
    }

    // Get or create Stripe customer
    const [org] = await db
      .select()
      .from(organizationSchema)
      .where(eq(organizationSchema.id, orgId!))
      .limit(1);

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

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      // Add setup fee as a one-time line item
      ...(plan.setupFeeUsd > 0 && !org?.setupFeePaid
        ? {
            line_items: [
              { price: priceId, quantity: 1 },
              {
                price_data: {
                  currency: 'usd',
                  product_data: {
                    name: `${plan.name} Plan — Onboarding Setup Fee`,
                    description: 'One-time Brand Profile workshop and setup',
                  },
                  unit_amount: plan.setupFeeUsd * 100,
                },
                quantity: 1,
              },
            ],
          }
        : {}),
      subscription_data: {
        trial_period_days: org?.planStatus === 'trialing' ? undefined : 0,
        metadata: { orgId: orgId!, planId },
      },
      success_url: `${APP_URL}/dashboard/billing?success=true&plan=${planId}`,
      cancel_url: `${APP_URL}/dashboard/billing?cancelled=true`,
      metadata: { orgId: orgId!, planId },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('Checkout session error:', err);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
