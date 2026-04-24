import { and, eq, isNotNull, lt } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getPaystackPlanCode, PLAN_CONFIGS } from '@/lib/plans';
import { getDb } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;

// -----------------------------------------------------------
// GET /api/billing/paystack-activate
//
// Runs daily via GitHub Actions cron.
// Finds orgs whose Paystack trial has expired and charges them
// immediately using their stored authorization_code, then
// creates a recurring subscription.
//
// Flow per org:
// 1. charge_authorization → charges card NOW for full plan amount
// 2. If charge succeeds → create /subscription for recurring billing
// 3. Webhook (charge.success + subscription.create) confirms in DB
//    but we also optimistically update to avoid access loss.
//
// Protected by Authorization: Bearer <CRON_SECRET> header.
// -----------------------------------------------------------
export async function GET(request: NextRequest) {
  const db = await getDb();
  const authHeader = request.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  console.log(`[Paystack Activate] Running at ${now.toISOString()}`);

  // NGN plan amounts in kobo
  const planAmounts: Record<string, number> = {
    starter: 2900000, // NGN 29,000
    growth: 5900000, // NGN 59,000
    pro: 11900000, // NGN 119,000
    agency: 22400000, // NGN 224,000
  };

  try {
    // Find orgs that:
    // - are on trial
    // - trial has expired
    // - have a stored authorization code (paid setup fee via Paystack)
    const orgsToActivate = await db
      .select()
      .from(organizationSchema)
      .where(
        and(
          eq(organizationSchema.planStatus, 'trialing'),
          lt(organizationSchema.trialEndsAt, now),
          isNotNull(organizationSchema.paystackAuthorizationCode),
          isNotNull(organizationSchema.paystackCustomerCode),
        ),
      );

    if (orgsToActivate.length === 0) {
      return NextResponse.json({ activated: 0, message: 'No orgs due for activation' });
    }

    console.log(`[Paystack Activate] Found ${orgsToActivate.length} org(s) to activate`);
    const results = [];

    for (const org of orgsToActivate) {
      console.log(`[Paystack Activate] Processing org ${org.id} on plan ${org.plan}`);

      try {
        const planCode = getPaystackPlanCode(org.plan);
        const resolvedPlan = PLAN_CONFIGS[org.plan];
        const amount = planAmounts[org.plan];

        if (!planCode || planCode.includes('REPLACE') || !resolvedPlan || !amount) {
          console.error(`[Paystack Activate] Missing config for plan ${org.plan}`);
          results.push({ orgId: org.id, success: false, error: `No config for plan ${org.plan}` });
          continue;
        }

        // ── STEP 1: Charge the card immediately ──────────────────
        // charge_authorization charges the stored card right now.
        // NOTE: Do NOT pass 'plan' param — it's not supported and
        // causes "Invalid Amount Sent" error.
        const chargeRes = await fetch('https://api.paystack.co/transaction/charge_authorization', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${PAYSTACK_SECRET}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: org.paystackCustomerCode, // stored email
            amount, // full plan amount in kobo
            authorization_code: org.paystackAuthorizationCode,
            metadata: JSON.stringify({
              orgId: org.id,
              planId: org.plan,
              type: 'trial_activation',
            }),
          }),
        });

        const chargeData = await chargeRes.json();
        console.log(`[Paystack Activate] Charge result for org ${org.id}:`, chargeData.data?.status);

        if (!chargeData.status || chargeData.data?.status !== 'success') {
          const errMsg = chargeData.data?.gateway_response || chargeData.message || 'Charge failed';
          console.error(`[Paystack Activate] Charge failed for org ${org.id}:`, errMsg);

          // Mark as past_due so the dashboard shows a payment warning
          await db
            .update(organizationSchema)
            .set({ planStatus: 'past_due', updatedAt: new Date() })
            .where(eq(organizationSchema.id, org.id));

          results.push({ orgId: org.id, success: false, error: errMsg });
          continue;
        }

        // ── STEP 2: Create recurring subscription ───────────────
        // Charge succeeded — now set up recurring billing.
        // start_date = 30 days from now (already charged today).
        let subscriptionCode: string | null = null;
        try {
          const subRes = await fetch('https://api.paystack.co/subscription', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${PAYSTACK_SECRET}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              customer: org.paystackCustomerCode,
              plan: planCode,
              authorization: org.paystackAuthorizationCode,
              start_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            }),
          });

          const subData = await subRes.json();
          if (subData.status) {
            subscriptionCode = subData.data?.subscription_code ?? null;
            console.log(`[Paystack Activate] Subscription created for org ${org.id}: ${subscriptionCode}`);
          } else {
            console.warn(`[Paystack Activate] Subscription creation failed for org ${org.id}:`, subData.message);
          }
        } catch (subErr) {
          console.warn(`[Paystack Activate] Sub creation error for org ${org.id}:`, subErr);
        }

        // ── STEP 3: Activate the org in DB ──────────────────────
        // Optimistically activate — webhook will also confirm.
        await db
          .update(organizationSchema)
          .set({
            plan: org.plan,
            planStatus: 'active',
            paystackSubscriptionCode: subscriptionCode,
            paystackPlanCode: planCode,
            trialEndsAt: null,
            postsPerMonth: resolvedPlan.features.postsPerMonth === -1 ? 999999 : resolvedPlan.features.postsPerMonth,
            platformsLimit: resolvedPlan.features.platformsLimit === -1 ? 99 : resolvedPlan.features.platformsLimit,
            updatedAt: new Date(),
          })
          .where(eq(organizationSchema.id, org.id));

        console.log(`[Paystack Activate] Successfully activated org ${org.id}`);
        results.push({ orgId: org.id, success: true, plan: org.plan });
      } catch (err) {
        console.error(`[Paystack Activate] Error for org ${org.id}:`, err);
        results.push({ orgId: org.id, success: false, error: String(err) });
      }
    }

    const succeeded = results.filter(r => r.success).length;

    return NextResponse.json({
      activated: succeeded,
      failed: results.length - succeeded,
      results,
    });
  } catch (err) {
    console.error('[Paystack Activate] Fatal error:', err);
    return NextResponse.json({ error: 'Activation failed' }, { status: 500 });
  }
}
