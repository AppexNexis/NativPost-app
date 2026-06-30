import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;

// Price: $1 per 10 credits
const CREDITS_PER_DOLLAR = 10;

// -----------------------------------------------------------
// POST /api/billing/credits/purchase
//
// Body: { credits: number, paymentProvider: 'stripe' | 'paystack' }
//
// Creates a one-time payment for additional AI credits.
// Stripe → returns { url: checkoutSessionUrl }
// Paystack → returns { url: authorizationUrl }
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  try {
    const body = await request.json();
    const { credits, paymentProvider = 'stripe' } = body;

    if (!credits || credits < 10 || credits > 10000) {
      return NextResponse.json(
        { error: 'Credit amount must be between 10 and 10,000.' },
        { status: 400 },
      );
    }

    // Round to nearest 10
    const normalizedCredits = Math.round(credits / 10) * 10;
    const amountUsd = normalizedCredits / CREDITS_PER_DOLLAR; // $1 per 10 credits
    const amountCents = Math.round(amountUsd * 100);

    // Load org
    const [org] = await db
      .select()
      .from(organizationSchema)
      .where(eq(organizationSchema.id, orgId!))
      .limit(1);

    if (!org) {
      return NextResponse.json({ error: 'Organization not found.' }, { status: 404 });
    }

    if (paymentProvider === 'paystack') {
      return await handlePaystackPurchase(org, orgId!, normalizedCredits, amountUsd);
    }

    return await handleStripePurchase(org, orgId!, normalizedCredits, amountCents);
  } catch (err: any) {
    console.error('[Credits Purchase] Error:', err?.message || err);
    return NextResponse.json(
      { error: 'Failed to create credit purchase.' },
      { status: 500 },
    );
  }
}

async function handleStripePurchase(
  org: Record<string, any>,
  orgId: string,
  credits: number,
  amountCents: number,
) {
  const stripeInstance = stripe;
  const db = await getDb();
  let customerId = org.stripeCustomerId;

  if (!customerId) {
    const customer = await stripeInstance.customers.create({
      metadata: { orgId },
    });
    customerId = customer.id;
    await db
      .update(organizationSchema)
      .set({ stripeCustomerId: customerId, paymentType: 'stripe' })
      .where(eq(organizationSchema.id, orgId));
  }

  const session = await stripeInstance.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${credits} AI Credits`,
            description: `One-time purchase of ${credits} additional AI credits for NativPost AI Studio.`,
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      orgId,
      type: 'ai_credits',
      credits: String(credits),
    },
    success_url: `${APP_URL}/ai-studio?credits=purchased`,
    cancel_url: `${APP_URL}/ai-studio?credits=cancelled`,
  });

  return NextResponse.json({ url: session.url });
}

async function handlePaystackPurchase(
  org: Record<string, any>,
  orgId: string,
  credits: number,
  amountUsd: number,
) {
  const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: org.paystackCustomerCode || org.stripeCustomerId || `${orgId}@nativpost.com`,
      amount: Math.round(amountUsd * 100), // dollar → kobo approximation
      callback_url: `${APP_URL}/api/billing/credits/purchase/verify?credits=${credits}&orgId=${orgId}`,
      channels: ['card'],
      metadata: JSON.stringify({
        orgId,
        type: 'ai_credits',
        credits: String(credits),
      }),
    }),
  });

  const paystackData = await paystackRes.json();

  if (!paystackData.status || !paystackData.data?.authorization_url) {
    console.error('[Paystack] Credits purchase init failed:', paystackData);
    return NextResponse.json(
      { error: paystackData.message || 'Failed to initialize payment.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ url: paystackData.data.authorization_url });
}
