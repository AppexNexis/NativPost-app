import { eq } from 'drizzle-orm';

import { getDb } from '@/libs/DB';
import { brandProfileSchema, mediaAssetSchema, organizationSchema } from '@/models/Schema';

export { IMAGE_ENGINE_URL, VIDEO_ENGINE_URL, ENGINE_API_KEY, engineAuthHeaders } from './engine';

export interface BrandTokens {
  brandName: string;
  brandPrimary: string;
  brandSecondary?: string;
  brandAccent?: string;
  logoUrl?: string;
  fontPreference?: string;
  industry?: string;
}

export async function fetchBrandTokens(orgId: string): Promise<BrandTokens> {
  const db = await getDb();
  const [profile] = await db
    .select({
      brandName: brandProfileSchema.brandName,
      primaryColor: brandProfileSchema.primaryColor,
      secondaryColor: brandProfileSchema.secondaryColor,
      accentColor: brandProfileSchema.accentColor,
      logoUrl: brandProfileSchema.logoUrl,
      fontPreference: brandProfileSchema.fontPreference,
      industry: brandProfileSchema.industry,
    })
    .from(brandProfileSchema)
    .where(eq(brandProfileSchema.orgId, orgId))
    .limit(1);

  return {
    brandName: profile?.brandName || 'NativPost',
    brandPrimary: profile?.primaryColor || '#864FFE',
    brandSecondary: profile?.secondaryColor || '#0D0D0D',
    brandAccent: profile?.accentColor || '#FFFFFF',
    logoUrl: profile?.logoUrl || undefined,
    fontPreference: profile?.fontPreference || undefined,
    industry: profile?.industry || undefined,
  };
}

// ── AI Credits Wallet ────────────────────────────────────────────────────────

export interface CreditActivity {
  id: string;
  type: 'generation' | 'purchase' | 'bonus' | 'refund' | 'subscription_renewal' | 'credit_consumption';
  description: string;
  amount: number; // negative for spend, positive for top-up
  balanceAfter: number;
  createdAt: string;
}

export interface AutoTopUpConfig {
  enabled: boolean;
  /** Balance in dollars below which auto top-up fires. */
  threshold: number;
  /** Dollar amount to top up when the threshold is crossed. */
  amountUsd: number;
}

export interface LowBalanceAlertConfig {
  enabled: boolean;
  /** Balance in dollars below which to send an email alert. */
  threshold: number;
  lastNotifiedAt: string | null;
}

export interface MonthlyUsage {
  /** ISO date, first of current UTC month. */
  periodStart: string;
  /** Credits spent since periodStart. */
  creditsSpent: number;
}

export interface AiCreditWallet {
  monthly: {
    limit: number;
    used: number;
    resetAt: string; // ISO date
  };
  addon: {
    used: number;
    remaining: number;
  };
  recentActivity: CreditActivity[];
  /** Credits held for in-flight AI Studio jobs (reserved but not spent). */
  reservedCredits?: number;
  /** AI Studio job ids currently holding a reservation. */
  pendingJobs?: string[];
  autoTopUp: AutoTopUpConfig;
  lowBalanceAlert: LowBalanceAlertConfig;
  monthlyUsage: MonthlyUsage;
}

const ACTIVITY_LIMIT = 50;
const DEFAULT_MONTHLY_LIMIT = 50; // fallback if plan cannot be determined

function startOfNextMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);
}

