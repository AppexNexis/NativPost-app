// MSI add-on activation service (docs §19). Thin DB layer over the pure catalog
// (addons.ts). Activating an add-on is an upsert into `msi_addon_subscription`
// keyed by (org, addon); deactivating flips status to cancelled. Billing linkage
// mirrors the metered pattern and is wired
// separately — this layer stores the selection and stays billing-ready.
//
// The linkage id means different things per rail (a Stripe subscription ITEM
// vs a Polar SUBSCRIPTION — see addon-billing.ts), so it lives in two columns
// and `billingLinkageId` below reads whichever belongs to the active provider.

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { getActiveBillingProvider } from '@/lib/plans';
import { msiAddonSubscriptionSchema } from '@/models/Schema';

import { removeAddonBilling, syncAddonBilling } from './addon-billing';
import type { MsiAddon } from './addons';
import { validateActivation } from './addons';

export type OrgAddon = {
  addonId: string;
  status: string;
  tierId: string | null;
  stripeSubscriptionItemId: string | null;
  polarSubscriptionId: string | null;
  activatedAt: Date | null;
};

/** The billing linkage id for the rail currently in use. */
export function billingLinkageId(addon: OrgAddon | null | undefined): string | null {
  if (!addon) {
    return null;
  }
  return getActiveBillingProvider() === 'polar'
    ? addon.polarSubscriptionId
    : addon.stripeSubscriptionItemId;
}

/** The column the linkage id belongs in, for the rail currently in use. */
function linkageColumn(id: string | null) {
  return getActiveBillingProvider() === 'polar'
    ? { polarSubscriptionId: id }
    : { stripeSubscriptionItemId: id };
}

export type ActivateOutcome =
  | { ok: true; addon: MsiAddon }
  | { ok: false; error: string };

/** All add-on rows for an org (any status). */
export async function listOrgAddons(orgId: string): Promise<OrgAddon[]> {
  return db
    .select({
      addonId: msiAddonSubscriptionSchema.addonId,
      status: msiAddonSubscriptionSchema.status,
      tierId: msiAddonSubscriptionSchema.tierId,
      stripeSubscriptionItemId: msiAddonSubscriptionSchema.stripeSubscriptionItemId,
      polarSubscriptionId: msiAddonSubscriptionSchema.polarSubscriptionId,
      activatedAt: msiAddonSubscriptionSchema.activatedAt,
    })
    .from(msiAddonSubscriptionSchema)
    .where(eq(msiAddonSubscriptionSchema.orgId, orgId));
}

/** A single add-on row for an org, or null. */
export async function getOrgAddon(orgId: string, addonId: string): Promise<OrgAddon | null> {
  const [row] = await db
    .select({
      addonId: msiAddonSubscriptionSchema.addonId,
      status: msiAddonSubscriptionSchema.status,
      tierId: msiAddonSubscriptionSchema.tierId,
      stripeSubscriptionItemId: msiAddonSubscriptionSchema.stripeSubscriptionItemId,
      polarSubscriptionId: msiAddonSubscriptionSchema.polarSubscriptionId,
      activatedAt: msiAddonSubscriptionSchema.activatedAt,
    })
    .from(msiAddonSubscriptionSchema)
    .where(
      and(
        eq(msiAddonSubscriptionSchema.orgId, orgId),
        eq(msiAddonSubscriptionSchema.addonId, addonId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** True when the org has this add-on in the `active` state. */
export async function isAddonActive(orgId: string, addonId: string): Promise<boolean> {
  const row = await getOrgAddon(orgId, addonId);
  return row?.status === 'active';
}

/**
 * Activate (or re-activate) an add-on for an org. Validates the add-on + tier
 * against the catalog, then upserts on (org, addon). Idempotent: re-activating
 * clears any prior cancellation and updates the tier.
 */
export async function activateAddon(
  orgId: string,
  addonId: string,
  tierId?: string | null,
): Promise<ActivateOutcome> {
  const v = validateActivation(addonId, tierId);
  if (!v.ok) {
    return v;
  }
  const now = new Date();
  // Know the prior billing linkage (if any) so a re-activation / tier change
  // re-prices it instead of orphaning a Stripe item or Polar subscription.
  const existing = await getOrgAddon(orgId, addonId);
  const existingLinkage = billingLinkageId(existing);

  await db
    .insert(msiAddonSubscriptionSchema)
    .values({
      orgId,
      addonId,
      status: 'active',
      tierId: v.tier?.id ?? null,
      activatedAt: now,
    })
    .onConflictDoUpdate({
      target: [msiAddonSubscriptionSchema.orgId, msiAddonSubscriptionSchema.addonId],
      set: {
        status: 'active',
        tierId: v.tier?.id ?? null,
        activatedAt: now,
        cancelledAt: null,
      },
    });

  // Best-effort billing: a provider hiccup must never fail activation. No-op
  // until MSI_ADDON_BILLING_ENABLED + the price/product env vars are configured.
  try {
    const itemId = await syncAddonBilling({
      orgId,
      addonId,
      tierId: v.tier?.id ?? null,
      existingItemId: existingLinkage,
    });
    if (itemId && itemId !== existingLinkage) {
      await db
        .update(msiAddonSubscriptionSchema)
        .set(linkageColumn(itemId))
        .where(
          and(
            eq(msiAddonSubscriptionSchema.orgId, orgId),
            eq(msiAddonSubscriptionSchema.addonId, addonId),
          ),
        );
    }
  } catch (billingErr) {
    console.error('[MSI] add-on billing sync failed (activation still applied):', billingErr);
  }

  return { ok: true, addon: v.addon };
}

/** Deactivate an add-on (soft — keeps the row for history/reactivation). */
export async function deactivateAddon(orgId: string, addonId: string): Promise<void> {
  const existing = await getOrgAddon(orgId, addonId);

  // Best-effort: drop the provider-side linkage so billing stops.
  try {
    await removeAddonBilling(billingLinkageId(existing));
  } catch (billingErr) {
    console.error('[MSI] add-on billing removal failed (deactivation still applied):', billingErr);
  }

  await db
    .update(msiAddonSubscriptionSchema)
    .set({ status: 'cancelled', cancelledAt: new Date(), ...linkageColumn(null) })
    .where(
      and(
        eq(msiAddonSubscriptionSchema.orgId, orgId),
        eq(msiAddonSubscriptionSchema.addonId, addonId),
      ),
    );
}
