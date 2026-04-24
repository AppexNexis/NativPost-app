import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getPaystackPlanCode, PLAN_CONFIGS } from '@/lib/plans';
import { getDb } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;

// -----------------------------------------------------------
// POST /api/billing/create-paystack-subscription
//
// Called from the BILLING PAGE when a trialing user converts
// to a paid subscription via Paystack.
//
// Two paths:
// 1. Org has a stored authorization_code from setup fee payment
//    → Create subscription directly via API (no redirect needed)
// 2. No stored auth code
//    → Redirect to Paystack checkout with plan attached
//
// Setup fee is NOT charged here — already paid on /subscribe.
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const db = await getDb();
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
        { error: 'This plan is not yet configured for Paystack. Please use card payment instead.' },
        { status: 400 },
      );
    }

    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    // Check for stored authorization code from setup fee payment
    const [org] = await db
      .select({
        paystackAuthorizationCode: organizationSchema.paystackAuthorizationCode,
        paystackCustomerCode: organizationSchema.paystackCustomerCode,
      })
      .from(organizationSchema)
      .where(eq(organizationSchema.id, orgId!))
      .limit(1);

    const authCode = org?.paystackAuthorizationCode;
    const hasValidAuthCode = authCode && authCode !== email && !authCode.includes('@');

    if (hasValidAuthCode) {
      // Path 1: Charge stored card directly — no redirect needed
      const subRes = await fetch('https://api.paystack.co/subscription', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PAYSTACK_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customer: org?.paystackCustomerCode ?? email,
          plan: planCode,
          authorization: authCode,
          start_date: new Date().toISOString(),
        }),
      });

      const subData = await subRes.json();

      if (subData.status) {
        // Activate immediately — webhook will also fire to confirm
        await db
          .update(organizationSchema)
          .set({
            plan: planId,
            planStatus: 'active',
            paystackSubscriptionCode: subData.data?.subscription_code ?? null,
            paystackPlanCode: planCode,
            postsPerMonth: plan.features.postsPerMonth === -1 ? 999999 : plan.features.postsPerMonth,
            platformsLimit: plan.features.platformsLimit === -1 ? 99 : plan.features.platformsLimit,
            updatedAt: new Date(),
          })
          .where(eq(organizationSchema.id, orgId!));

        return NextResponse.json({ success: true });
      }

      console.warn('[Paystack Subscription] Direct charge failed, falling back to redirect:', subData.message);
    }

    // Path 2: Redirect to Paystack checkout with plan attached
    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        plan: planCode,
        callback_url: `${APP_URL}/dashboard/billing?paystack_success=true&plan=${planId}`,
        channels: ['card'],
        metadata: {
          orgId: orgId!,
          planId,
          type: 'subscription',
          custom_fields: [
            { display_name: 'Plan', variable_name: 'plan', value: plan.name },
            { display_name: 'Org ID', variable_name: 'org_id', value: orgId! },
          ],
        },
      }),
    });

    const paystackData = await paystackRes.json();

    if (!paystackData.status || !paystackData.data?.authorization_url) {
      return NextResponse.json(
        { error: paystackData.message || 'Failed to initialize payment.' },
        { status: 500 },
      );
    }

    await db
      .update(organizationSchema)
      .set({ paystackPlanCode: planCode, plan: planId, updatedAt: new Date() })
      .where(eq(organizationSchema.id, orgId!));

    return NextResponse.json({ url: paystackData.data.authorization_url });
  } catch (err) {
    console.error('[Paystack Subscription] Error:', err);
    return NextResponse.json({ error: 'Failed to initialize subscription.' }, { status: 500 });
  }
}
