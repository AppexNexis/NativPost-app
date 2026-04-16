import { createHmac } from 'node:crypto';

import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getPlanByPaystackCode, PLAN_CONFIGS } from '@/lib/plans';
// import { db } from '@/libs/DB';
import { getDb } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';

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
  const orgId = metadata?.orgId as string | undefined;
  const planCode = (data.plan as Record<string, unknown>)?.plan_code as string | undefined;

  if (!orgId) {
    console.error('[Paystack Webhook] Missing orgId in metadata');
    return;
  }

  const plan = planCode ? getPlanByPaystackCode(planCode) : null;
  const planId = plan?.id ?? 'starter';
  const resolvedPlan = PLAN_CONFIGS[planId];

  if (!resolvedPlan) {
    return;
  }

  const customerCode = (data.customer as Record<string, unknown>)?.customer_code as string | undefined;
  const subscriptionCode = (data.subscription as Record<string, unknown>)?.subscription_code as string | undefined
    || (data as Record<string, unknown>).subscription_code as string | undefined;

  await db
    .update(organizationSchema)
    .set({
      plan: planId,
      planStatus: 'active',
      paystackCustomerCode: customerCode ?? null,
      paystackSubscriptionCode: subscriptionCode ?? null,
      paystackPlanCode: planCode ?? null,
      postsPerMonth: resolvedPlan.features.postsPerMonth === -1 ? 999999 : resolvedPlan.features.postsPerMonth,
      platformsLimit: resolvedPlan.features.platformsLimit === -1 ? 99 : resolvedPlan.features.platformsLimit,
      setupFeePaid: true,
      updatedAt: new Date(),
    })
    .where(eq(organizationSchema.id, orgId));

  console.log(`[Paystack Webhook] Activated ${planId} for org ${orgId}`);
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
