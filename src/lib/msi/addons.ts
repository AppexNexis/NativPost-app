// MSI Add-ons catalog (docs §19). Pure — no db/Env imports, so it stays the
// single testable source of truth for WHAT add-ons exist, WHO performs the work,
// and HOW each is priced. The publishing engine, scheduler, vault, worker, and
// billing are unchanged: an add-on only decides who does the work (operator, AI,
// AI+human, or the system) on the infrastructure already built.
//
// A per-org activation lives in `msi_addon_subscription` (Schema.ts); this file
// is the catalog those rows point at by `addonId`.

export type MsiAddonId =
  | 'managed_posting'
  | 'managed_content'
  | 'managed_ads'
  | 'managed_analytics'
  | 'managed_expansion'
  | 'managed_community'
  | 'managed_ugc'
  | 'managed_influencer'
  | 'managed_recovery'
  | 'managed_localization';

// Availability of the add-on's execution, independent of marketing. `available`
// = the workflow exists and can be activated; `beta` = live but limited;
// `planned` = catalogued + priced but the operator/AI workflow isn't built yet.
export type AddonStatus = 'available' | 'beta' | 'planned';

// Who does the work behind the add-on — the ONLY thing an add-on really changes.
export type WhoPerforms = 'system' | 'ai' | 'operator' | 'ai_plus_human';

export interface AddonTier {
  id: string;
  name: string;
  monthlyUsd: number;
  // Human-readable allotment, e.g. "12 posts / month".
  allotment: string;
}

// Discriminated union so each add-on carries only the pricing shape it needs.
// Human labor is the scarce input, so most operator-backed add-ons use fixed
// tiers (predictable margin) rather than a low flat fee.
export type AddonPricing =
  | { kind: 'fixed_tiers'; tiers: AddonTier[] }
  | { kind: 'usage'; unitLabel: string; unitPriceUsd: number }
  | { kind: 'per_account'; monthlyUsd: number }
  | { kind: 'percent_of_spend'; setupUsd: number; managementPctMin: number; managementPctMax: number }
  | { kind: 'per_deliverable'; fromUsd: number }
  | { kind: 'per_case'; fromUsd: number }
  | { kind: 'custom' };

export interface MsiAddon {
  id: MsiAddonId;
  name: string;
  tagline: string;
  description: string;
  status: AddonStatus;
  whoPerforms: WhoPerforms;
  pricing: AddonPricing;
  // Value-first fields (docs §19): communicate the work we take off the
  // customer's plate BEFORE the price, so the number is easy to justify.
  whoFor?: string;
  whatWeDo?: string[];
  timeSaved?: string;
  // Build/rollout order (1 = first). Reflects value-vs-operational-cost, not the
  // list order. See docs §19 for the reasoning behind the tiering.
  priority: number;
}