function startOfCurrentMonthUtc(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

const DEFAULT_AUTO_TOP_UP: AutoTopUpConfig = {
  enabled: false,
  threshold: 10,
  amountUsd: 20,
};

const DEFAULT_LOW_BALANCE_ALERT: LowBalanceAlertConfig = {
  enabled: false,
  threshold: 10,
  lastNotifiedAt: null,
};

function resetMonthlyIfNeeded(wallet: AiCreditWallet): AiCreditWallet {
  const now = new Date();
  const resetAt = new Date(wallet.monthly.resetAt);
  if (now >= resetAt) {
    return {
      ...wallet,
      monthly: {
        limit: wallet.monthly.limit,
        used: 0,
        resetAt: startOfNextMonth().toISOString(),
      },
    };
  }
  return wallet;
}

function getDefaultWallet(monthlyLimit?: number): AiCreditWallet {
  return {
    monthly: {
      limit: monthlyLimit ?? DEFAULT_MONTHLY_LIMIT,
      used: 0,
      resetAt: startOfNextMonth().toISOString(),
    },
    addon: {
      used: 0,
      remaining: 0,
    },
    recentActivity: [],
    autoTopUp: { ...DEFAULT_AUTO_TOP_UP },
    lowBalanceAlert: { ...DEFAULT_LOW_BALANCE_ALERT },
    monthlyUsage: {
      periodStart: startOfCurrentMonthUtc(),
      creditsSpent: 0,
    },
  };
}

function readWallet(settings: Record<string, unknown>, monthlyLimit?: number): AiCreditWallet {
  const fallbackLimit = monthlyLimit ?? DEFAULT_MONTHLY_LIMIT;
  const raw = settings.aiCredits as Partial<AiCreditWallet> | undefined;
  if (!raw || typeof raw !== 'object') return getDefaultWallet(monthlyLimit);

  const rawAutoTopUp = (raw as any).autoTopUp as Partial<AutoTopUpConfig> | undefined;
  const rawLowBalance = (raw as any).lowBalanceAlert as Partial<LowBalanceAlertConfig> | undefined;
  const rawMonthlyUsage = (raw as any).monthlyUsage as Partial<MonthlyUsage> | undefined;

  const wallet: AiCreditWallet = {
    monthly: {
      limit: typeof raw.monthly?.limit === 'number' ? raw.monthly.limit : fallbackLimit,
      used: typeof raw.monthly?.used === 'number' ? raw.monthly.used : 0,
      resetAt: typeof raw.monthly?.resetAt === 'string' ? raw.monthly.resetAt : startOfNextMonth().toISOString(),
    },
    addon: {
      used: typeof raw.addon?.used === 'number' ? raw.addon.used : 0,
      remaining: typeof raw.addon?.remaining === 'number' ? raw.addon.remaining : 0,
    },
    recentActivity: Array.isArray(raw.recentActivity) ? raw.recentActivity : [],
    reservedCredits: typeof raw.reservedCredits === 'number' ? raw.reservedCredits : 0,
    pendingJobs: Array.isArray(raw.pendingJobs) ? raw.pendingJobs : [],
    autoTopUp: {
      enabled: typeof rawAutoTopUp?.enabled === 'boolean' ? rawAutoTopUp.enabled : DEFAULT_AUTO_TOP_UP.enabled,
      threshold: typeof rawAutoTopUp?.threshold === 'number' ? rawAutoTopUp.threshold : DEFAULT_AUTO_TOP_UP.threshold,
      amountUsd: typeof rawAutoTopUp?.amountUsd === 'number' ? rawAutoTopUp.amountUsd : DEFAULT_AUTO_TOP_UP.amountUsd,
    },
    lowBalanceAlert: {
      enabled: typeof rawLowBalance?.enabled === 'boolean' ? rawLowBalance.enabled : DEFAULT_LOW_BALANCE_ALERT.enabled,
      threshold: typeof rawLowBalance?.threshold === 'number' ? rawLowBalance.threshold : DEFAULT_LOW_BALANCE_ALERT.threshold,
      lastNotifiedAt: typeof rawLowBalance?.lastNotifiedAt === 'string' ? rawLowBalance.lastNotifiedAt : null,
    },
    monthlyUsage: rollMonthlyUsage({
      periodStart: typeof rawMonthlyUsage?.periodStart === 'string' ? rawMonthlyUsage.periodStart : startOfCurrentMonthUtc(),
      creditsSpent: typeof rawMonthlyUsage?.creditsSpent === 'number' ? rawMonthlyUsage.creditsSpent : 0,
    }),
  };

  return resetMonthlyIfNeeded(wallet);
}

function rollMonthlyUsage(usage: MonthlyUsage): MonthlyUsage {
  const currentStart = startOfCurrentMonthUtc();
  if (usage.periodStart !== currentStart) {
    return { periodStart: currentStart, creditsSpent: 0 };
  }
  return usage;
}

function totalAvailable(wallet: AiCreditWallet): number {
  const monthlyRemaining = Math.max(0, wallet.monthly.limit - wallet.monthly.used);
  return monthlyRemaining + wallet.addon.remaining;
}

export async function getAiCreditsWallet(orgId: string, planMonthlyLimit?: number): Promise<AiCreditWallet> {
  const db = await getDb();
  const [org] = await db
    .select({ settings: organizationSchema.settings })
    .from(organizationSchema)
    .where(eq(organizationSchema.id, orgId))
    .limit(1);

  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const wallet = readWallet(settings, planMonthlyLimit);

  // If this is the first read, persist the seeded wallet.
  if (!settings.aiCredits) {
    await db
      .update(organizationSchema)
      .set({ settings: { ...settings, aiCredits: wallet } })
      .where(eq(organizationSchema.id, orgId));
  }

  return wallet;
}

export interface SpendResult {
  wallet: AiCreditWallet;
  remainingCredits: number;
}

export async function spendAiCredits(
  orgId: string,
  amount: number,
  activity: Omit<CreditActivity, 'id' | 'amount' | 'balanceAfter' | 'createdAt'>,
): Promise<SpendResult> {
  if (amount <= 0) {
    const wallet = await getAiCreditsWallet(orgId);
    return { wallet, remainingCredits: totalAvailable(wallet) };
  }

  const db = await getDb();
  const [org] = await db
    .select({ settings: organizationSchema.settings })
    .from(organizationSchema)
    .where(eq(organizationSchema.id, orgId))
    .limit(1);

  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  let wallet = readWallet(settings);

  if (totalAvailable(wallet) < amount) {
    throw new Error('INSUFFICIENT_CREDITS');
  }

  const monthlyRemaining = Math.max(0, wallet.monthly.limit - wallet.monthly.used);
  let remainingToCharge = amount;

  if (monthlyRemaining > 0) {
    const fromMonthly = Math.min(monthlyRemaining, remainingToCharge);
    wallet = {
      ...wallet,
      monthly: { ...wallet.monthly, used: wallet.monthly.used + fromMonthly },
    };
    remainingToCharge -= fromMonthly;
  }

  if (remainingToCharge > 0) {
    wallet = {
      ...wallet,
      addon: {
        used: wallet.addon.used + remainingToCharge,
        remaining: Math.max(0, wallet.addon.remaining - remainingToCharge),
      },
    };
  }

  // Track cumulative monthly spend for the usage dashboard.
  const usage = rollMonthlyUsage(wallet.monthlyUsage);
  wallet = {
    ...wallet,
    monthlyUsage: {
      periodStart: usage.periodStart,
      creditsSpent: usage.creditsSpent + amount,
    },
  };

  const newActivity: CreditActivity = {
    ...activity,
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    amount: -amount,
    balanceAfter: totalAvailable(wallet),
    createdAt: new Date().toISOString(),
  };

  wallet = {
    ...wallet,
    recentActivity: [newActivity, ...wallet.recentActivity].slice(0, ACTIVITY_LIMIT),
  };

  await db
    .update(organizationSchema)
    .set({ settings: { ...settings, aiCredits: wallet } })
    .where(eq(organizationSchema.id, orgId));

  return { wallet, remainingCredits: totalAvailable(wallet) };
}

export async function addAiCredits(
  orgId: string,
  amount: number,
  activity: Omit<CreditActivity, 'id' | 'amount' | 'balanceAfter' | 'createdAt'>,
): Promise<AiCreditWallet> {
  if (amount <= 0) return getAiCreditsWallet(orgId);

  const db = await getDb();
  const [org] = await db
    .select({ settings: organizationSchema.settings })
    .from(organizationSchema)
    .where(eq(organizationSchema.id, orgId))
    .limit(1);

  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const wallet = readWallet(settings);

  const updated: AiCreditWallet = {
    ...wallet,
    addon: {
      used: wallet.addon.used,
      remaining: wallet.addon.remaining + amount,
    },
    recentActivity: [
      {
        ...activity,
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        amount,
        balanceAfter: totalAvailable(wallet) + amount,
        createdAt: new Date().toISOString(),
      },
      ...wallet.recentActivity,
    ].slice(0, ACTIVITY_LIMIT),
  };

  await db
    .update(organizationSchema)
    .set({ settings: { ...settings, aiCredits: updated } })
    .where(eq(organizationSchema.id, orgId));

  return updated;
}

/**
 * Reset the monthly credit counter and record a renewal event in recent activity.
 * Called when a subscription renews or the monthly cycle turns over.
 */
export async function resetMonthlyCredits(
  orgId: string,
  newLimit: number,
): Promise<AiCreditWallet> {
  const db = await getDb();
  const [org] = await db
    .select({ settings: organizationSchema.settings })
    .from(organizationSchema)
    .where(eq(organizationSchema.id, orgId))
    .limit(1);

  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const wallet = readWallet(settings);

  const renewalEvent: CreditActivity = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'subscription_renewal',
    description: `Monthly credits reset. ${newLimit} credits available.`,
    amount: newLimit,
    balanceAfter: newLimit + wallet.addon.remaining,
    createdAt: new Date().toISOString(),
  };

  const updated: AiCreditWallet = {
    ...wallet,
    monthly: {
      limit: newLimit,
      used: 0,
      resetAt: startOfNextMonth().toISOString(),
    },
    recentActivity: [renewalEvent, ...wallet.recentActivity].slice(0, ACTIVITY_LIMIT),
  };

  await db
    .update(organizationSchema)
    .set({ settings: { ...settings, aiCredits: updated } })
    .where(eq(organizationSchema.id, orgId));

  return updated;
}

