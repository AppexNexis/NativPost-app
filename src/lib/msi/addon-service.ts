// MSI add-on activation service (docs §19). Thin DB layer over the pure catalog
// (addons.ts). Activating an add-on is an upsert into `msi_addon_subscription`
// keyed by (org, addon); deactivating flips status to cancelled. Billing linkage
// (Stripe subscription item per tier) mirrors the metered pattern and is wired
// separately — this layer stores the selection and stays billing-ready.

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { msiAddonSubscriptionSchema } from '@/models/Schema';

import type { MsiAddon } from './addons';
import { validateActivation } from './addons';

export interface OrgAddon {
  addonId: string;
  status: string;
  tierId: string | null;
  stripeSubscriptionItemId: string | null;
  activatedAt: Date | null;
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
  return { ok: true, addon: v.addon };
}

/** Deactivate an add-on (soft — keeps the row for history/reactivation). */
export async function deactivateAddon(orgId: string, addonId: string): Promise<void> {
  await db
    .update(msiAddonSubscriptionSchema)
    .set({ status: 'cancelled', cancelledAt: new Date() })
    .where(
      and(
        eq(msiAddonSubscriptionSchema.orgId, orgId),
        eq(msiAddonSubscriptionSchema.addonId, addonId),
      ),
    );
}
