/**
 * Stripe implementation of the BillingProvider seam.
 *
 * This is a faithful extraction of what /api/billing/create-checkout,
 * /api/billing/manage, /api/billing/credits/purchase and the MSI order checkout
 * already did — same session parameters, same metadata keys, same customer
 * bootstrapping. Behaviour is unchanged; only the call site moved, so existing
 * Stripe customers and in-flight webhooks are unaffected.
 */

import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';

import type { BillingInterval } from '@/lib/plans';
import { getStripePriceId, isPlanConfiguredFor, PLAN_CONFIGS } from '@/lib/plans';
import { getDb } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';

import type {
  BillingProvider,
  CheckoutResult,
  CreditsCheckoutParams,
  ManagedAccountCheckoutParams,
  PortalSessionParams,
  SubscriptionCheckoutParams,
} from './provider';
import { BillingConfigError, withCheckoutIdParam } from './provider';

/** Stripe interpolates this token into success_url when the session completes. */
const STRIPE_SESSION_TOKEN = '{CHECKOUT_SESSION_ID}';

let client: Stripe | null = null;
let clientKey: string | null = null;

async function getStripeClient(): Promise<Stripe> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new BillingConfigError(
      'STRIPE_SECRET_KEY is not set — cannot use the Stripe billing provider.',
    );
  }
  if (client && clientKey === key) {
    return client;
  }
  const { default: StripeCtor } = await import('stripe');
  client = new StripeCtor(key);
  clientKey = key;
  return client;
}

/**
 * The org's Stripe customer id, creating one on first use.
 *
 * Also stamps `paymentType: 'stripe'` so /api/billing/status can tell which
 * rail the live subscription is on — unchanged from the original routes.
 */
async function ensureCustomer(orgId: string): Promise<string> {
  const db = await getDb();
  const [org] = await db
    .select({ stripeCustomerId: organizationSchema.stripeCustomerId })
    .from(organizationSchema)
    .where(eq(organizationSchema.id, orgId))
    .limit(1);

  if (org?.stripeCustomerId) {
    await db
      .update(organizationSchema)
      .set({ paymentType: 'stripe' })
      .where(eq(organizationSchema.id, orgId));
    return org.stripeCustomerId;
  }

  const stripe = await getStripeClient();
  const customer = await stripe.customers.create({ metadata: { orgId } });
  await db
    .update(organizationSchema)
    .set({ stripeCustomerId: customer.id, paymentType: 'stripe' })
    .where(eq(organizationSchema.id, orgId));
  return customer.id;
}

export const stripeProvider: BillingProvider = {
  id: 'stripe',
  label: 'Stripe',

  isConfigured() {
    return !!process.env.STRIPE_SECRET_KEY;
  },

  isPlanPurchasable(planId: string, interval?: BillingInterval) {
    return isPlanConfiguredFor('stripe', planId, interval);
  },

  async createSubscriptionCheckout(
    params: SubscriptionCheckoutParams,
  ): Promise<CheckoutResult> {
    const { orgId, planId, interval, successUrl, cancelUrl } = params;
    const plan = PLAN_CONFIGS[planId];
    if (!plan || plan.isFree) {
      throw new BillingConfigError('Invalid plan.');
    }
    if (!isPlanConfiguredFor('stripe', planId, interval)) {
      throw new BillingConfigError(
        'This plan is not yet available for purchase. Contact support.',
      );
    }

    const customerId = await ensureCustomer(orgId);
    const priceId = getStripePriceId(planId, interval)!;
    const stripe = await getStripeClient();

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      // No trial — the free plan already served as one.
      subscription_data: {
        metadata: { orgId, planId, billingInterval: interval },
      },
      billing_address_collection: 'auto',
      success_url: withCheckoutIdParam(
        successUrl,
        'session_id',
        STRIPE_SESSION_TOKEN,
      ),
      cancel_url: cancelUrl,
      metadata: { orgId, planId, billingInterval: interval },
    });

    if (!session.url) {
      throw new Error('Stripe returned a checkout session without a URL.');
    }
    return { url: session.url };
  },

  async createCreditsCheckout(
    params: CreditsCheckoutParams,
  ): Promise<CheckoutResult> {
    const { orgId, credits, amountUsd, successUrl, cancelUrl } = params;
    const customerId = await ensureCustomer(orgId);
    const stripe = await getStripeClient();

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${credits} AI Credits`,
              description: `One-time purchase of ${credits} additional AI credits for NativPost AI Studio.`,
            },
            unit_amount: Math.round(amountUsd * 100),
          },
          quantity: 1,
        },
      ],
      metadata: { orgId, type: 'ai_credits', credits: String(credits) },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    if (!session.url) {
      throw new Error('Stripe returned a checkout session without a URL.');
    }
    return { url: session.url };
  },

  async createManagedAccountCheckout(
    params: ManagedAccountCheckoutParams,
  ): Promise<CheckoutResult> {
    const {
      orgId,
      orderId,
      quantity,
      unitAmountCents,
      description,
      successUrl,
      cancelUrl,
    } = params;

    const customerId = await ensureCustomer(orgId);
    const stripe = await getStripeClient();

    // Metered per-post usage item. No `quantity` — a metered price derives its
    // quantity from reported meter events (docs §6). Omitted entirely when the
    // price id isn't configured.
    const meteredPriceId = process.env.STRIPE_MSI_POST_PRICE_ID;
    const metadata = { type: 'msi_order', msiOrderId: orderId, orgId };

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Managed social account',
              ...(description ? { description } : {}),
            },
            unit_amount: unitAmountCents,
            recurring: { interval: 'month' },
          },
          quantity,
        },
        ...(meteredPriceId ? [{ price: meteredPriceId }] : []),
      ],
      metadata,
      subscription_data: { metadata },
      billing_address_collection: 'auto',
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    if (!session.url) {
      throw new Error('Stripe returned a checkout session without a URL.');
    }
    return { url: session.url };
  },

  async createPortalSession(
    params: PortalSessionParams,
  ): Promise<CheckoutResult> {
    const db = await getDb();
    const [org] = await db
      .select({ stripeCustomerId: organizationSchema.stripeCustomerId })
      .from(organizationSchema)
      .where(eq(organizationSchema.id, params.orgId))
      .limit(1);

    if (!org?.stripeCustomerId) {
      throw new BillingConfigError(
        'No billing account found. Subscribe to a plan first.',
      );
    }

    const stripe = await getStripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: params.returnUrl,
    });

    return { url: session.url };
  },
};
