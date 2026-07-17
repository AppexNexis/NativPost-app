/**
 * NativPost Plan Configuration
 * Single source of truth for all plan tiers, limits, features, and pricing.
 *
 * v2: monthlyPlanTopics added — how many topic suggestions per month
 *     (0 = Monthly Plan not available on this tier)
 *
 * v3: annual/yearly billing — BillingInterval type, annualPriceUsd,
 *     stripeAnnualPriceId, paystackAnnualPlanCode on every PlanConfig.
 */

export type BillingInterval = 'month' | 'year';

export type PlanFeatures = {
  postsPerMonth: number; // -1 = unlimited
  platformsLimit: number; // -1 = unlimited
  brandProfilesLimit: number;
  teamMembersLimit: number;
  textPosts: boolean;
  imagePosts: boolean;
  carouselPosts: boolean;
  videoPosts: boolean;
  videoGeneration: boolean;
  contentModes: boolean;
  postEnrichment: boolean;
  humanReview: boolean;
  analyticsSync: boolean;
  analyticsHistory: number; // days, -1 = unlimited
  supportLevel: 'email' | 'priority_email' | 'live_chat' | 'dedicated_slack';
  apiAccess: boolean;
  monthlyPlanTopics: number; // 0 = not available, >0 = topics per month
  monthlyPlanRegenerations: number; // how many regenerations per month allowed
  monthlyAiCredits: number; // AI Studio monthly credit allocation
  blitzPostsPerDay: number; // -1 = unlimited; hard cap on Blitz daily queue
};

export type PlanConfig = {
  id: string;
  name: string;
  tagline: string;
  priceUsd: number;
  annualPriceUsd: number; // total billed once per 12 months (~20% off monthly × 12)
  setupFeeUsd: number; // flat $5 across all plans
  features: PlanFeatures;
  stripePriceId: { dev: string; prod: string };
  stripeAnnualPriceId: { dev: string; prod: string };
  paystackPlanCode: { dev: string; prod: string };
  paystackAnnualPlanCode: { dev: string; prod: string };
  popular?: boolean;
  hidden?: boolean;
};

