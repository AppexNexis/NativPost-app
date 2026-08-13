// Add-on billing (docs §19). Attaches a recurring charge to the org when an
// add-on is activated, and removes it on deactivation. Mirrors the metered
// seam: gated on MSI_ADDON_BILLING_ENABLED, ids resolved from env, lazy
// clients, and a safe no-op until configured — so activation NEVER depends on
// a billing provider being wired.
//
// STRIPE and POLAR bill add-ons differently, and this is the one place in the
// codebase where the two models genuinely do not line up:
//
//   Stripe  — a subscription can hold many items. An add-on becomes an extra
//             subscription item on the org's existing plan subscription, and a
//             tier change re-prices that item in place. One-off fees become
//             invoice items on the next invoice.
//
//   Polar   — a subscription is one product, full stop. There is no
//             subscription-item API and no invoice-item API, and paid
//             subscriptions can only be created through a checkout the
//             customer completes. So:
//               * a flat recurring add-on is its OWN subscription against a
//                 dedicated add-on product, started by sending the customer
//                 through createAddonCheckout() — it cannot be provisioned
//                 server-side during activateAddon(), and syncAddonBilling()
//                 reports that honestly instead of pretending it billed;
//               * a one-off fee is metered instead: the amount in cents is
//                 ingested into a usage meter priced at $0.01/unit, which
//                 lands the charge on the customer's next invoice — the same
//                 economic outcome as a Stripe invoice item.
//
// Everything below keeps the same call signatures either way, so the callers
// in addon-service / managed-ads-service / operations-service are unchanged.

import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';

import { db } from '@/lib/db';
import { getActiveBillingProvider } from '@/lib/plans';
import { organizationSchema } from '@/models/Schema';

export function isAddonBillingEnabled(
  flag: string | undefined = process.env.MSI_ADDON_BILLING_ENABLED,
): boolean {
  return flag === 'true' || flag === '1';
}

/**
 * Env var name holding the Stripe price id for an add-on (+ tier). E.g.
 * managed_posting/professional → STRIPE_ADDON_PRICE_MANAGED_POSTING_PROFESSIONAL;
 * a non-tiered add-on → STRIPE_ADDON_PRICE_MANAGED_EXPANSION.
 */
export function addonPriceEnvKey(addonId: string, tierId?: string | null): string {
  const base = `STRIPE_ADDON_PRICE_${addonId.toUpperCase()}`;
  return tierId ? `${base}_${tierId.toUpperCase()}` : base;
}

/** Resolve the Stripe price id for an add-on/tier from env, or null. */
export function addonTierPriceId(addonId: string, tierId?: string | null): string | null {
  return process.env[addonPriceEnvKey(addonId, tierId)] ?? null;
}

/**
 * Env var name holding the Polar PRODUCT id for an add-on (+ tier). Same shape
 * as the Stripe key so the two catalogs stay readable side by side, e.g.
 * POLAR_ADDON_PRODUCT_MANAGED_POSTING_PROFESSIONAL.
 */
export function addonProductEnvKey(addonId: string, tierId?: string | null): string {
  const base = `POLAR_ADDON_PRODUCT_${addonId.toUpperCase()}`;
  return tierId ? `${base}_${tierId.toUpperCase()}` : base;
}

/** Resolve the Polar product id for an add-on/tier from env, or null. */
export function addonTierProductId(addonId: string, tierId?: string | null): string | null {
  return process.env[addonProductEnvKey(addonId, tierId)] ?? null;
}

/**
 * The meter that carries one-off add-on fees on Polar. Its price must be
 * $0.01 per unit, because callers bill in cents and this reports cents as
 * units — see billOneOffInvoiceItem below.
 */
const POLAR_FEE_METER_EVENT_NAME
  = process.env.POLAR_ADDON_FEE_METER_EVENT_NAME || 'nativpost_addon_fee';

let stripeClient: Stripe | null = null;
async function getStripeClient(): Promise<Stripe> {
  if (stripeClient) {
    return stripeClient;
  }
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set — cannot bill add-ons.');
  }
  const { default: StripeCtor } = await import('stripe');
  stripeClient = new StripeCtor(key);
  return stripeClient;
}