export const ADDON_CATALOG: MsiAddon[] = [
  {
    id: 'managed_posting',
    name: 'Managed Posting',
    tagline: 'We create and publish your posts, end to end.',
    description:
      'Hand off the posting workflow: our team drafts, reviews, schedules, and publishes to your managed accounts. You approve; we run it. The smallest gap between what MSI already does and a full service.',
    status: 'available',
    whoPerforms: 'ai_plus_human',
    whoFor: 'You already create content but don\'t want to spend time scheduling and publishing.',
    whatWeDo: [
      'Review your content calendar',
      'Schedule your approved posts',
      'Optimize posting times',
      'Monitor for failed publishes',
      'Make sure every scheduled post goes live',
    ],
    timeSaved: 'Saves ~8–15 hours/month',
    pricing: {
      kind: 'fixed_tiers',
      tiers: [
        { id: 'starter', name: 'Starter', monthlyUsd: 49, allotment: '12 posts / month' },
        { id: 'professional', name: 'Professional', monthlyUsd: 99, allotment: '30 posts / month' },
        { id: 'scale', name: 'Scale', monthlyUsd: 199, allotment: '60 posts / month' },
      ],
    },
    priority: 1,
  },
  {
    id: 'managed_content',
    name: 'Managed Content',
    tagline: 'A monthly content studio: graphics, video, and copy, done for you.',
    description:
      'Submit your brand and product; our team plus AI Studio produce a month of on-brand graphics, edited video, and copy, reviewed by a human and scheduled for you. Replaces a designer, an editor, and a scheduler with one service.',
    status: 'available',
    whoPerforms: 'ai_plus_human',
    whoFor: 'You don\'t have an internal marketing team.',
    whatWeDo: [
      'AI research into what to post',
      'Human review on everything',
      'Graphics, carousels, and Reels',
      'On-brand captions and hashtags',
      'Scheduling and publishing',
    ],
    timeSaved: 'Replaces a designer, copywriter, video editor, and scheduler',
    pricing: {
      kind: 'fixed_tiers',
      tiers: [
        { id: 'lite', name: 'Lite', monthlyUsd: 149, allotment: '15 content pieces / month' },
        { id: 'growth', name: 'Growth', monthlyUsd: 349, allotment: '40 content pieces / month' },
        { id: 'studio', name: 'Studio', monthlyUsd: 699, allotment: '80 content pieces / month' },
      ],
    },
    priority: 2,
  },
  {
    id: 'managed_ads',
    name: 'Managed Advertising',
    tagline: 'We build, launch, and monitor your paid campaigns.',
    description:
      'Our operators configure the campaign, audience, budget, pixel, creative, copy, and tracking, then monitor performance. You pay the ad platform directly for spend; we take a setup fee plus a management percentage.',
    status: 'available',
    whoPerforms: 'operator',
    whoFor: 'You already have a budget and want professional campaign management.',
    whatWeDo: [
      'Campaign setup and structure',
      'Audience research and targeting',
      'Pixel and conversion tracking',
      'Creative and copy upload',
      'Budget optimization',
      'Weekly monitoring and reporting',
    ],
    timeSaved: 'Avoid spending hours inside Ads Manager',
    pricing: {
      kind: 'percent_of_spend',
      setupUsd: 49,
      managementPctMin: 10,
      managementPctMax: 20,
    },
    priority: 3,
  },
  {
    id: 'managed_analytics',
    name: 'Managed Analytics & Strategy',
    tagline: 'A monthly growth report with a plan for next month.',
    description:
      'Every month: a growth report, winning and losing posts, competitor context, and a recommended plan for the next month. Generated by AI, reviewed by a human. Cheap to produce and it makes every other add-on stickier.',
    status: 'available',
    whoPerforms: 'ai_plus_human',
    whoFor: 'You post but never know what\'s actually working.',
    whatWeDo: [
      'A growth report every month',
      'Your winning and losing posts',
      'Competitor context',
      'A recommended plan for next month',
      'Reviewed by a human strategist',
    ],
    timeSaved: 'Replaces a monthly analytics deep-dive',
    pricing: {
      kind: 'fixed_tiers',
      tiers: [
        { id: 'monthly', name: 'Monthly report', monthlyUsd: 39, allotment: '1 report / account / month' },
      ],
    },
    priority: 4,
  },
  {
    id: 'managed_expansion',
    name: 'Managed Expansion',
    tagline: 'Scale from a few accounts to many, in one click.',
    description:
      'Not a new product, a growth motion on the core: provision additional managed accounts across markets on demand. Uses the standard per-account price.',
    status: 'available',
    whoPerforms: 'system',
    whoFor: 'The model is working and you want to scale across more accounts or countries.',
    whatWeDo: [
      'Provision more accounts on demand',
      'Expand into new countries',
      'Same ownership and compliance',
      'One dashboard for all of them',
    ],
    pricing: { kind: 'per_account', monthlyUsd: 80 },
    priority: 5,
  },
  {
    id: 'managed_community',
    name: 'Managed Community',
    tagline: 'We reply to comments and DMs, hide spam, and moderate.',
    description:
      'Our operators handle inbound from one dashboard: reply to comments and DMs, hide spam, pin comments. Operationally heavy (real-time, timezone coverage) — staged after operator density is in place.',
    status: 'available',
    whoPerforms: 'operator',
    whoFor: 'Your comments and DMs pile up faster than you can answer them.',
    whatWeDo: [
      'Reply to comments and DMs',
      'Hide and remove spam',
      'Pin your best comments',
      'Flag anything that needs you',
    ],
    timeSaved: 'Saves ~10–20 hours/month in the inbox',
    pricing: {
      kind: 'fixed_tiers',
      tiers: [
        { id: 'basic', name: 'Basic', monthlyUsd: 79, allotment: '500 replies / month' },
        { id: 'active', name: 'Active', monthlyUsd: 149, allotment: '1,000 replies / month' },
        { id: 'unlimited', name: 'Unlimited', monthlyUsd: 299, allotment: 'Unlimited replies' },
      ],
    },
    priority: 6,
  },
  {
    id: 'managed_ugc',
    name: 'Managed UGC',
    tagline: 'AI or real creators produce short-form video from your product.',
    description:
      'Send a product; get TikToks, Reels, and Shorts back, from AI creators or, on request, real creators. Introduces a creator supply chain, so it carries its own operational weight.',
    status: 'available',
    whoPerforms: 'ai_plus_human',
    whoFor: 'You need a steady stream of short-form video but can\'t film it yourself.',
    whatWeDo: [
      'Turn your product into short-form video',
      'AI creators, or real creators on request',
      'TikToks, Reels, and Shorts',
      'Delivered to your library, ready to post',
    ],
    timeSaved: 'Replaces a UGC creator on retainer',
    pricing: { kind: 'per_deliverable', fromUsd: 25 },
    priority: 7,
  },
  {
    id: 'managed_influencer',
    name: 'Managed Influencer Outreach',
    tagline: 'We find, contact, negotiate, and track creator campaigns.',
    description:
      'Fits the existing Influencer module: our team sources creators, handles outreach and negotiation, and tracks the campaign. A relationship business layered on the platform.',
    status: 'available',
    whoPerforms: 'operator',
    whoFor: 'You want creators promoting you but don\'t have time to find and manage them.',
    whatWeDo: [
      'Source creators in your niche',
      'Handle outreach and negotiation',
      'Coordinate the deliverables',
      'Track the campaign and results',
    ],
    pricing: { kind: 'custom' },
    priority: 8,
  },
  {
    id: 'managed_recovery',
    name: 'Account Recovery & Compliance',
    tagline: 'Best-effort appeal preparation and guided recovery.',
    description:
      'When an account is disabled, restricted, or shadowbanned, our operators prepare appeals, guide verification, and restore settings. Best-effort only, the platform decides the outcome, never us. Positioned honestly, with no restoration guarantee.',
    status: 'available',
    whoPerforms: 'operator',
    whoFor: 'An account is restricted and you don\'t know how to get it back.',
    whatWeDo: [
      'Prepare a platform appeal',
      'Guide you through verification',
      'Restore settings once recovered',
      'Advise on staying compliant',
    ],
    pricing: { kind: 'per_case', fromUsd: 99 },
    priority: 9,
  },
  {
    id: 'managed_localization',
    name: 'Localization & Market Expansion',
    tagline: 'Same brand, run natively across countries and languages.',
    description:
      'Different local teams, languages, posting times, and trends per market — built on the country model MSI already has. For brands entering multiple regions at once.',
    status: 'available',
    whoPerforms: 'operator',
    whoFor: 'You\'re entering several countries and want each run like a local.',
    whatWeDo: [
      'Native language and local teams',
      'Region-specific posting times',
      'Local trends and cultural fit',
      'One brand, many markets',
    ],
    pricing: { kind: 'custom' },
    priority: 10,
  },
];

