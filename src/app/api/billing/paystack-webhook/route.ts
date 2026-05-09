import { createHmac } from 'node:crypto';

import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getPlanByPaystackCode, PLAN_CONFIGS } from '@/lib/plans';
import { getDb } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';
import { firePlanUpgradedEmail, fireSubscriptionCancelledEmail } from '@/lib/billing'; // ← NEW

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY!;

// -----------------------------------------------------------
// POST /api/billing/paystack-webhook
//
// Handles Paystack subscription events.
// Protected by HMAC signature verification.
//
// Events handled:
// - subscription.create → activate subscription
// - subscription.not_renew → mark for cancellation
// - charge.success → confirm payment
// - invoice.payment_failed → mark past_due
//
// Paystack sends webhooks from IP 52.31.139.75 and 52.49.173.169
// You can optionally whitelist these in your server/CDN.
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('x-paystack-signature');

  if (!PAYSTACK_SECRET) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  // Verify HMAC signature
  const hash = createHmac('sha512', PAYSTACK_SECRET)
    .update(body)
    .digest('hex');

  if (hash !== signature) {
    console.error('[Paystack Webhook] Invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event: { event: string; data: Record<string, unknown> };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  console.log(`[Paystack Webhook] ${event.event}`);

  try {
    switch (event.event) {
      case 'subscription.create':
      case 'charge.success': {
        await handlePaystackSuccess(event.data);
        break;
      }

      case 'subscription.not_renew':
      case 'subscription.disable': {
        await handlePaystackCancelled(event.data);
        break;
      }

      case 'invoice.payment_failed': {
        await handlePaystackPaymentFailed(event.data);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error(`[Paystack Webhook] Handler error:`, err);
  }

  return NextResponse.json({ received: true });
}

async function handlePaystackSuccess(data: Record<string, unknown>) {
  const db = await getDb();
  const metadata = data.metadata as Record<string, unknown> | undefined;
  let orgId = metadata?.orgId as string | undefined;

  // Fallback: look up org by customer code if orgId missing in metadata
  if (!orgId) {
    const customerCode = (data.customer as Record<string, unknown>)?.customer_code as string | undefined;
    if (customerCode) {
      const [org] = await db
        .select({ id: organizationSchema.id })
        .from(organizationSchema)
        .where(eq(organizationSchema.paystackCustomerCode, customerCode))
        .limit(1);
      orgId = org?.id;
    }
  }

  if (!orgId) {
    console.error('[Paystack Webhook] Could not resolve orgId', JSON.stringify(data));
    return;
  }

  const customerCode = (data.customer as Record<string, unknown>)?.customer_code as string | undefined;
  const customerEmail = (data.customer as Record<string, unknown>)?.email as string | undefined; // ← NEW
  const authorizationCode = (data.authorization as Record<string, unknown>)?.authorization_code as string | undefined;
  const planCode = (data.plan as Record<string, unknown>)?.plan_code as string | undefined;
  const subscriptionCode = (data.subscription as Record<string, unknown>)?.subscription_code as string | undefined
    || (data as Record<string, unknown>).subscription_code as string | undefined;

  // Retrieve the stored planId from the org record if not in this event
  const [existingOrg] = await db
    .select({ paystackPlanCode: organizationSchema.paystackPlanCode })
    .from(organizationSchema)
    .where(eq(organizationSchema.id, orgId))
    .limit(1);

  const resolvedPlanCode = planCode ?? existingOrg?.paystackPlanCode ?? null;
  const plan = resolvedPlanCode ? getPlanByPaystackCode(resolvedPlanCode) : null;

  // This is a setup fee payment (₦7,500) — mark paid and start trial
  // Detect by metadata type OR by absence of planCode/subscriptionCode
  const metadataType = metadata?.type as string | undefined;
  const isSetupFee = metadataType === 'setup_fee' || (!planCode && !subscriptionCode);

  if (isSetupFee) {
    const metaPlanId = metadata?.planId as string | undefined;
    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db
      .update(organizationSchema)
      .set({
        paystackCustomerCode: customerCode ?? null,
        paystackAuthorizationCode: authorizationCode ?? null,
        setupFeePaid: true,
        plan: metaPlanId ?? 'starter',
        planStatus: 'trialing',
        trialEndsAt,
        postsPerMonth: 3,
        platformsLimit: 2,
        updatedAt: new Date(),
      })
      .where(eq(organizationSchema.id, orgId));

    console.log(`[Paystack Webhook] Setup fee paid for org ${orgId}, trial started`);

    // ── Affonso: update referral to trialing (no commission yet) ──
    const affonsoReferral = metadata?.affonso_referral as string | undefined;
    const AFFONSO_API_KEY = process.env.AFFONSO_API_KEY;

    if (affonsoReferral && AFFONSO_API_KEY) {
      try {
        await fetch(`https://api.affonso.io/v1/referrals/${affonsoReferral}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${AFFONSO_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: customerEmail ?? '',
            customer_id: orgId,
            status: 'trialing',
          }),
        });
        console.log(`[Affonso] Referral updated to trialing: ${affonsoReferral}`);
      } catch (affonsoErr) {
        console.error('[Affonso] Trialing update failed (non-fatal):', affonsoErr);
      }
    }

    return;
  }

  // This is a real subscription charge — activate the plan
  const planId = plan?.id ?? 'starter';
  const resolvedPlan = PLAN_CONFIGS[planId];

  if (!resolvedPlan) {
    console.error(`[Paystack Webhook] Could not resolve plan for planId ${planId}, org ${orgId}`);
    return;
  }

  await db
    .update(organizationSchema)
    .set({
      plan: planId,
      planStatus: 'active',
      paystackCustomerCode: customerCode ?? null,
      paystackAuthorizationCode: authorizationCode ?? null,
      paystackSubscriptionCode: subscriptionCode ?? null,
      paystackPlanCode: resolvedPlanCode,
      postsPerMonth: resolvedPlan.features.postsPerMonth === -1 ? 999999 : resolvedPlan.features.postsPerMonth,
      platformsLimit: resolvedPlan.features.platformsLimit === -1 ? 99 : resolvedPlan.features.platformsLimit,
      setupFeePaid: true,
      updatedAt: new Date(),
    })
    .where(eq(organizationSchema.id, orgId));

  console.log(`[Paystack Webhook] Activated ${planId} for org ${orgId}`);

  // ── NEW: Fire plan.upgraded email ──────────────────────────────────────────
  if (customerEmail) {
    await firePlanUpgradedEmail(customerEmail, planId);
  }
  // ──────────────────────────────────────────────────────────────────────────

  // ── Affonso: create commission on first subscription only ──
  // Recurring charges from paystack-activate cron use type: 'trial_activation'
  // and never include affonso_referral in metadata, so they are automatically
  // skipped — no extra guard needed.
  const affonsoReferral = metadata?.affonso_referral as string | undefined;
  const AFFONSO_API_KEY = process.env.AFFONSO_API_KEY;

  if (affonsoReferral && AFFONSO_API_KEY) {
    try {
      const saleAmountKobo = data.amount as number ?? 0;
      const saleAmount = saleAmountKobo / 100; // kobo to NGN
      const commissionAmount = saleAmount * 0.30; // 30% commission

      // Update referral status to customer
      await fetch(`https://api.affonso.io/v1/referrals/${affonsoReferral}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${AFFONSO_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: customerEmail ?? '',
          customer_id: orgId,
          status: 'customer',
        }),
      });

      // Create the commission — one time only
      const commissionRes = await fetch('https://api.affonso.io/v1/commissions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AFFONSO_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          referral_id: affonsoReferral,
          sale_amount: saleAmount,
          commission_amount: commissionAmount,
          sale_amount_currency: 'NGN',
          commission_currency: 'NGN',
          payment_intent_id: data.reference as string, // prevents duplicate commissions
          is_subscription: false, // one-time commission, not recurring
          sales_status: 'complete',
        }),
      });

      const commissionData = await commissionRes.json();
      console.log(`[Affonso] Commission created:`, JSON.stringify(commissionData));
    } catch (affonsoErr) {
      console.error('[Affonso] Commission creation failed (non-fatal):', affonsoErr);
    }
  }
}

