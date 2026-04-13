/**
 * NativPost Plan Configuration
 * Single source of truth for all plan tiers, limits, features, and pricing.
 */

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
};

export type PlanConfig = {
  id: string;
  name: string;
  tagline: string;
  priceUsd: number;
  setupFeeUsd: number; // flat $5 across all plans
  features: PlanFeatures;
  stripePriceId: { dev: string; prod: string };
  paystackPlanCode: { dev: string; prod: string };
  popular?: boolean;
  hidden?: boolean;
};

export const PLAN_CONFIGS: Record<string, PlanConfig> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    tagline: 'Get consistent, on-brand content without the agency price tag.',
    priceUsd: 19,
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
    },
    stripePriceId: { dev: 'price_STARTER_DEV_REPLACE', prod: 'price_1TLfHe8UA4orc9zNIcmWwP1d' },
    paystackPlanCode: { dev: 'PLN_starter_dev_REPLACE', prod: 'PLN_4jzn7zd6blqssag' },
  },

  growth: {
    id: 'growth',
    name: 'Growth',
    tagline: 'More reach, richer content, and video — for brands that are serious.',
    priceUsd: 39,
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
    },
    stripePriceId: { dev: 'price_GROWTH_DEV_REPLACE', prod: 'price_1TLfIW8UA4orc9zN5SvYEWkD' },
    paystackPlanCode: { dev: 'PLN_growth_dev_REPLACE', prod: 'PLN_u39i4zlh6416qbb' },
  },

  pro: {
    id: 'pro',
    name: 'Pro',
    tagline: 'Agency-quality content with a human eye on everything before it goes live.',
    priceUsd: 79,
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
    },
    stripePriceId: { dev: 'price_PRO_DEV_REPLACE', prod: 'price_1TLfJ08UA4orc9zNrNzFnRr7' },
    paystackPlanCode: { dev: 'PLN_pro_dev_REPLACE', prod: 'PLN_o7ebuljkyw9iyaw' },
  },

  agency: {
    id: 'agency',
    name: 'Agency',
    tagline: 'Run content for multiple clients at scale, under one roof.',
    priceUsd: 149,
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
    },
    stripePriceId: { dev: 'price_AGENCY_DEV_REPLACE', prod: 'price_1TLfKa8UA4orc9zNw27oyVak' },
    paystackPlanCode: { dev: 'PLN_agency_dev_REPLACE', prod: 'PLN_uevdm7btk36wdhg' },
  },

  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Custom solution for large organisations.',
    priceUsd: 0,
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
    },
    stripePriceId: { dev: '', prod: '' },
    paystackPlanCode: { dev: '', prod: '' },
  },
};

export const FREE_TRIAL_DAYS = 7;
export const SETUP_FEE_USD = 5; // flat across all plans

function getEnv(): 'dev' | 'prod' {
  return process.env.BILLING_PLAN_ENV === 'prod' ? 'prod' : 'dev';
}

export function getPlanConfig(planId: string): PlanConfig | null {
  return PLAN_CONFIGS[planId] ?? null;
}

export function getStripePriceId(planId: string): string | null {
  const plan = PLAN_CONFIGS[planId];
  if (!plan) {
    return null;
  }
  return plan.stripePriceId[getEnv()];
}

export function getPaystackPlanCode(planId: string): string | null {
  const plan = PLAN_CONFIGS[planId];
  if (!plan) {
    return null;
  }
  return plan.paystackPlanCode[getEnv()];
}

export function getPlanByStripePriceId(priceId: string): PlanConfig | null {
  const env = getEnv();
  return Object.values(PLAN_CONFIGS).find(p => p.stripePriceId[env] === priceId) ?? null;
}

export function getPlanByPaystackCode(planCode: string): PlanConfig | null {
  const env = getEnv();
  return Object.values(PLAN_CONFIGS).find(p => p.paystackPlanCode[env] === planCode) ?? null;
}

export function getEffectivePlanFeatures(planId: string, planStatus: string): PlanFeatures {
  if (planStatus === 'trialing') {
    return PLAN_CONFIGS.starter!.features;
  }
  return PLAN_CONFIGS[planId]?.features ?? PLAN_CONFIGS.starter!.features;
}

export function isPlanConfigured(planId: string): boolean {
  const priceId = getStripePriceId(planId);
  return !!priceId && !priceId.includes('REPLACE');
}

export function formatLimit(value: number, singular: string, plural?: string): string {
  if (value === -1) {
    return 'Unlimited';
  }
  return `${value} ${value === 1 ? singular : (plural ?? `${singular}s`)}`;
}

export const VISIBLE_PLANS = Object.values(PLAN_CONFIGS).filter(p => !p.hidden);