export function getAddon(id: string): MsiAddon | undefined {
  return ADDON_CATALOG.find(a => a.id === id);
}

export function isAddonId(id: string): id is MsiAddonId {
  return ADDON_CATALOG.some(a => a.id === id);
}

/** Catalog ordered by rollout priority (build order). */
export function addonsByPriority(): MsiAddon[] {
  return [...ADDON_CATALOG].sort((a, b) => a.priority - b.priority);
}

/** True when the add-on's pricing requires the customer to pick a tier. */
export function requiresTier(addon: MsiAddon): boolean {
  return addon.pricing.kind === 'fixed_tiers';
}

/** Resolve a tier by id for a fixed-tier add-on (null otherwise / not found). */
export function resolveTier(addon: MsiAddon, tierId: string | null | undefined): AddonTier | null {
  if (addon.pricing.kind !== 'fixed_tiers' || !tierId) {
    return null;
  }
  return addon.pricing.tiers.find(t => t.id === tierId) ?? null;
}

export type ActivationValidation =
  | { ok: true; addon: MsiAddon; tier: AddonTier | null }
  | { ok: false; error: string };

/**
 * Pure validation for activating an add-on with an optional tier. Enforces:
 * the add-on exists, a tier is supplied iff the add-on requires one, and the
 * tier is valid for that add-on. No DB — the service layer wraps this.
 */
export function validateActivation(addonId: string, tierId?: string | null): ActivationValidation {
  const addon = getAddon(addonId);
  if (!addon) {
    return { ok: false, error: `Unknown add-on: ${addonId}` };
  }
  if (requiresTier(addon)) {
    if (!tierId) {
      return { ok: false, error: `${addon.name} requires a tier selection.` };
    }
    const tier = resolveTier(addon, tierId);
    if (!tier) {
      return { ok: false, error: `Invalid tier "${tierId}" for ${addon.name}.` };
    }
    return { ok: true, addon, tier };
  }
  // Non-tiered add-ons ignore any supplied tier.
  return { ok: true, addon, tier: null };
}

/** The lowest displayed monthly price for an add-on, for "from $X" copy. */
export function addonFromPriceUsd(addon: MsiAddon): number | null {
  switch (addon.pricing.kind) {
    case 'fixed_tiers':
      return Math.min(...addon.pricing.tiers.map(t => t.monthlyUsd));
    case 'per_account':
      return addon.pricing.monthlyUsd;
    case 'usage':
      return addon.pricing.unitPriceUsd;
    case 'percent_of_spend':
      return addon.pricing.setupUsd;
    case 'per_deliverable':
    case 'per_case':
      return addon.pricing.fromUsd;
    case 'custom':
      return null;
    default:
      return null;
  }
}