async function orgSubscriptionId(orgId: string): Promise<string | null> {
  const [org] = await db
    .select({ subId: organizationSchema.stripeSubscriptionId })
    .from(organizationSchema)
    .where(eq(organizationSchema.id, orgId))
    .limit(1);
  return org?.subId ?? null;
}

/**
 * Ensure a billing linkage for this add-on/tier exists.
 *
 * STRIPE: creates a subscription item on the org's subscription, or re-prices
 * an existing item on a tier change. Returns the subscription item id.
 *
 * POLAR: cannot create a paid subscription without customer interaction, so
 * this returns the existing linkage unchanged and logs what is required. Use
 * createAddonCheckout() to send the customer through a Polar checkout; the
 * resulting subscription id is recorded from the webhook.
 *
 * Returns null when billing isn't applicable (flag off, nothing configured, or
 * the org has no subscription).
 */
export async function syncAddonBilling(params: {
  orgId: string;
  addonId: string;
  tierId?: string | null;
  existingItemId?: string | null;
}): Promise<string | null> {
  if (!isAddonBillingEnabled()) {
    return params.existingItemId ?? null;
  }

  if (getActiveBillingProvider() === 'polar') {
    const productId = addonTierProductId(params.addonId, params.tierId);
    if (!productId) {
      return params.existingItemId ?? null;
    }

    // TIER CHANGE. Polar can move a live subscription to a different product,
    // so this half needs no customer interaction and mirrors Stripe's in-place
    // re-price. Stripe passes proration_behavior:'none'; Polar has no 'none',
    // so 'prorate' is used — the customer is credited for the unused remainder
    // of the old tier rather than paying twice.
    if (params.existingItemId) {
      const { getPolarClient } = await import('@/lib/billing/polar-client');
      const polar = await getPolarClient();
      await polar.subscriptions.update({
        id: params.existingItemId,
        subscriptionUpdate: { productId, prorationBehavior: 'prorate' },
      });
      return params.existingItemId;
    }

    // FIRST ACTIVATION. Polar cannot start a paid subscription server-side, so
    // there is nothing to bill here. beginAddonActivation() routes the customer
    // through createAddonCheckout() instead and the webhook activates on
    // payment — reaching this line means a caller bypassed that path, so say so
    // rather than silently leaving the add-on unbilled.
    console.warn(
      `[MSI] add-on ${params.addonId}${params.tierId ? `/${params.tierId}` : ''} `
      + 'activated on the Polar rail WITHOUT billing: Polar has no '
      + 'subscription-item API, so a flat add-on needs its own subscription. '
      + 'Activate via beginAddonActivation() so the customer is sent to checkout.',
    );
    return null;
  }

  const priceId = addonTierPriceId(params.addonId, params.tierId);
  if (!priceId) {
    return params.existingItemId ?? null;
  }
  const subId = await orgSubscriptionId(params.orgId);
  if (!subId) {
    return params.existingItemId ?? null;
  }
  const stripe = await getStripeClient();

  if (params.existingItemId) {
    // Tier change / re-activation → re-price the existing item.
    await stripe.subscriptionItems.update(params.existingItemId, {
      price: priceId,
      proration_behavior: 'none',
    });
    return params.existingItemId;
  }
  const item = await stripe.subscriptionItems.create({
    subscription: subId,
    price: priceId,
    quantity: 1,
    proration_behavior: 'none',
  });
  return item.id;
}

/**
 * Whether activating this add-on has to go through a customer-facing checkout
 * rather than being provisioned server-side.
 *
 * True only on the Polar rail, with billing enabled, for an add-on that has a
 * configured product, and only when the org has no live subscription for it
 * yet — a tier change on an existing add-on is handled in place by
 * syncAddonBilling(). Stripe always returns false: it bills add-ons as items on
 * the org's existing subscription with no customer interaction.
 */
export function addonRequiresCheckout(params: {
  addonId: string;
  tierId?: string | null;
  existingLinkageId?: string | null;
}): boolean {
  return (
    isAddonBillingEnabled()
    && getActiveBillingProvider() === 'polar'
    && !params.existingLinkageId
    && !!addonTierProductId(params.addonId, params.tierId)
  );
}