export const PLAN_CONFIGS: Record<string, PlanConfig> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    tagline: 'Get consistent, on-brand content without the agency price tag.',
    priceUsd: 19,
    annualPriceUsd: 182,
    setupFeeUsd: 5,
    popular: false,
    features: {
      postsPerMonth: 15,
      platformsLimit: 3,
      brandProfilesLimit: 1,
      teamMembersLimit: 2,
      textPosts: true,
      imagePosts: true,
      carouselPosts: false,
      videoPosts: false,
      videoGeneration: false,
      contentModes: false,
      postEnrichment: false,
      humanReview: false,
      analyticsSync: false,
      analyticsHistory: 30,
      supportLevel: 'email',
      apiAccess: false,
      monthlyPlanTopics: 15,
      monthlyPlanRegenerations: 2,
      monthlyAiCredits: 250,
      blitzPostsPerDay: 3,
    },
    stripePriceId: { dev: 'price_STARTER_DEV_REPLACE', prod: 'price_1TLfHe8UA4orc9zNIcmWwP1d' },
    stripeAnnualPriceId: { dev: 'price_STARTER_ANNUAL_DEV_REPLACE', prod: 'price_1TuJun8UA4orc9zNttOr2wxC' },
    paystackPlanCode: { dev: 'PLN_jjfdqyrgr1vbsvv', prod: 'PLN_4jzn7zd6blqssag' },
    paystackAnnualPlanCode: { dev: 'PLN_STARTER_ANNUAL_DEV_REPLACE', prod: 'PLN_unm6nqz8wcialev' },
  },

  growth: {
    id: 'growth',
    name: 'Growth',
    tagline: 'More reach, richer content, and video — for brands that are serious.',
    priceUsd: 39,
    annualPriceUsd: 374,
    setupFeeUsd: 5,
    popular: true,
    features: {
      postsPerMonth: 40,
      platformsLimit: 6,
      brandProfilesLimit: 1,
      teamMembersLimit: 5,
      textPosts: true,
      imagePosts: true,
      carouselPosts: true,
      videoPosts: true,
      videoGeneration: true,
      contentModes: true,
      postEnrichment: true,
      humanReview: false,
      analyticsSync: true,
      analyticsHistory: 90,
      supportLevel: 'priority_email',
      apiAccess: false,
      monthlyPlanTopics: 20,
      monthlyPlanRegenerations: 3,
      monthlyAiCredits: 500,
      blitzPostsPerDay: 5,
    },
    stripePriceId: { dev: 'price_GROWTH_DEV_REPLACE', prod: 'price_1TLfIW8UA4orc9zN5SvYEWkD' },
    stripeAnnualPriceId: { dev: 'price_GROWTH_ANNUAL_DEV_REPLACE', prod: 'price_1TuK1Z8UA4orc9zNsShuDFMu' },
    paystackPlanCode: { dev: 'PLN_8h1kodnrprlt3sp', prod: 'PLN_u39i4zlh6416qbb' },
    paystackAnnualPlanCode: { dev: 'PLN_GROWTH_ANNUAL_DEV_REPLACE', prod: 'PLN_qya2639txqy4tm2' },
  },

  pro: {
    id: 'pro',
    name: 'Pro',
    tagline: 'Agency-quality content with a human eye on everything before it goes live.',
    priceUsd: 79,
    annualPriceUsd: 758,
    setupFeeUsd: 5,
    popular: false,
    features: {
      postsPerMonth: 80,
      platformsLimit: -1,
      brandProfilesLimit: 1,
      teamMembersLimit: 10,
      textPosts: true,
      imagePosts: true,
      carouselPosts: true,
      videoPosts: true,
      videoGeneration: true,
      contentModes: true,
      postEnrichment: true,
      humanReview: true,
      analyticsSync: true,
      analyticsHistory: 365,
      supportLevel: 'live_chat',
      apiAccess: false,
      monthlyPlanTopics: 25,
      monthlyPlanRegenerations: 3,
      monthlyAiCredits: 1250,
      blitzPostsPerDay: 10,
    },
    stripePriceId: { dev: 'price_PRO_DEV_REPLACE', prod: 'price_1TLfJ08UA4orc9zNrNzFnRr7' },
    stripeAnnualPriceId: { dev: 'price_PRO_ANNUAL_DEV_REPLACE', prod: 'price_1TuK308UA4orc9zNdT2A3trX' },
    paystackPlanCode: { dev: 'PLN_fdwtqby00izl4ro', prod: 'PLN_o7ebuljkyw9iyaw' },
    paystackAnnualPlanCode: { dev: 'PLN_PRO_ANNUAL_DEV_REPLACE', prod: 'PLN_iqo2svs8izudauv' },
  },

  agency: {
    id: 'agency',
    name: 'Agency',
    tagline: 'Run content for multiple clients at scale, under one roof.',
    priceUsd: 149,
    annualPriceUsd: 1430,
    setupFeeUsd: 5,
    popular: false,
    features: {
      postsPerMonth: -1,
      platformsLimit: -1,
      brandProfilesLimit: 5,
      teamMembersLimit: -1,
      textPosts: true,
      imagePosts: true,
      carouselPosts: true,
      videoPosts: true,
      videoGeneration: true,
      contentModes: true,
      postEnrichment: true,
      humanReview: true,
      analyticsSync: true,
      analyticsHistory: -1,
      supportLevel: 'dedicated_slack',
      apiAccess: true,
      monthlyPlanTopics: 30,
      monthlyPlanRegenerations: -1, // unlimited
      monthlyAiCredits: 2000,
      blitzPostsPerDay: 20,
    },
    stripePriceId: { dev: 'price_AGENCY_DEV_REPLACE', prod: 'price_1TLfKa8UA4orc9zNw27oyVak' },
    stripeAnnualPriceId: { dev: 'price_AGENCY_ANNUAL_DEV_REPLACE', prod: 'price_1TuK9K8UA4orc9zNzhdEgB9m' },
    paystackPlanCode: { dev: 'PLN_lu1zsbqua45q58b', prod: 'PLN_uevdm7btk36wdhg' },
    paystackAnnualPlanCode: { dev: 'PLN_AGENCY_ANNUAL_DEV_REPLACE', prod: 'PLN_mjoh9tddm7t6wp6' },
  },

  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Custom solution for large organisations.',
    priceUsd: 0,
    annualPriceUsd: 0,
    setupFeeUsd: 0,
    hidden: true,
    features: {
      postsPerMonth: -1,
      platformsLimit: -1,
      brandProfilesLimit: -1,
      teamMembersLimit: -1,
      textPosts: true,
      imagePosts: true,
      carouselPosts: true,
      videoPosts: true,
      videoGeneration: true,
      contentModes: true,
      postEnrichment: true,
      humanReview: true,
      analyticsSync: true,
      analyticsHistory: -1,
      supportLevel: 'dedicated_slack',
      apiAccess: true,
      monthlyPlanTopics: -1,
      monthlyPlanRegenerations: -1,
      monthlyAiCredits: 2000,
      blitzPostsPerDay: -1,
    },
    stripePriceId: { dev: '', prod: '' },
    stripeAnnualPriceId: { dev: '', prod: '' },
    paystackPlanCode: { dev: '', prod: '' },
    paystackAnnualPlanCode: { dev: '', prod: '' },
  },
};

export const FREE_TRIAL_DAYS = 7;
export const SETUP_FEE_USD = 5; // flat across all plans

