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
// IMPORTANT: We always use transaction/initialize with the plan
// attached — NOT the /subscription API. Reason:
//   - /subscription API creates a subscription but does NOT
//     charge immediately (charges on start_date only)
//   - transaction/initialize with `plan` param charges the card
//     immediately AND sets up the recurring subscription
//
// If the org has a stored authorization_code, we use
// /transaction/charge_authorization to charge immediately
// without a redirect, then the subscription auto-creates.
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

    // Fetch org to check for stored auth code and existing subscription
    const [org] = await db
      .select({
        paystackAuthorizationCode: organizationSchema.paystackAuthorizationCode,
        paystackCustomerCode: organizationSchema.paystackCustomerCode,
        paystackSubscriptionCode: organizationSchema.paystackSubscriptionCode,
      })
      .from(organizationSchema)
      .where(eq(organizationSchema.id, orgId!))
      .limit(1);

    // Cancel existing Paystack subscription before creating a new one
    // This prevents double-billing when upgrading/downgrading
    if (org?.paystackSubscriptionCode && org?.paystackAuthorizationCode) {
      try {
        await fetch('https://api.paystack.co/subscription/disable', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${PAYSTACK_SECRET}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code: org.paystackSubscriptionCode,
            token: org.paystackAuthorizationCode,
          }),
        });
        console.log(`[Paystack Subscription] Cancelled existing sub ${org.paystackSubscriptionCode} for org ${orgId}`);
      } catch (cancelErr) {
        console.warn('[Paystack Subscription] Failed to cancel existing subscription:', cancelErr);
      }
    }

    const authCode = org?.paystackAuthorizationCode;
    // Valid auth code looks like AUTH_xxxxxxxx (not an email or placeholder)
    const hasValidAuthCode = authCode
      && authCode.startsWith('AUTH_')
      && authCode.length > 10;

    // Store intended plan before any redirect
    await db
      .update(organizationSchema)
      .set({ paystackPlanCode: planCode, plan: planId, updatedAt: new Date() })
      .where(eq(organizationSchema.id, orgId!));

    if (hasValidAuthCode) {
      // -----------------------------------------------------------
      // PATH 1: Charge stored card immediately via charge_authorization
      // This charges the plan amount right now AND Paystack will
      // auto-create the recurring subscription after successful charge.
      // The webhook (charge.success + subscription.create) will then
      // activate the plan in our DB.
      // -----------------------------------------------------------
      const planAmountByCode: Record<string, number> = {
        starter: 2900000, // NGN 29,000 in kobo
        growth: 5900000, // NGN 59,000 in kobo
        pro: 11900000, // NGN 119,000 in kobo
        agency: 22400000, // NGN 224,000 in kobo
      };

      const amount = planAmountByCode[planId];
      if (!amount) {
        return NextResponse.json({ error: 'Plan amount not configured.' }, { status: 400 });
      }

      const chargeRes = await fetch('https://api.paystack.co/transaction/charge_authorization', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PAYSTACK_SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          amount,
          authorization_code: authCode,
          plan: planCode, // attaching plan creates recurring subscription
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

      const chargeData = await chargeRes.json();

      if (chargeData.status && chargeData.data?.status === 'success') {
        // Charge succeeded — webhook will also fire but we activate now
        // so the user sees the change immediately
        await db
          .update(organizationSchema)
          .set({
            plan: planId,
            planStatus: 'active',
            paystackPlanCode: planCode,
            paystackSubscriptionCode: chargeData.data?.plan_object?.subscriptions?.[0]?.subscription_code ?? null,
            postsPerMonth: plan.features.postsPerMonth === -1 ? 999999 : plan.features.postsPerMonth,
            platformsLimit: plan.features.platformsLimit === -1 ? 99 : plan.features.platformsLimit,
            updatedAt: new Date(),
          })
          .where(eq(organizationSchema.id, orgId!));

        return NextResponse.json({ success: true, charged: true });
      }

      if (chargeData.data?.status === 'send_otp' || chargeData.data?.status === 'send_pin') {
        // Card requires OTP/PIN — fall through to redirect flow
        console.log('[Paystack Subscription] Card requires OTP, falling back to redirect');
      } else {
        console.warn('[Paystack Subscription] charge_authorization failed:', chargeData.message, chargeData.data?.status);
      }
    }

    // -----------------------------------------------------------
    // PATH 2: Redirect to Paystack checkout
    // Used when: no stored auth code, or charge requires OTP/PIN.
    // Attaching plan= to the transaction means Paystack charges
    // immediately and creates the subscription automatically.
    // -----------------------------------------------------------
    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        plan: planCode, // this is what makes it charge AND create subscription
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
      console.error('[Paystack Subscription] Initialize failed:', paystackData);
      return NextResponse.json(
        { error: paystackData.message || 'Failed to initialize payment.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: paystackData.data.authorization_url });
  } catch (err) {
    console.error('[Paystack Subscription] Error:', err);
    return NextResponse.json({ error: 'Failed to initialize subscription.' }, { status: 500 });
  }
}
