import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

import { addAiCredits } from '@/lib/ai-studio/server';
import { getAuthContext } from '@/lib/auth';
import { chargePaystackAuthorization } from '@/lib/billing/paystack-charge';
import { getDb } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';

export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.nativpost.com';
const CREDITS_PER_DOLLAR = 10;
const MIN_USD = 10;
const MAX_USD = 1000;

interface PurchaseBody {
  amountUsd?: number;
}

/**
 * POST /api/credits/purchase
 *
 * Body: { amountUsd: number }
 *
 * If the org has a saved Paystack authorization: charge it off-session,
 * credit the wallet, and return { mode: 'off_session', creditsAdded }.
 *
 * Otherwise: create a Stripe Checkout Session and return
 * { mode: 'checkout', url } for a redirect flow.
 */
export async function POST(request: NextRequest) {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  let body: PurchaseBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const amountUsd = Number(body.amountUsd);
  if (!Number.isFinite(amountUsd) || amountUsd < MIN_USD || amountUsd > MAX_USD) {
    return NextResponse.json(
      { error: `Amount must be between $${MIN_USD} and $${MAX_USD}.` },
      { status: 400 },
    );
  }

  const roundedUsd = Math.round(amountUsd * 100) / 100;
  const credits = Math.round(roundedUsd * CREDITS_PER_DOLLAR);

  const db = await getDb();
  const [org] = await db
    .select()
    .from(organizationSchema)
    .where(eq(organizationSchema.id, orgId!))
    .limit(1);

  if (!org) {
    return NextResponse.json({ error: 'Organization not found.' }, { status: 404 });
  }

  const canChargeOffSession
    = org.paymentType === 'paystack'
      && !!org.paystackAuthorizationCode
      && !!org.paystackCustomerEmail;

  if (canChargeOffSession) {
    const charge = await chargePaystackAuthorization({
      email: org.paystackCustomerEmail!,
      authorizationCode: org.paystackAuthorizationCode!,
      amountUsd: roundedUsd,
      metadata: {
        orgId: orgId!,
        type: 'ai_credits',
        credits,
      },
    });

    if (!charge.ok) {
      return NextResponse.json(
        { error: charge.message || 'Payment failed. Please try again or update your card.' },
        { status: 402 },
      );
    }

    const wallet = await addAiCredits(orgId!, credits, {
      type: 'purchase',
      description: `One-time top-up ($${roundedUsd.toFixed(2)})`,
    });

    return NextResponse.json({
      ok: true,
      mode: 'off_session',
      creditsAdded: credits,
      amountUsd: roundedUsd,
      reference: charge.reference,
      wallet,
    });
  }

  // Fallback: Stripe hosted Checkout for orgs without a saved off-session PM.
  let customerId = org.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({ metadata: { orgId: orgId! } });
    customerId = customer.id;
    await db
      .update(organizationSchema)
      .set({ stripeCustomerId: customerId, paymentType: 'stripe' })
      .where(eq(organizationSchema.id, orgId!));
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${credits} AI Credits`,
            description: `One-time top-up of ${credits} AI Studio credits.`,
          },
          unit_amount: Math.round(roundedUsd * 100),
        },
        quantity: 1,
      },
    ],
    metadata: {
      orgId: orgId!,
      type: 'ai_credits',
      credits: String(credits),
    },
    success_url: `${APP_URL}/dashboard/settings?tab=credits&topup=success`,
    cancel_url: `${APP_URL}/dashboard/settings?tab=credits&topup=cancelled`,
  });

  return NextResponse.json({
    ok: true,
    mode: 'checkout',
    url: session.url,
    creditsAdded: 0,
    amountUsd: roundedUsd,
  });
}
