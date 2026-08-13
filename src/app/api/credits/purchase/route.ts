import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { addAiCredits } from '@/lib/ai-studio/server';
import { getAuthContext } from '@/lib/auth';
import { chargePaystackAuthorization } from '@/lib/billing/paystack-charge';
import { BillingConfigError, getBillingProvider } from '@/lib/billing/provider';
import { getDb } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.nativpost.com';
const CREDITS_PER_DOLLAR = 10;
const MIN_USD = 10;
const MAX_USD = 1000;

type PurchaseBody = {
  amountUsd?: number;
};

/**
 * POST /api/credits/purchase
 *
 * Body: { amountUsd: number }
 *
 * If the org has a saved Paystack authorization: charge it off-session,
 * credit the wallet, and return { mode: 'off_session', creditsAdded }.
 *
 * Otherwise: create a hosted checkout on the active international rail
 * (Stripe or Polar, per BILLING_PROVIDER) and return { mode: 'checkout', url }
 * for a redirect flow. That rail's webhook credits the wallet.
 */
export async function POST(request: NextRequest) {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

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

  // Fallback: hosted Checkout on the active international rail (Stripe or
  // Polar, per BILLING_PROVIDER) for orgs without a saved off-session PM.
  // The wallet is credited by that provider's webhook, not here.
  try {
    const provider = await getBillingProvider();
    const { url } = await provider.createCreditsCheckout({
      orgId: orgId!,
      credits,
      amountUsd: roundedUsd,
      successUrl: `${APP_URL}/dashboard/settings?tab=credits&topup=success`,
      cancelUrl: `${APP_URL}/dashboard/settings?tab=credits&topup=cancelled`,
    });

    return NextResponse.json({
      ok: true,
      mode: 'checkout',
      url,
      creditsAdded: 0,
      amountUsd: roundedUsd,
    });
  } catch (err) {
    if (err instanceof BillingConfigError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
