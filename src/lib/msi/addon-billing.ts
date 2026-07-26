// Add-on billing (docs §19). Attaches a Stripe subscription item to the org's
// subscription when an add-on is activated, and removes it on deactivation.
// Mirrors the metered-billing seam: gated on MSI_ADDON_BILLING_ENABLED, prices
// resolved from env, lazy Stripe client, and a safe no-op until configured —
// so activation NEVER depends on Stripe being wired.

import type Stripe from 'stripe';

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
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
 * Ensure a subscription item for this add-on/tier exists on the org's Stripe
 * subscription. Creates one, or re-prices an existing item on a tier change.
 * Returns the subscription item id, or null when billing isn't applicable
 * (flag off, no price configured, or the org has no subscription).
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

/** Remove an add-on's subscription item on deactivation (best-effort). */
export async function removeAddonBilling(itemId: string | null | undefined): Promise<void> {
  if (!itemId || !isAddonBillingEnabled()) {
    return;
  }
  const stripe = await getStripeClient();
  await stripe.subscriptionItems.del(itemId);
}