// ── Media Asset Persistence ──────────────────────────────────────────────────

export interface SavedAsset {
  id: string;
  url: string;
  format?: string;
}

export async function saveMediaAsset(
  orgId: string,
  payload: {
    url: string;
    thumbnailUrl?: string;
    assetType: string;
    aspectRatio?: string;
    source: string;
    description?: string;
    aiMetadata?: Record<string, unknown>;
    tags?: string[];
    durationSeconds?: number | null;
    width?: number | null;
    height?: number | null;
    mimeType?: string | null;
    influencerId?: string | null;
  },
): Promise<SavedAsset> {
  const db = await getDb();
  const [created] = await db
    .insert(mediaAssetSchema)
    .values({
      orgId,
      url: payload.url,
      thumbnailUrl: payload.thumbnailUrl || payload.url,
      assetType: payload.assetType,
      aspectRatio: payload.aspectRatio || null,
      source: payload.source,
      description: payload.description || null,
      aiMetadata: payload.aiMetadata || {},
      tags: payload.tags || [],
      durationSeconds: payload.durationSeconds ?? null,
      width: payload.width ?? null,
      height: payload.height ?? null,
      mimeType: payload.mimeType || null,
      influencerId: payload.influencerId || null,
    })
    .returning();

  if (!created) {
    throw new Error('Failed to save media asset');
  }

  return {
    id: created.id,
    url: created.url,
    format: payload.aspectRatio || undefined,
  };
}

