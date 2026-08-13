import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { BillingConfigError, getBillingProvider } from '@/lib/billing/provider';
import { getDb } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;

// Price: $1 per 10 credits
const CREDITS_PER_DOLLAR = 10;

// -----------------------------------------------------------
// POST /api/billing/credits/purchase
//
// Body: { credits: number, paymentProvider?: 'international' | 'paystack' }
//
// Creates a one-time payment for additional AI credits.
// international (default) → the rail selected by BILLING_PROVIDER
//   (Stripe or Polar) → returns { url: hostedCheckoutUrl }
// paystack → returns { url: authorizationUrl }
//
// 'stripe' is still accepted for `paymentProvider` for backwards
// compatibility with clients that predate the Polar switch; it means
// "not Paystack", i.e. whichever international rail is live.
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  try {
    const body = await request.json();
    const { credits, paymentProvider = 'international' } = body;

    if (!credits || credits < 10 || credits > 10000) {
      return NextResponse.json(
        { error: 'Credit amount must be between 10 and 10,000.' },
        { status: 400 },
      );
    }

    // Round to nearest 10
    const normalizedCredits = Math.round(credits / 10) * 10;
    const amountUsd = normalizedCredits / CREDITS_PER_DOLLAR; // $1 per 10 credits

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

    const provider = await getBillingProvider();
    const { url } = await provider.createCreditsCheckout({
      orgId: orgId!,
      credits: normalizedCredits,
      amountUsd,
      successUrl: `${APP_URL}/ai-studio?credits=purchased`,
      cancelUrl: `${APP_URL}/ai-studio?credits=cancelled`,
    });

    return NextResponse.json({ url });
  } catch (err: any) {
    if (err instanceof BillingConfigError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error('[Credits Purchase] Error:', err?.message || err);
    return NextResponse.json(
      { error: 'Failed to create credit purchase.' },
      { status: 500 },
    );
  }
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
      'Authorization': `Bearer ${PAYSTACK_SECRET}`,
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
