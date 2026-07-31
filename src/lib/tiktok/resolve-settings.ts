/**
 * TikTok publish-settings resolution.
 *
 * WHY THIS EXISTS
 * ───────────────
 * TikTok's Content Posting API rejects a post outright if `post_info` contains
 * a value the account isn't allowed to use — with the unhelpfully generic
 * "The request post info is empty or incorrect". Manual publishing was safe
 * because the modal builds its options from a live `creator_info` query, but
 * scheduled publishing had no source for that intent at all and fell back to
 * hardcoded values. One of those fallbacks ('PUBLIC') wasn't even a valid
 * enum, so every scheduled TikTok post failed.
 *
 * Guessing is the actual bug, not the specific bad value. So settings are
 * resolved from a hierarchy of intent, then validated against what the account
 * can do RIGHT NOW:
 *
 *   1. Campaign override   — what the user chose for this campaign
 *   2. Account defaults    — what they chose once for this TikTok account
 *   3. Creator-info floor  — what TikTok currently permits
 *
 * Storing USE_ACCOUNT_DEFAULT rather than a frozen enum is deliberate: an
 * account later restricted to SELF_ONLY (or an app pending audit) adapts at
 * publish time instead of failing. Resolution happens where `creator_info` is
 * already fetched, so it always reflects current capability.
 */

export const TIKTOK_PRIVACY_LEVELS = [
  'PUBLIC_TO_EVERYONE',
  'MUTUAL_FOLLOW_FRIENDS',
  'FOLLOWER_OF_CREATOR',
  'SELF_ONLY',
] as const;

export type TikTokPrivacyLevel = typeof TIKTOK_PRIVACY_LEVELS[number];

/** Sentinel meaning "defer to the account default, resolved at publish time". */
export const USE_ACCOUNT_DEFAULT = 'USE_ACCOUNT_DEFAULT';

export type TikTokPublishMethod = 'DIRECT' | 'INBOX';

/**
 * What a campaign or an account stores. Every field optional — an absent field
 * defers to the next level down, which is what makes partial overrides work.
 */
export type TikTokPublishConfig = {
  publishMethod?: TikTokPublishMethod;
  privacyLevel?: TikTokPrivacyLevel | typeof USE_ACCOUNT_DEFAULT;
  allowComment?: boolean;
  allowDuet?: boolean;
  allowStitch?: boolean;
  isAIGC?: boolean;
  brandOrganicToggle?: boolean;
  brandContentToggle?: boolean;
};

/** Fully-resolved settings — no optionals, safe to send to TikTok. */
export type ResolvedTikTokSettings = {
  publishMethod: TikTokPublishMethod;
  privacyLevel: TikTokPrivacyLevel;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  isAIGC: boolean;
  brandOrganicToggle: boolean;
  brandContentToggle: boolean;
  /** Human-readable record of every adjustment, for logs and the UI. */
  notes: string[];
};

/** The slice of `creator_info` that constrains what we may send. */
export type TikTokCreatorCapabilities = {
  privacyLevelOptions?: string[];
  commentDisabled?: boolean;
  duetDisabled?: boolean;
  stitchDisabled?: boolean;
};

function isPrivacyLevel(v: unknown): v is TikTokPrivacyLevel {
  return typeof v === 'string' && (TIKTOK_PRIVACY_LEVELS as readonly string[]).includes(v);
}

/** First defined value wins — campaign, then account, then the given default. */
function pick<T>(campaign: T | undefined, account: T | undefined, fallback: T): T {
  if (campaign !== undefined) {
    return campaign;
  }
  if (account !== undefined) {
    return account;
  }
  return fallback;
}