// ── Wallet config helpers ────────────────────────────────────────────────────

export async function updateAutoTopUpConfig(
  orgId: string,
  patch: Partial<AutoTopUpConfig>,
): Promise<AiCreditWallet> {
  const db = await getDb();
  const [org] = await db
    .select({ settings: organizationSchema.settings })
    .from(organizationSchema)
    .where(eq(organizationSchema.id, orgId))
    .limit(1);

  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const wallet = readWallet(settings);

  const updated: AiCreditWallet = {
    ...wallet,
    autoTopUp: {
      enabled: patch.enabled ?? wallet.autoTopUp.enabled,
      threshold: typeof patch.threshold === 'number' ? patch.threshold : wallet.autoTopUp.threshold,
      amountUsd: typeof patch.amountUsd === 'number' ? patch.amountUsd : wallet.autoTopUp.amountUsd,
    },
  };

  await db
    .update(organizationSchema)
    .set({ settings: { ...settings, aiCredits: updated } })
    .where(eq(organizationSchema.id, orgId));

  return updated;
}

export async function updateLowBalanceAlertConfig(
  orgId: string,
  patch: Partial<LowBalanceAlertConfig>,
): Promise<AiCreditWallet> {
  const db = await getDb();
  const [org] = await db
    .select({ settings: organizationSchema.settings })
    .from(organizationSchema)
    .where(eq(organizationSchema.id, orgId))
    .limit(1);

  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const wallet = readWallet(settings);

  const updated: AiCreditWallet = {
    ...wallet,
    lowBalanceAlert: {
      enabled: patch.enabled ?? wallet.lowBalanceAlert.enabled,
      threshold: typeof patch.threshold === 'number' ? patch.threshold : wallet.lowBalanceAlert.threshold,
      lastNotifiedAt: patch.lastNotifiedAt === undefined
        ? wallet.lowBalanceAlert.lastNotifiedAt
        : patch.lastNotifiedAt,
    },
  };

  await db
    .update(organizationSchema)
    .set({ settings: { ...settings, aiCredits: updated } })
    .where(eq(organizationSchema.id, orgId));

  return updated;
}

