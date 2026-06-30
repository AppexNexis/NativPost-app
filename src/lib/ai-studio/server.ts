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
}

const ACTIVITY_LIMIT = 50;
const DEFAULT_MONTHLY_LIMIT = 50; // fallback if plan cannot be determined

function startOfNextMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);
}

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
  };
}

function readWallet(settings: Record<string, unknown>, monthlyLimit?: number): AiCreditWallet {
  const fallbackLimit = monthlyLimit ?? DEFAULT_MONTHLY_LIMIT;
  const raw = settings.aiCredits as Partial<AiCreditWallet> | undefined;
  if (!raw || typeof raw !== 'object') return getDefaultWallet(monthlyLimit);

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
  };

  return resetMonthlyIfNeeded(wallet);
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
    description: `Monthly credits reset — ${newLimit} credits available`,
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

