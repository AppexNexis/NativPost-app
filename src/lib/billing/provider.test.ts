import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getActiveBillingProvider,
  getPlanByPolarProductId,
  getPolarProductId,
  getPolarProductInterval,
  getStripePriceId,
  isPlanConfiguredFor,
  PLAN_CONFIGS,
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
  // Both branches dynamically import a provider module, which pulls in its SDK.
  // That is ~2s cold and can exceed the 5s default under full-suite parallel
  // load, so give it room rather than letting it flake.
  it('loads the matching implementation', { timeout: 30_000 }, async () => {
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

// The catalog in plans.ts is EXPECTED to change as real ids replace the
// `…REPLACE` placeholders, so nothing below asserts a literal id. Each test
// derives what it expects from PLAN_CONFIGS and checks the resolver's
// behaviour — which is what actually has to hold — rather than the catalog's
// current contents.
const STARTER = PLAN_CONFIGS.starter!;
const GROWTH = PLAN_CONFIGS.growth!;
const PRO = PLAN_CONFIGS.pro!;

describe('polar plan resolution', () => {
  it('returns the monthly product by default and the annual one for year', () => {
    expect(getPolarProductId('starter')).toBe(STARTER.polarProductId.dev);
    expect(getPolarProductId('starter', 'month')).toBe(STARTER.polarProductId.dev);
    expect(getPolarProductId('starter', 'year')).toBe(
      STARTER.polarAnnualProductId.dev,
    );
    // The two must be distinct products — Polar cannot express both intervals
    // on one product, so a copy-paste here would silently bill the wrong cycle.
    expect(STARTER.polarProductId.dev).not.toBe(STARTER.polarAnnualProductId.dev);
  });

  it('returns null for an unknown plan', () => {
    expect(getPolarProductId('no_such_plan')).toBeNull();
  });

  it('maps a product id back to its plan', () => {
    expect(getPlanByPolarProductId(GROWTH.polarProductId.dev)?.id).toBe('growth');
    expect(getPlanByPolarProductId(GROWTH.polarAnnualProductId.dev)?.id).toBe(
      'growth',
    );
    expect(getPlanByPolarProductId('polar_unknown')).toBeNull();
  });

  it('recovers the interval from the product id', () => {
    // Polar has no price object, so the interval is only knowable from WHICH
    // product was bought — the webhook depends on this.
    expect(getPolarProductInterval(PRO.polarProductId.dev)).toBe('month');
    expect(getPolarProductInterval(PRO.polarAnnualProductId.dev)).toBe('year');
    expect(getPolarProductInterval('polar_unknown')).toBeNull();
  });

  it('resolves against the prod column when BILLING_PLAN_ENV is prod', () => {
    process.env.BILLING_PLAN_ENV = 'prod';

    expect(getPolarProductId('starter')).toBe(STARTER.polarProductId.prod);
    expect(getPolarProductId('starter', 'year')).toBe(
      STARTER.polarAnnualProductId.prod,
    );
  });
});

describe('isPlanConfiguredFor', () => {
  it('rejects an id that is still a placeholder', () => {
    // Whatever the catalog currently holds, a `…REPLACE` id must never be
    // treated as sellable — that is the guard stopping a half-configured
    // deploy from sending customers to a broken checkout.
    for (const provider of ['polar', 'stripe'] as const) {
      const resolved = provider === 'polar'
        ? getPolarProductId('starter')
        : getStripePriceId('starter');
      expect(isPlanConfiguredFor(provider, 'starter')).toBe(
        !!resolved && !resolved.includes('REPLACE'),
      );
    }
  });

  it('treats the free and enterprise tiers as not purchasable', () => {
    // These carry empty ids by design and never gain one, so this holds
    // regardless of how far product setup has progressed.
    expect(isPlanConfiguredFor('polar', 'free')).toBe(false);
    expect(isPlanConfiguredFor('polar', 'enterprise')).toBe(false);
    expect(isPlanConfiguredFor('stripe', 'free')).toBe(false);
    expect(isPlanConfiguredFor('stripe', 'enterprise')).toBe(false);
  });

  it('accepts a real id', () => {
    // Stripe's prod column has held real ids since before Polar existed, so it
    // is the stable example of the positive case.
    process.env.BILLING_PLAN_ENV = 'prod';

    expect(getStripePriceId('starter')).not.toContain('REPLACE');
    expect(isPlanConfiguredFor('stripe', 'starter')).toBe(true);
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