async function handlePaystackCancelled(data: Record<string, unknown>) {
  const db = await getDb();
  const subscriptionCode = (data as Record<string, unknown>).subscription_code as string | undefined;
  if (!subscriptionCode) {
    return;
  }

  await db
    .update(organizationSchema)
    .set({ planStatus: 'cancelled', updatedAt: new Date() })
    .where(eq(organizationSchema.paystackSubscriptionCode, subscriptionCode));

  console.log(`[Paystack Webhook] Subscription cancelled: ${subscriptionCode}`);

  // ── NEW: Fire subscription.cancelled email ─────────────────────────────────
  const customerEmail = (data.customer as Record<string, unknown>)?.email as string | undefined;
  if (customerEmail) {
    await fireSubscriptionCancelledEmail(customerEmail);
  }
  // ──────────────────────────────────────────────────────────────────────────
}

async function handlePaystackPaymentFailed(data: Record<string, unknown>) {
  const db = await getDb();
  const metadata = data.metadata as Record<string, unknown> | undefined;
  const orgId = metadata?.orgId as string | undefined;
  if (!orgId) {
    return;
  }

  await db
    .update(organizationSchema)
    .set({ planStatus: 'past_due', updatedAt: new Date() })
    .where(eq(organizationSchema.id, orgId));

  console.log(`[Paystack Webhook] Payment failed for org ${orgId}`);
}