// -----------------------------------------------------------
// TRIAL RESTRICTIONS
// During the 7-day trial, regardless of selected plan,
// users get these locked-down limits:
//   - 3 posts total (not per month — for the whole trial)
//   - 1 platform max per post
//   - 2 social accounts connectable
//   - text posts ONLY (no image, carousel, video)
//   - Monthly Plan: not available (0 topics)
// -----------------------------------------------------------
export const TRIAL_FEATURES: PlanFeatures = {
  postsPerMonth: 3, // 3 posts for entire trial
  platformsLimit: 2, // can connect 2 platforms
  brandProfilesLimit: 1,
  teamMembersLimit: 1,
  textPosts: true,
  imagePosts: false, // trial: text only
  carouselPosts: false,
  videoPosts: false,
  videoGeneration: false,
  contentModes: false,
  postEnrichment: false,
  humanReview: false,
  analyticsSync: false,
  analyticsHistory: 7,
  supportLevel: 'email',
  apiAccess: false,
  monthlyPlanTopics: 0, // not available during trial
  monthlyPlanRegenerations: 0,
  monthlyAiCredits: 50,
  blitzPostsPerDay: 2,
};

function getEnv(): 'dev' | 'prod' {
  return process.env.BILLING_PLAN_ENV === 'prod' ? 'prod' : 'dev';
}

export function getPlanConfig(planId: string): PlanConfig | null {
  return PLAN_CONFIGS[planId] ?? null;
}

export function getStripePriceId(planId: string, interval?: BillingInterval): string | null {
  const plan = PLAN_CONFIGS[planId];
  if (!plan) {
    return null;
  }
  if (interval === 'year') {
    return plan.stripeAnnualPriceId[getEnv()];
  }
  return plan.stripePriceId[getEnv()];
}

export function getPaystackPlanCode(planId: string, interval?: BillingInterval): string | null {
  const plan = PLAN_CONFIGS[planId];
  if (!plan) {
    return null;
  }
  if (interval === 'year') {
    return plan.paystackAnnualPlanCode[getEnv()];
  }
  return plan.paystackPlanCode[getEnv()];
}

export function getPlanByStripePriceId(priceId: string): PlanConfig | null {
  const env = getEnv();
  return Object.values(PLAN_CONFIGS).find(
    p => p.stripePriceId[env] === priceId || p.stripeAnnualPriceId[env] === priceId,
  ) ?? null;
}

export function getPlanByPaystackCode(planCode: string): PlanConfig | null {
  const env = getEnv();
  return Object.values(PLAN_CONFIGS).find(
    p => p.paystackPlanCode[env] === planCode || p.paystackAnnualPlanCode[env] === planCode,
  ) ?? null;
}

export function getEffectivePlanFeatures(planId: string, planStatus: string): PlanFeatures {
  if (planStatus === 'trialing') {
    return TRIAL_FEATURES;
  }
  return PLAN_CONFIGS[planId]?.features ?? PLAN_CONFIGS.starter!.features;
}

export function isPlanConfigured(planId: string): boolean {
  const priceId = getStripePriceId(planId);
  return !!priceId && !priceId.includes('REPLACE');
}

export function getAnnualPrice(planId: string): number | null {
  const plan = PLAN_CONFIGS[planId];
  if (!plan) {
    return null;
  }
  return plan.annualPriceUsd;
}

export function getMonthlyEquivalentDisplay(annualPriceUsd: number): string {
  const mo = annualPriceUsd / 12;
  if (mo >= 1) {
    return `≈$${Math.round(mo)}/mo`;
  }
  return `<$${(Math.round(mo * 100) / 100).toFixed(2)}/mo`;
}

export const ANNUAL_SAVE_PCT = 20;

export function formatLimit(value: number, singular: string, plural?: string): string {
  if (value === -1) {
    return 'Unlimited';
  }
  return `${value} ${value === 1 ? singular : (plural ?? `${singular}s`)}`;
}

export const VISIBLE_PLANS = Object.values(PLAN_CONFIGS).filter(p => !p.hidden);

// -----------------------------------------------------------
// MONTHLY PLAN HELPERS
// -----------------------------------------------------------

/** Returns allowed content types for a given set of plan features. */
export function getAllowedContentTypes(features: PlanFeatures): string[] {
  const types: string[] = [];
  if (features.textPosts) {
    types.push('text_only');
  }
  if (features.imagePosts) {
    types.push('single_image');
  }
  if (features.carouselPosts) {
    types.push('slideshow');
  }
  if (features.videoPosts) {
    types.push('reel');
  }
  return types;
}

/** Returns true if the org can regenerate their plan this month. */
export function canRegeneratePlan(
  features: PlanFeatures,
  currentCount: number,
): boolean {
  if (features.monthlyPlanRegenerations === -1) {
    return true; // unlimited
  }
  return currentCount < features.monthlyPlanRegenerations;
}