export function resolveTikTokSettings({
  campaignOverride,
  accountDefaults,
  creatorInfo,
}: {
  campaignOverride?: TikTokPublishConfig | null;
  accountDefaults?: TikTokPublishConfig | null;
  creatorInfo?: TikTokCreatorCapabilities | null;
}): ResolvedTikTokSettings {
  const campaign = campaignOverride ?? {};
  const account = accountDefaults ?? {};
  const notes: string[] = [];

  const publishMethod = pick<TikTokPublishMethod>(
    campaign.publishMethod,
    account.publishMethod,
    'DIRECT',
  );

  // ── Privacy ────────────────────────────────────────────────────────────
  // Only options TikTok currently returns are legal. An unaudited app is
  // typically restricted to SELF_ONLY, and sending anything else is the exact
  // failure this module exists to prevent.
  const allowed = (creatorInfo?.privacyLevelOptions ?? []).filter(isPrivacyLevel);
  const allowedOrDefault: TikTokPrivacyLevel[] = allowed.length > 0 ? allowed : ['SELF_ONLY'];

  // USE_ACCOUNT_DEFAULT at campaign level means "fall through", so it is
  // treated as absent rather than as a value.
  const campaignPrivacy = campaign.privacyLevel === USE_ACCOUNT_DEFAULT
    ? undefined
    : campaign.privacyLevel;
  const accountPrivacy = account.privacyLevel === USE_ACCOUNT_DEFAULT
    ? undefined
    : account.privacyLevel;

  const requested = campaignPrivacy ?? accountPrivacy;
  let privacyLevel: TikTokPrivacyLevel;
  if (requested && isPrivacyLevel(requested) && allowedOrDefault.includes(requested)) {
    privacyLevel = requested;
  } else {
    privacyLevel = allowedOrDefault.includes('PUBLIC_TO_EVERYONE')
      ? 'PUBLIC_TO_EVERYONE'
      : allowedOrDefault[0]!;
    if (requested) {
      notes.push(
        `Privacy "${requested}" is not available for this account (allowed: `
        + `${allowedOrDefault.join(', ')}); used "${privacyLevel}".`,
      );
    }
  }

  // ── Interaction toggles ────────────────────────────────────────────────
  // The creator's own account settings are a hard ceiling: if they've disabled
  // comments globally, we cannot enable them for one post.
  let allowComment = pick(campaign.allowComment, account.allowComment, !creatorInfo?.commentDisabled);
  let allowDuet = pick(campaign.allowDuet, account.allowDuet, !creatorInfo?.duetDisabled);
  let allowStitch = pick(campaign.allowStitch, account.allowStitch, !creatorInfo?.stitchDisabled);

  if (allowComment && creatorInfo?.commentDisabled) {
    allowComment = false;
    notes.push('Comments are disabled on this TikTok account; the post follows that.');
  }
  if (allowDuet && creatorInfo?.duetDisabled) {
    allowDuet = false;
    notes.push('Duet is disabled on this TikTok account; the post follows that.');
  }
  if (allowStitch && creatorInfo?.stitchDisabled) {
    allowStitch = false;
    notes.push('Stitch is disabled on this TikTok account; the post follows that.');
  }

  // ── Commercial disclosure ──────────────────────────────────────────────
  const isAIGC = pick(campaign.isAIGC, account.isAIGC, false);
  const brandOrganicToggle = pick(campaign.brandOrganicToggle, account.brandOrganicToggle, false);
  let brandContentToggle = pick(campaign.brandContentToggle, account.brandContentToggle, false);

  // TikTok forbids branded content on a private post — the publish modal
  // blocks this combination in the UI, and it has to hold here too or a
  // scheduled post would be rejected for a reason no one is watching for.
  if (brandContentToggle && privacyLevel === 'SELF_ONLY') {
    brandContentToggle = false;
    notes.push('Branded content cannot be used on a private (SELF_ONLY) post; disclosure was dropped.');
  }

  return {
    publishMethod,
    privacyLevel,
    allowComment,
    allowDuet,
    allowStitch,
    isAIGC,
    brandOrganicToggle,
    brandContentToggle,
    notes,
  };
}
