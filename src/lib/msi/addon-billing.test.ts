import { afterEach, describe, expect, it } from 'vitest';

import {
  addonPriceEnvKey,
  addonTierPriceId,
  isAddonBillingEnabled,
  syncAddonBilling,
} from './addon-billing';

describe('add-on billing config', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('is on only for the explicit truthy flag values', () => {
    // Pass explicit values (not undefined, which would read the ambient env).
    expect(isAddonBillingEnabled('')).toBe(false);
    expect(isAddonBillingEnabled('false')).toBe(false);
    expect(isAddonBillingEnabled('0')).toBe(false);
    expect(isAddonBillingEnabled('true')).toBe(true);
    expect(isAddonBillingEnabled('1')).toBe(true);
  });

  it('derives the price env key from add-on + tier', () => {
    expect(addonPriceEnvKey('managed_posting', 'professional')).toBe(
      'STRIPE_ADDON_PRICE_MANAGED_POSTING_PROFESSIONAL',
    );
    expect(addonPriceEnvKey('managed_expansion')).toBe('STRIPE_ADDON_PRICE_MANAGED_EXPANSION');
    expect(addonPriceEnvKey('managed_ads', null)).toBe('STRIPE_ADDON_PRICE_MANAGED_ADS');
  });

  it('resolves a price id from the matching env var', () => {
    // Use a unique, test-only key so the ambient env can't collide.
    process.env.STRIPE_ADDON_PRICE_MANAGED_POSTING_TESTTIER = 'price_abc';
    expect(addonTierPriceId('managed_posting', 'testtier')).toBe('price_abc');
    // A tier with no configured env var resolves to null.
    expect(addonTierPriceId('managed_posting', 'no_such_tier_xyz')).toBeNull();
  });

  it('is a safe no-op when billing is disabled (no Stripe, no DB)', async () => {
    delete process.env.MSI_ADDON_BILLING_ENABLED;
    await expect(
      syncAddonBilling({
        orgId: 'org-1',
        addonId: 'managed_posting',
        tierId: 'starter',
        existingItemId: 'si_existing',
      }),
    ).resolves.toBe('si_existing');
  });
});