/** Wallet balance in dollars (credits / CREDITS_PER_DOLLAR). */
export function walletBalanceUsd(wallet: AiCreditWallet): number {
  const monthlyRemaining = Math.max(0, wallet.monthly.limit - wallet.monthly.used);
  const reserved = wallet.reservedCredits ?? 0;
  const credits = Math.max(0, monthlyRemaining + wallet.addon.remaining - reserved);
  return credits / 10;
}

// ── AI Studio credit reservations (reserve / commit / refund) ────────────────
//
// AI Studio submits jobs to Fal.ai and waits for a webhook. We must not spend
// credits until the job returns OK, but we also must not let a user queue up
// infinitely many jobs while the wallet reads full. So we hold credits in
// `reservedCredits`, then commit or refund based on webhook outcome.

export class InsufficientCreditsError extends Error {
  constructor(public required: number, public available: number) {
    super('INSUFFICIENT_CREDITS');
  }
}

function totalSpendable(wallet: AiCreditWallet): number {
  const reserved = wallet.reservedCredits ?? 0;
  return Math.max(0, totalAvailable(wallet) - reserved);
}

export async function reserveCredits(
  orgId: string,
  jobId: string,
  amount: number,
): Promise<AiCreditWallet> {
  if (amount <= 0) return getAiCreditsWallet(orgId);
  const db = await getDb();
  const [org] = await db
    .select({ settings: organizationSchema.settings })
    .from(organizationSchema)
    .where(eq(organizationSchema.id, orgId))
    .limit(1);

  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const wallet = readWallet(settings);
  const spendable = totalSpendable(wallet);
  if (spendable < amount) {
    throw new InsufficientCreditsError(amount, spendable);
  }

  const updated: AiCreditWallet = {
    ...wallet,
    reservedCredits: (wallet.reservedCredits ?? 0) + amount,
    pendingJobs: [...(wallet.pendingJobs ?? []), jobId],
  };

  await db
    .update(organizationSchema)
    .set({ settings: { ...settings, aiCredits: updated } })
    .where(eq(organizationSchema.id, orgId));

  return updated;
}

/** Releases the reservation and spends the credits (webhook OK path). */
export async function commitCredits(
  orgId: string,
  jobId: string,
  amount: number,
  description: string,
): Promise<AiCreditWallet> {
  if (amount <= 0) return getAiCreditsWallet(orgId);
  const db = await getDb();
  const [org] = await db
    .select({ settings: organizationSchema.settings })
    .from(organizationSchema)
    .where(eq(organizationSchema.id, orgId))
    .limit(1);

  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const wallet = readWallet(settings);
  const released: AiCreditWallet = {
    ...wallet,
    reservedCredits: Math.max(0, (wallet.reservedCredits ?? 0) - amount),
    pendingJobs: (wallet.pendingJobs ?? []).filter(id => id !== jobId),
  };

  await db
    .update(organizationSchema)
    .set({ settings: { ...settings, aiCredits: released } })
    .where(eq(organizationSchema.id, orgId));

  const { wallet: spent } = await spendAiCredits(orgId, amount, {
    type: 'generation',
    description,
  });
  return spent;
}

/** Releases the reservation without charging. Records a refund activity. */
export async function refundCredits(
  orgId: string,
  jobId: string,
  amount: number,
  reason: string,
): Promise<AiCreditWallet> {
  if (amount <= 0) return getAiCreditsWallet(orgId);
  const db = await getDb();
  const [org] = await db
    .select({ settings: organizationSchema.settings })
    .from(organizationSchema)
    .where(eq(organizationSchema.id, orgId))
    .limit(1);

  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const wallet = readWallet(settings);

  const refundEvent: CreditActivity = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: 'refund',
    description: `Refund: ${reason}`,
    amount: 0,
    balanceAfter: totalAvailable(wallet),
    createdAt: new Date().toISOString(),
  };

  const updated: AiCreditWallet = {
    ...wallet,
    reservedCredits: Math.max(0, (wallet.reservedCredits ?? 0) - amount),
    pendingJobs: (wallet.pendingJobs ?? []).filter(id => id !== jobId),
    recentActivity: [refundEvent, ...wallet.recentActivity].slice(0, ACTIVITY_LIMIT),
  };

  await db
    .update(organizationSchema)
    .set({ settings: { ...settings, aiCredits: updated } })
    .where(eq(organizationSchema.id, orgId));

  return updated;
}
