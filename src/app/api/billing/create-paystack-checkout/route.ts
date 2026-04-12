import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getPaystackPlanCode, PLAN_CONFIGS } from '@/lib/plans';
import { db } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;

// -----------------------------------------------------------
// POST /api/billing/create-paystack-checkout
// Initialises a Paystack subscription transaction.
// Body: { planId: string, email: string }
//
// Paystack flow:
// 1. Initialize transaction → get authorization_url
// 2. Redirect user to Paystack hosted page
// 3. Paystack sends webhook on payment → we activate subscription
//
// Paystack Dashboard setup (guide for later):
// - Go to Products → Plans → Create Plan
// - Set interval: monthly, amount in kobo (e.g. $29 = 2900 kobo)
// - Copy plan code → paste in plans.ts paystackPlanCode.prod
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  try {
    const { planId, email } = await request.json();
    const plan = PLAN_CONFIGS[planId];

    if (!plan) {
      return NextResponse.json({ error: 'Invalid plan.' }, { status: 400 });
    }

    const planCode = getPaystackPlanCode(planId);
    if (!planCode || planCode.includes('REPLACE')) {
      return NextResponse.json(
        { error: 'This payment method is not yet configured for this plan. Please use card payment or contact support.' },
        { status: 400 },
      );
    }

    if (!email) {
      return NextResponse.json({ error: 'Email is required for Paystack checkout.' }, { status: 400 });
    }

    // Amount in kobo (Paystack uses smallest currency unit)
    // Paystack primarily serves NGN — $29 USD ≈ NGN pricing
    // Set actual NGN amounts in Paystack Dashboard plans
    const amountKobo = plan.priceUsd * 100; // placeholder, actual set in plan

    // Initialize Paystack transaction
    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: amountKobo,
        plan: planCode,
        callback_url: `${APP_URL}/api/billing/paystack-callback`,
        metadata: {
          orgId: orgId!,
          planId,
          setupFeeUsd: plan.setupFeeUsd,
          custom_fields: [
            { display_name: 'Plan', variable_name: 'plan', value: plan.name },
            { display_name: 'Org ID', variable_name: 'org_id', value: orgId! },
          ],
        },
      }),
    });

    const paystackData = await paystackRes.json();

    if (!paystackData.status || !paystackData.data?.authorization_url) {
      console.error('[Paystack] Initialize failed:', paystackData);
      return NextResponse.json(
        { error: paystackData.message || 'Failed to initialize payment.' },
        { status: 500 },
      );
    }

    // Store customer email reference
    await db
      .update(organizationSchema)
      .set({ paystackCustomerCode: email }) // will be updated to proper code from webhook
      .where(eq(organizationSchema.id, orgId!));

    return NextResponse.json({ url: paystackData.data.authorization_url });
  } catch (err) {
    console.error('[Paystack Checkout] Error:', err);
    return NextResponse.json({ error: 'Failed to initialize payment.' }, { status: 500 });
  }
}
