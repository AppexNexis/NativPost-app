/**
 * resolve-target-accounts — derive Blitz's effective publish targets at
 * read time from (connectedAccounts − blitzDisabledAccountIds).
 *
 * Rationale (memory: nativpost-blitz-account-model): Blitz used to
 * snapshot `campaign.targetAccounts` at creation time, causing drift
 * whenever the user added or removed a social account after Blitz was
 * initialized. Every read site now derives instead so the source of
 * truth is the `social_account` table plus a small exclusion list.
 *
 * Callers pass in the connected-account rows (already fetched for other
 * reasons) so this helper doesn't hit the DB — keeping it a pure
 * function that's cheap to call from server components, API routes, and
 * the Blitz publish job.
 */

export type ConnectedAccount = {
  id: string;
  platform: string;
  isActive?: boolean | null;
  username?: string | null;
};

export type LegacyTargetAccount = {
  accountId: string;
  platform: string;
};

export type ResolveInput = {
  connectedAccounts: ConnectedAccount[];
  blitzDisabledAccountIds: string[] | null | undefined;
  /**
   * Legacy `campaign.targetAccounts` for one-time migration. When
   * `blitzDisabledAccountIds` is unset (null) AND `targetAccounts` is a
   * populated snapshot, treat any connected account NOT in the snapshot
   * as disabled. Caller is responsible for persisting the derived list
   * back to the row so this migration path fires exactly once.
   */
  legacyTargetAccounts?: LegacyTargetAccount[] | null;
};

export type ResolveResult = {
  effectiveTargets: LegacyTargetAccount[];
  disabledIds: string[];
  /** True when the caller should persist `disabledIds` back to the row. */
  needsPersist: boolean;
};

export function resolveBlitzTargetAccounts(input: ResolveInput): ResolveResult {
  const active = (input.connectedAccounts || []).filter(a => a.isActive !== false);
  const disabledIsUnset = input.blitzDisabledAccountIds == null;
  const hasLegacy = Array.isArray(input.legacyTargetAccounts) && input.legacyTargetAccounts.length > 0;

  let disabledIds: string[];
  let needsPersist = false;

  if (disabledIsUnset && hasLegacy) {
    // One-time migration from the old snapshot model. Anything currently
    // connected but not in the snapshot is treated as user-disabled so
    // Blitz preserves the pre-migration behavior.
    const snapshotIds = new Set((input.legacyTargetAccounts || []).map(t => t.accountId));
    disabledIds = active
      .filter(a => !snapshotIds.has(a.id))
      .map(a => a.id);
    needsPersist = true;
  } else {
    disabledIds = Array.isArray(input.blitzDisabledAccountIds)
      ? [...input.blitzDisabledAccountIds]
      : [];
  }

  const disabledSet = new Set(disabledIds);
  const effectiveTargets: LegacyTargetAccount[] = active
    .filter(a => !disabledSet.has(a.id))
    .map(a => ({ accountId: a.id, platform: a.platform }));

  return { effectiveTargets, disabledIds, needsPersist };
}

/**
 * Convenience predicate — true when the effective target list is empty,
 * meaning the Blitz UI should render the "connect a social account"
 * empty state instead of a swipe deck.
 */
export function hasNoBlitzTargets(result: ResolveResult): boolean {
  return result.effectiveTargets.length === 0;
}
