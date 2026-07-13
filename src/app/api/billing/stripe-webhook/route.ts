import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

import { addAiCredits } from '@/lib/ai-studio/server';
import { firePlanUpgradedEmail, fireSubscriptionCancelledEmail } from '@/lib/billing';
import { getPlanByStripePriceId, PLAN_CONFIGS } from '@/lib/plans';
import { sendTrustpilotInvitation } from '@/lib/trustpilot';
import { getDb } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

function getField(obj: object, key: string): unknown {
  return (obj as Record<string, unknown>)[key];
}

// -----------------------------------------------------------
// Helpers — resolve user email and name from orgId via Clerk
// -----------------------------------------------------------
async function getEmailForOrg(orgId: string): Promise<string | null> {
  try {
    const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
    if (!CLERK_SECRET_KEY) {
      return null;
    }

    const res = await fetch(
      `https://api.clerk.com/v1/organizations/${orgId}/memberships?limit=10`,
      {
        headers: new Headers({
          'Authorization': `Bearer ${CLERK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        }),
      },
    );
    if (!res.ok) {
      return null;
    }

    const json = await res.json();
    const members: Array<{ role: string; public_user_data: { identifier: string } }> = json.data ?? json;
    const admin = members.find(
      m => m.role === 'admin' && m.public_user_data?.identifier !== 'admin@nativpost.com',
    );
    return admin?.public_user_data?.identifier ?? null;
  } catch {
    return null;
  }
}

async function getNameForOrg(orgId: string): Promise<string | null> {
  try {
    const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
    if (!CLERK_SECRET_KEY) {
      return null;
    }

    const res = await fetch(
      `https://api.clerk.com/v1/organizations/${orgId}/memberships?limit=10`,
      {
        headers: new Headers({
          'Authorization': `Bearer ${CLERK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        }),
      },
    );
    if (!res.ok) {
      return null;
    }

    const json = await res.json();
    const members: Array<{
      role: string;
      public_user_data: {
        identifier: string;
        first_name?: string;
        last_name?: string;
      };
    }> = json.data ?? json;

    const admin = members.find(
      m => m.role === 'admin' && m.public_user_data?.identifier !== 'admin@nativpost.com',
    );
    if (!admin) {
      return null;
    }

    const { first_name, last_name } = admin.public_user_data;
    return [first_name, last_name].filter(Boolean).join(' ') || null;
  } catch {
    return null;
  }
}

// -----------------------------------------------------------
// POST /api/billing/stripe-webhook
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

        // ── AI credits purchase ──
        if (sessionType === 'ai_credits') {
          const credits = Number.parseInt(session.metadata?.credits ?? '0', 10);
          if (credits > 0) {
            await addAiCredits(orgId, credits, { type: 'purchase', description: `Purchased ${credits} AI credits` });
            console.log(`[Stripe Webhook] ai_credits: org=${orgId} credits=${credits}`);
          }
          break;
        }

        // ── Setup fee payment ──
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
              billingInterval: session.metadata?.billingInterval ?? 'month',
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

        const env = process.env.BILLING_PLAN_ENV === 'prod' ? 'prod' : 'dev';
        const usedInterval = session.metadata?.billingInterval ?? 'month';

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
            stripeSubscriptionPriceId: usedInterval === 'year' ? (plan.stripeAnnualPriceId[env] ?? null) : (plan.stripePriceId[env] ?? null),
            billingInterval: usedInterval,
            ...(periodEnd ? { stripeSubscriptionCurrentPeriodEnd: periodEnd } : {}),
            postsPerMonth: plan.features.postsPerMonth === -1 ? 999999 : plan.features.postsPerMonth,
            platformsLimit: plan.features.platformsLimit === -1 ? 99 : plan.features.platformsLimit,
            setupFeePaid: true,
            trialEndsAt: trialEnd,
            updatedAt: new Date(),
          })
          .where(eq(organizationSchema.id, orgId));

        console.log(`[Stripe Webhook] checkout.session.completed: org=${orgId} plan=${planId}`);

        // ── Fire plan.upgraded email + Trustpilot review invitation ──
        if (subscriptionStatus === 'active') {
          const email = await getEmailForOrg(orgId);
          if (email) {
            await firePlanUpgradedEmail(email, planId);

            // Trustpilot invitation — sends 7 days after conversion.
            // Fire-and-forget, never throws, never blocks billing.
            const name = await getNameForOrg(orgId);
            sendTrustpilotInvitation({
              customerEmail: email,
              customerName: name || 'there',
              orgId,
              plan: planId,
            }).catch(() => null);
          }
        }

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

        const prevStatus = await db
          .select({ planStatus: organizationSchema.planStatus })
          .from(organizationSchema)
          .where(eq(organizationSchema.id, orgId))
          .limit(1);

        // Detect billing interval from the price ID used on the subscription
        const env = process.env.BILLING_PLAN_ENV === 'prod' ? 'prod' : 'dev';
        const isAnnualPrice = plan && plan.stripeAnnualPriceId[env] === priceId;
        const changedInterval = priceId ? (isAnnualPrice ? 'year' : 'month') : null;

        await db
          .update(organizationSchema)
          .set({
            planStatus,
            stripeSubscriptionStatus: subscription.status,
            stripeSubscriptionPriceId: priceId ?? null,
            ...(changedInterval ? { billingInterval: changedInterval } : {}),
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

        // ── Fire plan.upgraded + Trustpilot when transitioning to active ──
        // wasNotActive guard ensures we only fire once on the trial → active
        // transition, not on every subsequent renewal.
        const wasNotActive = prevStatus[0]?.planStatus !== 'active';
        if (subscription.status === 'active' && wasNotActive && plan) {
          const email = await getEmailForOrg(orgId);
          if (email) {
            await firePlanUpgradedEmail(email, plan.id);

            const name = await getNameForOrg(orgId);
            sendTrustpilotInvitation({
              customerEmail: email,
              customerName: name || 'there',
              orgId,
              plan: plan.id,
            }).catch(() => null);
          }
        }

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

        const email = await getEmailForOrg(orgId);
        if (email) {
          await fireSubscriptionCancelledEmail(email);
        }

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

      case 'customer.subscription.trial_will_end': {
        const subscription = event.data.object as Stripe.Subscription;
        const orgId = subscription.metadata?.orgId;
        if (!orgId) {
          break;
        }

        const email = await getEmailForOrg(orgId);
        if (email) {
          const { fireEmailEvent } = await import('@/lib/email-webhook');
          await fireEmailEvent('trial.ending', {
            email,
            trial_expiry_date: subscription.trial_end
              ? new Date(subscription.trial_end * 1000).toLocaleDateString('en-GB')
              : '',
          });
          console.log(`[Stripe Webhook] trial.ending email fired for org ${orgId}`);
        }
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[Stripe Webhook] Processing error:', err);
    return NextResponse.json({ error: 'Processing failed', received: true });
  }
}
