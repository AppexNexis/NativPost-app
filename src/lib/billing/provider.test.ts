import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getActiveBillingProvider,
  getPlanByPolarProductId,
  getPolarProductId,
  getPolarProductInterval,
  isPlanConfiguredFor,
} from '@/lib/plans';

import { getPolarServer, isPolarConfigured } from './polar-client';
import { resolveBillingProvider, withCheckoutIdParam } from './provider';

// The plan catalog resolves ids through BILLING_PLAN_ENV, and every test here
// asserts against the `dev`/sandbox column.
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.BILLING_PLAN_ENV = 'dev';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('getActiveBillingProvider', () => {
  it('defaults to stripe so existing deployments are unaffected', () => {
    expect(getActiveBillingProvider(undefined)).toBe('stripe');
    expect(getActiveBillingProvider('')).toBe('stripe');
  });

  it('selects polar only on an exact match', () => {
    expect(getActiveBillingProvider('polar')).toBe('polar');
    // Anything unrecognised falls back rather than disabling billing.
    expect(getActiveBillingProvider('POLAR')).toBe('stripe');
    expect(getActiveBillingProvider('paystack')).toBe('stripe');
  });
});

describe('resolveBillingProvider', () => {
  it('loads the matching implementation', async () => {
    await expect(resolveBillingProvider('stripe')).resolves.toMatchObject({
      id: 'stripe',
      label: 'Stripe',
    });
    await expect(resolveBillingProvider('polar')).resolves.toMatchObject({
      id: 'polar',
      label: 'Polar',
    });
  });

  it('exposes the same capability surface on both rails', async () => {
    const stripe = await resolveBillingProvider('stripe');
    const polar = await resolveBillingProvider('polar');

    // A capability that exists on one rail but not the other is a bug — the
    // whole point of the seam is that callers never branch on provider.
    expect(Object.keys(polar).sort()).toEqual(Object.keys(stripe).sort());
  });
});

describe('withCheckoutIdParam', () => {
  it('appends with ? when the URL has no query string', () => {
    expect(withCheckoutIdParam('https://a.test/done', 'checkout_id', '{ID}')).toBe(
      'https://a.test/done?checkout_id={ID}',
    );
  });

  it('appends with & when the URL already has params', () => {
    expect(
      withCheckoutIdParam('https://a.test/done?success=true', 'session_id', '{ID}'),
    ).toBe('https://a.test/done?success=true&session_id={ID}');
  });
});

describe('polar plan resolution', () => {
  it('returns the monthly product by default and the annual one for year', () => {
    expect(getPolarProductId('starter')).toBe('polar_STARTER_SANDBOX_REPLACE');
    expect(getPolarProductId('starter', 'month')).toBe('polar_STARTER_SANDBOX_REPLACE');
    expect(getPolarProductId('starter', 'year')).toBe(
      'polar_STARTER_ANNUAL_SANDBOX_REPLACE',
    );
  });

  it('returns null for an unknown plan', () => {
    expect(getPolarProductId('no_such_plan')).toBeNull();
  });

  it('maps a product id back to its plan', () => {
    expect(getPlanByPolarProductId('polar_GROWTH_SANDBOX_REPLACE')?.id).toBe('growth');
    expect(getPlanByPolarProductId('polar_GROWTH_ANNUAL_SANDBOX_REPLACE')?.id).toBe(
      'growth',
    );
    expect(getPlanByPolarProductId('polar_unknown')).toBeNull();
  });

  it('recovers the interval from the product id', () => {
    // Polar has no price object, so the interval is only knowable from WHICH
    // product was bought — the webhook depends on this.
    expect(getPolarProductInterval('polar_PRO_SANDBOX_REPLACE')).toBe('month');
    expect(getPolarProductInterval('polar_PRO_ANNUAL_SANDBOX_REPLACE')).toBe('year');
    expect(getPolarProductInterval('polar_unknown')).toBeNull();
  });

  it('resolves against the prod column when BILLING_PLAN_ENV is prod', () => {
    process.env.BILLING_PLAN_ENV = 'prod';

    expect(getPolarProductId('starter')).toBe('polar_STARTER_PROD_REPLACE');
  });
});

describe('isPlanConfiguredFor', () => {
  it('treats placeholder ids as not purchasable on either rail', () => {
    // Both catalogs still hold `…REPLACE` placeholders in the dev column, so
    // nothing is sellable until real ids are filled in.
    expect(isPlanConfiguredFor('polar', 'starter')).toBe(false);
    expect(isPlanConfiguredFor('stripe', 'starter')).toBe(false);
  });

  it('treats the free and enterprise tiers as not purchasable', () => {
    expect(isPlanConfiguredFor('polar', 'free')).toBe(false);
    expect(isPlanConfiguredFor('polar', 'enterprise')).toBe(false);
  });

  it('accepts a real id', () => {
    // Stripe's prod column holds real ids, unlike dev.
    process.env.BILLING_PLAN_ENV = 'prod';

    expect(isPlanConfiguredFor('stripe', 'starter')).toBe(true);
    // Polar prod is still a placeholder until products are created.
    expect(isPlanConfiguredFor('polar', 'starter')).toBe(false);
  });
});

describe('polar client configuration', () => {
  it('reports unconfigured without an access token', () => {
    expect(isPolarConfigured(undefined)).toBe(false);
    expect(isPolarConfigured('')).toBe(false);
    expect(isPolarConfigured('   ')).toBe(false);
    expect(isPolarConfigured('polar_oat_x')).toBe(true);
  });

  it('honours POLAR_SERVER when set', () => {
    expect(getPolarServer('sandbox', 'prod')).toBe('sandbox');
    expect(getPolarServer('production', 'dev')).toBe('production');
  });

  it('falls back to BILLING_PLAN_ENV when POLAR_SERVER is unset', () => {
    // The parameter defaults to process.env.POLAR_SERVER, which .env sets, so
    // clear it to exercise the fallback the way an unconfigured deploy would.
    delete process.env.POLAR_SERVER;

    expect(getPolarServer(process.env.POLAR_SERVER, 'prod')).toBe('production');
    expect(getPolarServer(process.env.POLAR_SERVER, 'dev')).toBe('sandbox');
    expect(getPolarServer(process.env.POLAR_SERVER, 'test')).toBe('sandbox');
    expect(getPolarServer(process.env.POLAR_SERVER, undefined)).toBe('sandbox');
  });

  it('ignores an unrecognised POLAR_SERVER and falls back', () => {
    // Sandbox and production are separate instances with separate tokens, so
    // anything unparseable must land on sandbox rather than real cards.
    expect(getPolarServer('nonsense', 'dev')).toBe('sandbox');
    expect(getPolarServer('nonsense', 'prod')).toBe('production');
  });
});
