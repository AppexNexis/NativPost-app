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

    // NOTE: charge_authorization cannot be used here because Paystack's
    // maximum charge per transaction is NGN 100,000 (10,000,000 kobo).
    // NativPost plans (Growth NGN 59,000, Pro NGN 119,000, Agency NGN 224,000)
    // exceed or approach this limit. We use transaction/initialize with plan
    // attached instead — Paystack handles charging and subscription creation.

    // Redirect to Paystack checkout with plan attached.
    // Per Paystack docs: passing plan= overrides amount, but amount is still
    // required by the API (must be a positive integer). We pass the plan amount.
    // Metadata must be a stringified JSON string, not a raw object.
    const planAmounts: Record<string, number> = {
      starter: 2900000, // NGN 29,000 in kobo
      growth: 5900000, // NGN 59,000 in kobo
      pro: 11900000, // NGN 119,000 in kobo
      agency: 22400000, // NGN 224,000 in kobo
    };
    const amount = planAmounts[planId] ?? 10000; // fallback to NGN 100 minimum

    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount, // required — plan param overrides this, but field must be present
        plan: planCode,
        callback_url: `${APP_URL}/dashboard/billing?paystack_success=true&plan=${planId}`,
        channels: ['card'],
        metadata: JSON.stringify({ // must be stringified per Paystack docs
          orgId: orgId!,
          planId,
          type: 'subscription',
          custom_fields: [
            { display_name: 'Plan', variable_name: 'plan', value: plan.name },
            { display_name: 'Org ID', variable_name: 'org_id', value: orgId! },
          ],
        }),
      }),
    });

    const paystackData = await paystackRes.json();

    console.log('[Paystack Subscription] Full response:', JSON.stringify(paystackData));

    if (!paystackData.status || !paystackData.data?.authorization_url) {
      console.error('[Paystack Subscription] Initialize failed:', JSON.stringify(paystackData));
      return NextResponse.json(
        { error: paystackData.message || 'Failed to initialize payment.', debug: paystackData },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: paystackData.data.authorization_url });
  } catch (err) {
    console.error('[Paystack Subscription] Error:', err);
    return NextResponse.json({ error: 'Failed to initialize subscription.' }, { status: 500 });
  }
}
