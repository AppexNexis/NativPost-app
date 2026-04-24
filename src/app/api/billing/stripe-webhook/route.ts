import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

import { getPlanByStripePriceId, PLAN_CONFIGS } from '@/lib/plans';
// import { db } from '@/libs/DB';
import { getDb } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

function getField(obj: object, key: string): unknown {
  return (obj as Record<string, unknown>)[key];
}

// -----------------------------------------------------------
// POST /api/billing/stripe-webhook
// Handles Stripe subscription lifecycle events.
// No auth — protected by Stripe webhook signature.
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const db = await getDb();
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.metadata?.orgId;
        const planId = session.metadata?.planId;
        const sessionType = session.metadata?.type;

        if (!orgId) {
          break;
        }

        // ── Setup fee payment (one-time, mode: 'payment') ──
        // Mark setupFeePaid and start the trial. The subscription
        // will be created later when the user subscribes from billing.
        if (sessionType === 'setup_fee') {
          const trialEndsAt = new Date();
          trialEndsAt.setDate(trialEndsAt.getDate() + 7);

          await db
            .update(organizationSchema)
            .set({
              setupFeePaid: true,
              plan: planId ?? 'starter',
              planStatus: 'trialing',
              trialEndsAt,
              stripeCustomerId: typeof session.customer === 'string'
                ? session.customer
                : (session.customer as Stripe.Customer | null)?.id ?? null,
              // Trial limits
              postsPerMonth: 3,
              platformsLimit: 2,
              updatedAt: new Date(),
            })
            .where(eq(organizationSchema.id, orgId));

          console.log(`[Stripe Webhook] setup_fee paid: org=${orgId} plan=${planId}`);
          break;
        }

        // ── Subscription checkout completed ──
        if (!planId) {
          break;
        }

        const plan = PLAN_CONFIGS[planId];
        if (!plan) {
          break;
        }

        // Get full subscription details to check trial status
        const subscriptionId = typeof session.subscription === 'string'
          ? session.subscription
          : (session.subscription as Stripe.Subscription | null)?.id;

        let subscriptionStatus = 'active';
        let trialEnd: Date | null = null;
        let periodEnd: number | null = null;

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          subscriptionStatus = subscription.status;
          periodEnd = getField(subscription, 'current_period_end') as number ?? null;
          if (subscription.trial_end) {
            trialEnd = new Date(subscription.trial_end * 1000);
          }
        }

        await db
          .update(organizationSchema)
          .set({
            plan: planId,
            planStatus: subscriptionStatus === 'trialing' ? 'trialing' : 'active',
            stripeCustomerId: typeof session.customer === 'string'
              ? session.customer
              : (session.customer as Stripe.Customer | null)?.id ?? null,
            stripeSubscriptionId: subscriptionId ?? null,
            stripeSubscriptionStatus: subscriptionStatus,
            stripeSubscriptionPriceId: plan.stripePriceId[
              process.env.BILLING_PLAN_ENV === 'prod' ? 'prod' : 'dev'
            ] ?? null,
            ...(periodEnd ? { stripeSubscriptionCurrentPeriodEnd: periodEnd } : {}),
            postsPerMonth: plan.features.postsPerMonth === -1 ? 999999 : plan.features.postsPerMonth,
            platformsLimit: plan.features.platformsLimit === -1 ? 99 : plan.features.platformsLimit,
            setupFeePaid: true,
            trialEndsAt: trialEnd,
            updatedAt: new Date(),
          })
          .where(eq(organizationSchema.id, orgId));

        console.log(`[Stripe Webhook] checkout.session.completed: org=${orgId} plan=${planId}`);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const orgId = subscription.metadata?.orgId;
        if (!orgId) {
          break;
        }

        const priceId = subscription.items.data[0]?.price?.id;
        const plan = priceId ? getPlanByStripePriceId(priceId) : null;
        const periodEnd = getField(subscription, 'current_period_end') as number ?? null;

        const planStatus = subscription.status === 'trialing' ? 'trialing'
          : subscription.status === 'active' ? 'active'
            : subscription.status === 'past_due' ? 'past_due'
              : 'cancelled';

        let trialEnd: Date | null = null;
        if (subscription.status === 'trialing' && subscription.trial_end) {
          trialEnd = new Date(subscription.trial_end * 1000);
        }

        await db
          .update(organizationSchema)
          .set({
            planStatus,
            stripeSubscriptionStatus: subscription.status,
            stripeSubscriptionPriceId: priceId ?? null,
            ...(periodEnd ? { stripeSubscriptionCurrentPeriodEnd: periodEnd } : {}),
            ...(plan ? {
              plan: plan.id,
              postsPerMonth: plan.features.postsPerMonth === -1 ? 999999 : plan.features.postsPerMonth,
              platformsLimit: plan.features.platformsLimit === -1 ? 99 : plan.features.platformsLimit,
            } : {}),
            trialEndsAt: trialEnd,
            updatedAt: new Date(),
          })
          .where(eq(organizationSchema.id, orgId));

        console.log(`[Stripe Webhook] subscription.updated: org=${orgId} status=${subscription.status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const orgId = subscription.metadata?.orgId;
        if (!orgId) {
          break;
        }

        const starterPlan = PLAN_CONFIGS.starter!;

        await db
          .update(organizationSchema)
          .set({
            planStatus: 'cancelled',
            stripeSubscriptionStatus: 'canceled',
            stripeSubscriptionId: null,
            plan: 'starter',
            postsPerMonth: starterPlan.features.postsPerMonth,
            platformsLimit: starterPlan.features.platformsLimit,
            updatedAt: new Date(),
          })
          .where(eq(organizationSchema.id, orgId));

        console.log(`[Stripe Webhook] subscription.deleted: org=${orgId}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === 'string'
          ? invoice.customer
          : (invoice.customer as Stripe.Customer | null)?.id;

        if (customerId) {
          await db
            .update(organizationSchema)
            .set({ planStatus: 'past_due', updatedAt: new Date() })
            .where(eq(organizationSchema.stripeCustomerId, customerId));

          console.log(`[Stripe Webhook] payment_failed: customer=${customerId}`);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === 'string'
          ? invoice.customer
          : (invoice.customer as Stripe.Customer | null)?.id;

        if (customerId) {
          // Restore active status if past_due was resolved
          const [org] = await db
            .select({ id: organizationSchema.id, planStatus: organizationSchema.planStatus })
            .from(organizationSchema)
            .where(eq(organizationSchema.stripeCustomerId, customerId))
            .limit(1);

          if (org?.planStatus === 'past_due') {
            await db
              .update(organizationSchema)
              .set({ planStatus: 'active', updatedAt: new Date() })
              .where(eq(organizationSchema.id, org.id));

            console.log(`[Stripe Webhook] payment_succeeded: restored active for customer=${customerId}`);
          }
        }
        break;
      }

      // Handle trial-to-active conversion — Stripe fires this when trial ends
      // and billing begins. We update DB to reflect the now-active status.
      case 'customer.subscription.trial_will_end': {
        const subscription = event.data.object as Stripe.Subscription;
        const orgId = subscription.metadata?.orgId;
        if (!orgId) {
          break;
        }

        console.log(`[Stripe Webhook] trial_will_end: org=${orgId} trial ends at ${subscription.trial_end}`);
        // No DB change needed here — just log. The status update happens on
        // customer.subscription.updated when the trial actually ends.
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[Stripe Webhook] Processing error:', err);
    // Always return 200 to prevent Stripe retries — log and investigate separately
    return NextResponse.json({ error: 'Processing failed', received: true });
  }
}
