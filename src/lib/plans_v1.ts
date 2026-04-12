/**
 * NativPost Plan Configuration
 *
 * Single source of truth for plan tiers, limits, and pricing.
 * Used by: billing pages, plan enforcement middleware, checkout flows.
 *
 * Stripe Price IDs and Paystack Plan Codes go here once created.
 */

export type PlanConfig = {
  id: string;
  name: string;
  priceUsd: number;
  setupFeeUsd: number;
  // Limits
  postsPerMonth: number;
  platformsLimit: number;
  // Features
  brandProfileDepth: 'basic' | 'detailed' | 'premium' | 'bespoke';
  graphicsType: 'templates' | 'custom' | 'premium_custom' | 'bespoke';
  humanReview: 'self' | 'team' | 'dedicated';
  analyticsLevel: 'basic' | 'detailed' | 'advanced' | 'advanced_api';
  supportLevel: 'email' | 'priority_email' | 'live_chat' | 'dedicated_slack';
  // Billing IDs (fill in after creating in Stripe/Paystack dashboards)
  stripePriceId: {
    dev: string;
    prod: string;
  };
  paystackPlanCode: {
    dev: string;
    prod: string;
  };
};

export const PLANS: Record<string, PlanConfig> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    priceUsd: 19,
    setupFeeUsd: 29,
    postsPerMonth: 20,
    platformsLimit: 3,
    brandProfileDepth: 'basic',
    graphicsType: 'templates',
    humanReview: 'self',
    analyticsLevel: 'basic',
    supportLevel: 'email',
    stripePriceId: {
      dev: 'price_starter_dev_REPLACE',
      prod: 'price_starter_prod_REPLACE',
    },
    paystackPlanCode: {
      dev: 'PLN_starter_dev_REPLACE',
      prod: 'PLN_starter_prod_REPLACE',
    },
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    priceUsd: 49,
    setupFeeUsd: 79,
    postsPerMonth: 40,
    platformsLimit: 5,
    brandProfileDepth: 'detailed',
    graphicsType: 'custom',
    humanReview: 'self',
    analyticsLevel: 'detailed',
    supportLevel: 'priority_email',
    stripePriceId: {
      dev: 'price_growth_dev_REPLACE',
      prod: 'price_growth_prod_REPLACE',
    },
    paystackPlanCode: {
      dev: 'PLN_growth_dev_REPLACE',
      prod: 'PLN_growth_prod_REPLACE',
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceUsd: 99,
    setupFeeUsd: 149,
    postsPerMonth: 80,
    platformsLimit: 99, // "all"
    brandProfileDepth: 'premium',
    graphicsType: 'premium_custom',
    humanReview: 'team',
    analyticsLevel: 'advanced',
    supportLevel: 'live_chat',
    stripePriceId: {
      dev: 'price_pro_dev_REPLACE',
      prod: 'price_pro_prod_REPLACE',
    },
    paystackPlanCode: {
      dev: 'PLN_pro_dev_REPLACE',
      prod: 'PLN_pro_prod_REPLACE',
    },
  },
  agency: {
    id: 'agency',
    name: 'Agency',
    priceUsd: 199,
    setupFeeUsd: 299,
    postsPerMonth: 999999, // unlimited
    platformsLimit: 99,
    brandProfileDepth: 'bespoke',
    graphicsType: 'bespoke',
    humanReview: 'dedicated',
    analyticsLevel: 'advanced_api',
    supportLevel: 'dedicated_slack',
    stripePriceId: {
      dev: 'price_agency_dev_REPLACE',
      prod: 'price_agency_prod_REPLACE',
    },
    paystackPlanCode: {
      dev: 'PLN_agency_dev_REPLACE',
      prod: 'PLN_agency_prod_REPLACE',
    },
  },
};

export const FREE_TRIAL_DAYS = 7;

/**
 * Get the Stripe price ID for a plan based on environment.
 */
export function getStripePriceId(planId: string): string | null {
  const plan = PLANS[planId];
  if (!plan) {
    return null;
  }
  const env = process.env.BILLING_PLAN_ENV === 'prod' ? 'prod' : 'dev';
  return plan.stripePriceId[env];
}

/**
 * Get the Paystack plan code for a plan based on environment.
 */
export function getPaystackPlanCode(planId: string): string | null {
  const plan = PLANS[planId];
  if (!plan) {
    return null;
  }
  const env = process.env.BILLING_PLAN_ENV === 'prod' ? 'prod' : 'dev';
  return plan.paystackPlanCode[env];
}

/**
 * Get plan config by Stripe price ID (for webhook handling).
 */
export function getPlanByStripePriceId(priceId: string): PlanConfig | null {
  const env = process.env.BILLING_PLAN_ENV === 'prod' ? 'prod' : 'dev';
  return Object.values(PLANS).find(p => p.stripePriceId[env] === priceId) || null;
}
