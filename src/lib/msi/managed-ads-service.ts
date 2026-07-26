// Managed Advertising service (docs §19). Create ad campaigns (one-time setup
// fee), record spend (management fee = pct of spend, billed as an invoice item).
// Billing is best-effort + gated (MSI_ADDON_BILLING_ENABLED) — a Stripe hiccup
// never blocks the operational record.

import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { managedAccountSchema, msiAdCampaignSchema } from '@/models/Schema';

import { billOneOffInvoiceItem } from './addon-billing';
import { isAddonActive } from './addon-service';
import {
  AD_SETUP_FEE_CENTS,
  computeManagementFeeCents,
  isValidManagementPct,
} from './managed-ads';

const ADS_ADDON = 'managed_ads';

export interface AdCampaign {
  id: string;
  managedAccountId: string;
  accountName: string | null;
  name: string;
  platform: string;
  status: string;
  managementPct: number;
  spendCents: number;
  createdAt: Date;
}

export async function listCampaigns(orgId: string): Promise<AdCampaign[]> {
  return db
    .select({
      id: msiAdCampaignSchema.id,
      managedAccountId: msiAdCampaignSchema.managedAccountId,
      accountName: managedAccountSchema.displayName,
      name: msiAdCampaignSchema.name,
      platform: msiAdCampaignSchema.platform,
      status: msiAdCampaignSchema.status,
      managementPct: msiAdCampaignSchema.managementPct,
      spendCents: msiAdCampaignSchema.spendCents,
      createdAt: msiAdCampaignSchema.createdAt,
    })
    .from(msiAdCampaignSchema)
    .leftJoin(
      managedAccountSchema,
      eq(msiAdCampaignSchema.managedAccountId, managedAccountSchema.id),
    )
    .where(eq(msiAdCampaignSchema.orgId, orgId))
    .orderBy(desc(msiAdCampaignSchema.createdAt));
}

export type CreateCampaignOutcome =
  | { ok: true; campaignId: string }
  | { ok: false; error: string };

/** Create a campaign (gated on the add-on). Bills the one-time setup fee. */
export async function createCampaign(input: {
  orgId: string;
  managedAccountId: string;
  name: string;
  platform: string;
  managementPct: number;
  objective?: string;
}): Promise<CreateCampaignOutcome> {
  const { orgId, managedAccountId } = input;
  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: 'A campaign name is required.' };
  }
  if (!isValidManagementPct(input.managementPct)) {
    return { ok: false, error: 'Management fee must be a whole number between 10% and 20%.' };
  }
  if (!(await isAddonActive(orgId, ADS_ADDON))) {
    return { ok: false, error: 'Managed Advertising is not active. Activate it in Add-ons first.' };
  }

  const [account] = await db
    .select({ id: managedAccountSchema.id })
    .from(managedAccountSchema)
    .where(and(eq(managedAccountSchema.id, managedAccountId), eq(managedAccountSchema.orgId, orgId)))
    .limit(1);
  if (!account) {
    return { ok: false, error: 'Managed account not found.' };
  }

  const [row] = await db
    .insert(msiAdCampaignSchema)
    .values({
      orgId,
      managedAccountId,
      name,
      platform: input.platform,
      objective: input.objective,
      status: 'active',
      managementPct: input.managementPct,
    })
    .returning({ id: msiAdCampaignSchema.id });

  // Best-effort one-time setup fee.
  try {
    await billOneOffInvoiceItem({
      orgId,
      amountCents: AD_SETUP_FEE_CENTS,
      description: `Ad campaign setup — ${name}`,
    });
  } catch (billErr) {
    console.error('[MSI] ad setup-fee billing failed (campaign still created):', billErr);
  }

  return { ok: true, campaignId: row!.id };
}

export type RecordSpendOutcome =
  | { ok: true; feeCents: number; totalSpendCents: number }
  | { ok: false; error: string };

/**
 * Record ad spend for a campaign and bill the management fee (pct of the spend
 * just recorded) as an invoice item. Operator action.
 */
export async function recordSpend(campaignId: string, spendCents: number): Promise<RecordSpendOutcome> {
  if (!Number.isInteger(spendCents) || spendCents <= 0) {
    return { ok: false, error: 'Spend must be a positive amount.' };
  }
  const [campaign] = await db
    .select({
      orgId: msiAdCampaignSchema.orgId,
      name: msiAdCampaignSchema.name,
      managementPct: msiAdCampaignSchema.managementPct,
      spendCents: msiAdCampaignSchema.spendCents,
    })
    .from(msiAdCampaignSchema)
    .where(eq(msiAdCampaignSchema.id, campaignId))
    .limit(1);
  if (!campaign) {
    return { ok: false, error: 'Campaign not found.' };
  }

  const feeCents = computeManagementFeeCents(spendCents, campaign.managementPct);

  await db
    .update(msiAdCampaignSchema)
    .set({ spendCents: sql`${msiAdCampaignSchema.spendCents} + ${spendCents}` })
    .where(eq(msiAdCampaignSchema.id, campaignId));

  // Best-effort management fee.
  try {
    await billOneOffInvoiceItem({
      orgId: campaign.orgId,
      amountCents: feeCents,
      description: `Ad management fee (${campaign.managementPct}% of spend) — ${campaign.name}`,
    });
  } catch (billErr) {
    console.error('[MSI] ad management-fee billing failed (spend still recorded):', billErr);
  }

  return { ok: true, feeCents, totalSpendCents: campaign.spendCents + spendCents };
}