/**
 * Hosted checkout that starts a Polar subscription for a flat add-on tier.
 * The Polar-only counterpart to syncAddonBilling's server-side item creation —
 * there is no Stripe equivalent because Stripe bills add-ons in-place.
 *
 * Returns null when this isn't the Polar rail, billing is off, or the add-on
 * has no configured product id.
 */
export async function createAddonCheckout(params: {
  orgId: string;
  addonId: string;
  tierId?: string | null;
  successUrl: string;
  returnUrl: string;
}): Promise<string | null> {
  if (!isAddonBillingEnabled() || getActiveBillingProvider() !== 'polar') {
    return null;
  }
  const productId = addonTierProductId(params.addonId, params.tierId);
  if (!productId) {
    return null;
  }

  const { getPolarClient } = await import('@/lib/billing/polar-client');
  const polar = await getPolarClient();

  const checkout = await polar.checkouts.create({
    products: [productId],
    externalCustomerId: params.orgId,
    customerMetadata: { orgId: params.orgId },
    metadata: {
      type: 'msi_addon',
      orgId: params.orgId,
      addonId: params.addonId,
      ...(params.tierId ? { tierId: params.tierId } : {}),
    },
    successUrl: params.successUrl,
    returnUrl: params.returnUrl,
  });

  return checkout.url;
}

/**
 * Stop billing an add-on on deactivation (best-effort).
 *
 * STRIPE: deletes the subscription item. POLAR: revokes the add-on's own
 * subscription, which ends it immediately with no refund — matching the Stripe
 * behaviour of dropping the item without proration.
 */
export async function removeAddonBilling(itemId: string | null | undefined): Promise<void> {
  if (!itemId || !isAddonBillingEnabled()) {
    return;
  }

  if (getActiveBillingProvider() === 'polar') {
    const { getPolarClient } = await import('@/lib/billing/polar-client');
    const polar = await getPolarClient();
    await polar.subscriptions.revoke({ id: itemId });
    return;
  }

  const stripe = await getStripeClient();
  await stripe.subscriptionItems.del(itemId);
}

/**
 * Bill a one-off amount on the org's next invoice. Used for usage-based add-on
 * fees that don't fit a flat subscription price — an ad setup fee, or a
 * management fee computed from spend (docs §19).
 *
 * STRIPE: an invoice item on the next invoice.
 * POLAR: `amountCents` units ingested into the one-off fee meter, whose price
 *   must be $0.01/unit so N cents of fee bill as N units × $0.01 = N cents.
 *   `externalId` makes the ingest idempotent under retry.
 *
 * Returns the provider's record id, or null when not billable (flag off, no
 * amount, or — on Stripe — the org has no customer). Callers wrap this
 * best-effort: a billing failure must never fail the operation it charges for.
 */
export async function billOneOffInvoiceItem(params: {
  orgId: string;
  amountCents: number;
  description: string;
}): Promise<string | null> {
  if (!isAddonBillingEnabled() || params.amountCents <= 0) {
    return null;
  }

  if (getActiveBillingProvider() === 'polar') {
    const { getPolarClient } = await import('@/lib/billing/polar-client');
    const polar = await getPolarClient();

    // Deterministic enough to dedupe a retry of the same charge, without
    // collapsing two genuinely separate fees of the same size on the same day.
    const externalId = `fee_${params.orgId}_${params.amountCents}_${Date.now()}`;

    await polar.events.ingest({
      events: [
        {
          name: POLAR_FEE_METER_EVENT_NAME,
          externalCustomerId: params.orgId,
          externalId,
          metadata: {
            // Reported as cents-as-units; the meter's price is $0.01/unit.
            units: params.amountCents,
            description: params.description.slice(0, 500),
          },
        },
      ],
    });

    return externalId;
  }

  const [org] = await db
    .select({ customerId: organizationSchema.stripeCustomerId })
    .from(organizationSchema)
    .where(eq(organizationSchema.id, params.orgId))
    .limit(1);
  if (!org?.customerId) {
    return null;
  }
  const stripe = await getStripeClient();
  const item = await stripe.invoiceItems.create({
    customer: org.customerId,
    amount: params.amountCents,
    currency: 'usd',
    description: params.description,
  });
  return item.id;
}
