// Managed Community add-on (docs §19). Pure — no db/Env. Operators log the
// replies/DMs/moderation they handle; usage is summed per month against the
// tier's reply quota. Flat-tier billed like other add-ons.

// -1 = unlimited. Keep in sync with the addons.ts catalog (managed_community).
export const MANAGED_COMMUNITY_QUOTA: Record<string, number> = {
  basic: 500,
  active: 1000,
  unlimited: -1,
};

/** Monthly reply quota for a tier id, or null for an unknown tier. */
export function communityQuotaForTier(tierId: string | null | undefined): number | null {
  if (!tierId) {
    return null;
  }
  return MANAGED_COMMUNITY_QUOTA[tierId] ?? null;
}

/** True when the tier's quota is unlimited. */
export function isUnlimited(quota: number): boolean {
  return quota < 0;
}

/** Replies left this period; unlimited quotas always report Infinity. */
export function remainingReplies(quota: number, used: number): number {
  if (isUnlimited(quota)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, quota - used);
}
