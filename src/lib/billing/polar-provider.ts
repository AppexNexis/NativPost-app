/**
 * Polar.sh implementation of the BillingProvider seam.
 *
 * Polar is a Merchant of Record: it is the seller for the transaction and
 * handles international VAT/GST/sales-tax registration and remittance, which is
 * the whole reason for running it instead of direct Stripe Billing.
 *
 * Three model differences drive everything below.
 *
 * 1. NO PRICE OBJECTS. A Polar product carries its own pricing, so monthly and
 *    yearly are two separate products (see polarProductId /
 *    polarAnnualProductId in src/lib/plans.ts). Checkout takes product ids.
 *
 * 2. EXTERNAL CUSTOMER IDS ARE FIRST-CLASS. Polar can key a customer on OUR
 *    identifier, so the Clerk orgId is passed as `externalCustomerId` and
 *    Polar creates or reuses its own customer record. That removes the
 *    "create customer, store id, look it up next time" dance Stripe needs —
 *    we still persist `polar_customer_id` when the webhook reports it, but no
 *    checkout depends on having it first.
 *
 * 3. NO cancel_url. Polar has `successUrl` (post-payment redirect) and
 *    `returnUrl` (the back link out of checkout). The seam's `cancelUrl` maps
 *    to `returnUrl`, which is the closest equivalent.
 *
 * Ad-hoc pricing is used for the one-time AI credit top-up and the MSI
 * per-account order so those keep working without pre-creating a product per
 * possible amount — the same shape as Stripe's inline `price_data`.
 */

import { eq } from 'drizzle-orm';

import type { BillingInterval } from '@/lib/plans';
import { getPolarProductId, isPlanConfiguredFor, PLAN_CONFIGS } from '@/lib/plans';
import { getDb } from '@/libs/DB';
import { organizationSchema } from '@/models/Schema';

import { getPolarClient, getPolarServer, isPolarConfigured } from './polar-client';
import type {
  BillingProvider,
  CheckoutResult,
  CreditsCheckoutParams,
  ManagedAccountCheckoutParams,
  PortalSessionParams,
  SubscriptionCheckoutParams,
} from './provider';
import { BillingConfigError, withCheckoutIdParam } from './provider';

/** Polar interpolates this token into success_url when the checkout succeeds. */
const POLAR_CHECKOUT_TOKEN = '{CHECKOUT_ID}';

/**
 * Polar metadata is limited to 50 keys, 40-char keys and 500-char values, and
 * only accepts string/number/boolean. Everything we send is a short string, so
 * this just documents the contract and keeps the shape consistent across calls.
 */
type PolarMetadata = Record<string, string>;

/**
 * Turn Polar's opaque 401 into a diagnosis.
 *
 * Polar returns `invalid_token` — "expired, revoked, malformed, or invalid for
 * other reasons" — for BOTH a genuinely bad token and the far more common
 * setup mistake: a token from one instance used against the other. Sandbox and
 * production are separate deployments with separate tokens, so a production
 * token sent to sandbox-api.polar.sh is "invalid" in exactly this way.
 *
 * Nothing here reaches the customer; it goes to the server log, because the
 * fix is an env change and the user can do nothing with it.
 */
function explainAuthFailure(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  if (!message.includes('401') && !message.includes('invalid_token')) {
    return;
  }
  const server = getPolarServer();
  console.error(
    `[Polar] 401 invalid_token while talking to the ${server} API.\n`
    + `  POLAR_SERVER resolves to '${server}' `
    + `(POLAR_SERVER=${process.env.POLAR_SERVER ?? 'unset'}, `
    + `BILLING_PLAN_ENV=${process.env.BILLING_PLAN_ENV ?? 'unset'}).\n`
    + `  The token in POLAR_ACCESS_TOKEN must have been created in the '${server}' `
    + `instance — sandbox tokens come from sandbox.polar.sh, production tokens `
    + `from polar.sh, and they are NOT interchangeable.\n`
    + `  If the token is right, check it has not been revoked and carries the `
    + `checkouts:write / customer_sessions:write scopes.`,
  );
}

/**
 * Run a Polar API call, annotating auth failures on the way out. The error
 * still propagates unchanged — this only makes the log say what to fix.
 */
async function polarCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    explainAuthFailure(err);
    throw err;
  }
}

/**
 * Whether a Polar SDK error means "this customer does not exist" rather than
 * "the call failed". Matched structurally on the status code so it survives
 * SDK error-class renames.
 */
function isNotFound(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) {
    return false;
  }
  const status = (err as { statusCode?: number; status?: number }).statusCode
    ?? (err as { status?: number }).status;
  return status === 404;
}

/**
 * Record that this org is now transacting on Polar. Mirrors what the Stripe
 * provider does with `paymentType: 'stripe'` — /api/billing/status reads this
 * column to decide which rail the live subscription is on.
 */
async function markPolarCustomer(orgId: string): Promise<void> {
  const db = await getDb();
  await db
    .update(organizationSchema)
    .set({ paymentType: 'polar' })
    .where(eq(organizationSchema.id, orgId));
}

/**
 * The org's Polar customer id, if one has been recorded. Unlike Stripe this is
 * NOT required to start a checkout — `externalCustomerId` covers that — so this
 * is only used where Polar genuinely needs the internal id.
 */
async function getPolarCustomerId(orgId: string): Promise<string | null> {
  const db = await getDb();
  const [org] = await db
    .select({ polarCustomerId: organizationSchema.polarCustomerId })
    .from(organizationSchema)
    .where(eq(organizationSchema.id, orgId))
    .limit(1);
  return org?.polarCustomerId ?? null;
}

