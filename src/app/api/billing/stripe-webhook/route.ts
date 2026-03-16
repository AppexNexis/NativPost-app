import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

import { db } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';
import { getPlanByStripePriceId, PLANS } from '@/lib/plans';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

function getField(obj: object, key: string): unknown {
  return (obj as Record<string, unknown>)[key];
}

// -----------------------------------------------------------
// POST /api/billing/stripe-webhook
// Handles Stripe subscription lifecycle events
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
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

        if (orgId && planId) {
          const plan = PLANS[planId];
          if (plan) {
            await db
              .update(organizationSchema)
              .set({
                plan: planId,
                planStatus: 'active',
                postsPerMonth: plan.postsPerMonth,
                platformsLimit: plan.platformsLimit,
                setupFeePaid: true,
                stripeSubscriptionId: session.subscription as string,
                stripeCustomerId: session.customer as string,
                updatedAt: new Date(),
              })
              .where(eq(organizationSchema.id, orgId));
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const orgId = subscription.metadata?.orgId;

        if (orgId) {
          const priceId = subscription.items.data[0]?.price?.id;
          const plan = priceId ? getPlanByStripePriceId(priceId) : null;

          // Use type-safe access — newer Stripe versions restructured these fields
         const periodEnd = getField(subscription, 'current_period_end')
  ?? getField(subscription, 'billing_cycle_anchor')
  ?? null;

          await db
            .update(organizationSchema)
            .set({
              planStatus: subscription.status === 'active' ? 'active' :
                         subscription.status === 'trialing' ? 'trialing' :
                         subscription.status === 'past_due' ? 'past_due' : 'cancelled',
              stripeSubscriptionStatus: subscription.status,
              stripeSubscriptionPriceId: priceId || null,
              ...(typeof periodEnd === 'number'
                ? { stripeSubscriptionCurrentPeriodEnd: periodEnd }
                : {}),
              ...(plan ? {
                plan: plan.id,
                postsPerMonth: plan.postsPerMonth,
                platformsLimit: plan.platformsLimit,
              } : {}),
              updatedAt: new Date(),
            })
            .where(eq(organizationSchema.id, orgId));
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const orgId = subscription.metadata?.orgId;

        if (orgId) {
          await db
            .update(organizationSchema)
            .set({
              planStatus: 'cancelled',
              stripeSubscriptionStatus: 'canceled',
              plan: 'starter',
              postsPerMonth: PLANS['starter']!.postsPerMonth,
              platformsLimit: PLANS['starter']!.platformsLimit,
              updatedAt: new Date(),
            })
            .where(eq(organizationSchema.id, orgId));
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        if (customerId) {
          await db
            .update(organizationSchema)
            .set({
              planStatus: 'past_due',
              updatedAt: new Date(),
            })
            .where(eq(organizationSchema.stripeCustomerId, customerId));
        }
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Webhook processing error:', err);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}