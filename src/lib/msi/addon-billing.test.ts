import { afterEach, describe, expect, it } from 'vitest';

import {
  addonPriceEnvKey,
  addonProductEnvKey,
  addonRequiresCheckout,
  addonTierPriceId,
  addonTierProductId,
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

  it('derives the Polar product env key from add-on + tier', () => {
    expect(addonProductEnvKey('managed_posting', 'professional')).toBe(
      'POLAR_ADDON_PRODUCT_MANAGED_POSTING_PROFESSIONAL',
    );
    expect(addonProductEnvKey('managed_expansion')).toBe(
      'POLAR_ADDON_PRODUCT_MANAGED_EXPANSION',
    );
  });

  it('resolves a Polar product id from the matching env var', () => {
    process.env.POLAR_ADDON_PRODUCT_MANAGED_POSTING_TESTTIER = 'prod_abc';
    expect(addonTierProductId('managed_posting', 'testtier')).toBe('prod_abc');
    expect(addonTierProductId('managed_posting', 'no_such_tier_xyz')).toBeNull();
  });
});

// The gate deciding whether activation can happen server-side or has to send
// the customer to a payment page. Getting this wrong either bills nobody or
// blocks activation, so every branch is pinned.
describe('addonRequiresCheckout', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  function polarWithProduct() {
    process.env.MSI_ADDON_BILLING_ENABLED = 'true';
    process.env.BILLING_PROVIDER = 'polar';
    process.env.POLAR_ADDON_PRODUCT_MANAGED_POSTING_TESTTIER = 'prod_abc';
  }

  it('requires checkout for a first activation on Polar', () => {
    polarWithProduct();
    expect(
      addonRequiresCheckout({ addonId: 'managed_posting', tierId: 'testtier' }),
    ).toBe(true);
  });

  it('does NOT require checkout for a tier change on Polar', () => {
    // An existing subscription can be moved to the new product in place, so
    // the customer must not be asked to pay again.
    polarWithProduct();
    expect(
      addonRequiresCheckout({
        addonId: 'managed_posting',
        tierId: 'testtier',
        existingLinkageId: 'sub_existing',
      }),
    ).toBe(false);
  });

  it('never requires checkout on Stripe', () => {
    // Stripe bills add-ons as items on the org's existing subscription, with no
    // customer interaction — the whole reason the two flows differ.
    process.env.MSI_ADDON_BILLING_ENABLED = 'true';
    process.env.BILLING_PROVIDER = 'stripe';
    process.env.POLAR_ADDON_PRODUCT_MANAGED_POSTING_TESTTIER = 'prod_abc';
    expect(
      addonRequiresCheckout({ addonId: 'managed_posting', tierId: 'testtier' }),
    ).toBe(false);
  });

  it('does not require checkout when the add-on has no configured product', () => {
    // Unconfigured add-ons activate immediately and unbilled on both rails —
    // matching the pre-Polar behaviour rather than blocking the customer.
    process.env.MSI_ADDON_BILLING_ENABLED = 'true';
    process.env.BILLING_PROVIDER = 'polar';
    expect(
      addonRequiresCheckout({ addonId: 'managed_posting', tierId: 'no_such_tier_xyz' }),
    ).toBe(false);
  });

  it('does not require checkout while add-on billing is switched off', () => {
    delete process.env.MSI_ADDON_BILLING_ENABLED;
    process.env.BILLING_PROVIDER = 'polar';
    process.env.POLAR_ADDON_PRODUCT_MANAGED_POSTING_TESTTIER = 'prod_abc';
    expect(
      addonRequiresCheckout({ addonId: 'managed_posting', tierId: 'testtier' }),
    ).toBe(false);
  });
});