export const polarProvider: BillingProvider = {
  id: 'polar',
  label: 'Polar',

  isConfigured() {
    return isPolarConfigured();
  },

  isPlanPurchasable(planId: string, interval?: BillingInterval) {
    return isPlanConfiguredFor('polar', planId, interval);
  },

  async createSubscriptionCheckout(
    params: SubscriptionCheckoutParams,
  ): Promise<CheckoutResult> {
    const { orgId, planId, interval, successUrl, cancelUrl, email } = params;
    const plan = PLAN_CONFIGS[planId];
    if (!plan || plan.isFree) {
      throw new BillingConfigError('Invalid plan.');
    }
    if (!isPlanConfiguredFor('polar', planId, interval)) {
      throw new BillingConfigError(
        'This plan is not yet available for purchase. Contact support.',
      );
    }

    const productId = getPolarProductId(planId, interval)!;
    const polar = await getPolarClient();

    // metadata lands on the resulting subscription AND order, so the webhook
    // can resolve the org without a lookup — the same trick the Stripe webhook
    // relies on. Keys mirror the Stripe session metadata exactly.
    const metadata: PolarMetadata = {
      orgId,
      planId,
      billingInterval: interval,
    };

    const checkout = await polarCall(() => polar.checkouts.create({
      products: [productId],
      externalCustomerId: orgId,
      ...(email ? { customerEmail: email } : {}),
      customerMetadata: { orgId },
      metadata,
      successUrl: withCheckoutIdParam(
        successUrl,
        'checkout_id',
        POLAR_CHECKOUT_TOKEN,
      ),
      returnUrl: cancelUrl,
      allowDiscountCodes: true,
    }));

    await markPolarCustomer(orgId);
    return { url: checkout.url };
  },

  async createCreditsCheckout(
    params: CreditsCheckoutParams,
  ): Promise<CheckoutResult> {
    const { orgId, credits, amountUsd, successUrl, cancelUrl, email } = params;

    // Credit top-ups are a one-time purchase at an arbitrary amount, so they use
    // an ad-hoc price against a single "AI Credits" product rather than one
    // product per pack size. The product must exist in Polar (it is what the
    // order is attributed to); the price is overridden per checkout.
    const productId = process.env.POLAR_CREDITS_PRODUCT_ID;
    if (!productId) {
      throw new BillingConfigError(
        'POLAR_CREDITS_PRODUCT_ID is not set — create a one-time "AI Credits" '
        + 'product in Polar and set its id to enable credit top-ups.',
      );
    }

    const polar = await getPolarClient();
    const metadata: PolarMetadata = {
      orgId,
      type: 'ai_credits',
      credits: String(credits),
    };

    const checkout = await polarCall(() => polar.checkouts.create({
      products: [productId],
      prices: {
        [productId]: [
          {
            amountType: 'fixed',
            priceAmount: Math.round(amountUsd * 100),
            priceCurrency: 'usd',
          },
        ],
      },
      externalCustomerId: orgId,
      ...(email ? { customerEmail: email } : {}),
      customerMetadata: { orgId },
      metadata,
      successUrl,
      returnUrl: cancelUrl,
    }));

    await markPolarCustomer(orgId);
    return { url: checkout.url };
  },

  async createManagedAccountCheckout(
    params: ManagedAccountCheckoutParams,
  ): Promise<CheckoutResult> {
    const {
      orgId,
      orderId,
      quantity,
      unitAmountCents,
      successUrl,
      cancelUrl,
    } = params;

    const productId = process.env.POLAR_MSI_ACCOUNT_PRODUCT_ID;
    if (!productId) {
      throw new BillingConfigError(
        'POLAR_MSI_ACCOUNT_PRODUCT_ID is not set — create the recurring '
        + '"Managed social account" product in Polar and set its id.',
      );
    }

    const polar = await getPolarClient();
    const metadata: PolarMetadata = {
      type: 'msi_order',
      msiOrderId: orderId,
      orgId,
    };

    // Polar checkout has no per-line quantity for a fixed price, so N accounts
    // are billed as one line at N × the per-account rate. The order row keeps
    // the real quantity, and fulfilment fans out from there exactly as before.
    const checkout = await polarCall(() => polar.checkouts.create({
      products: [productId],
      prices: {
        [productId]: [
          {
            amountType: 'fixed',
            priceAmount: unitAmountCents * quantity,
            priceCurrency: 'usd',
          },
        ],
      },
      externalCustomerId: orgId,
      customerMetadata: { orgId },
      metadata,
      successUrl,
      returnUrl: cancelUrl,
    }));

    await markPolarCustomer(orgId);
    return { url: checkout.url };
  },

  async createPortalSession(
    params: PortalSessionParams,
  ): Promise<CheckoutResult> {
    const { orgId, returnUrl } = params;
    const polar = await getPolarClient();

    // A customer session is a short-lived, pre-authenticated link into the
    // hosted portal — the customer does NOT have to request an email code.
    // Prefer the recorded internal id; fall back to the external id (the Clerk
    // orgId), which works as soon as any Polar checkout has been started.
    const customerId = await getPolarCustomerId(orgId);

    try {
      const session = customerId
        ? await polar.customerSessions.create({ customerId, returnUrl })
        : await polar.customerSessions.create({
          externalCustomerId: orgId,
          returnUrl,
        });
      return { url: session.customerPortalUrl };
    } catch (err) {
      // Polar 404s when no customer exists yet — i.e. the org has never
      // checked out. That is a real answer for the user, and gets the same
      // message the Stripe path gives. Anything else (auth failure, outage)
      // must propagate as a 500 rather than being disguised as "no account",
      // which would send the user off to buy a plan they already have.
      if (isNotFound(err)) {
        throw new BillingConfigError(
          'No billing account found. Subscribe to a plan first.',
        );
      }
      throw err;
    }
  },
};
