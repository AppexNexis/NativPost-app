import { describe, expect, it } from 'vitest';

import {
  ADDON_CATALOG,
  addonFromPriceUsd,
  addonsByPriority,
  getAddon,
  isAddonId,
  requiresTier,
  resolveTier,
  validateActivation,
} from './addons';

describe('MSI add-on catalog', () => {
  it('has unique add-on ids', () => {
    const ids = ADDON_CATALOG.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique, positive rollout priorities', () => {
    const priorities = ADDON_CATALOG.map(a => a.priority);
    expect(priorities.every(p => p > 0)).toBe(true);
    expect(new Set(priorities).size).toBe(priorities.length);
  });

  it('orders by rollout priority (Managed Posting first)', () => {
    const ordered = addonsByPriority();
    expect(ordered[0]!.id).toBe('managed_posting');
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i]!.priority).toBeGreaterThan(ordered[i - 1]!.priority);
    }
  });

  it('resolves add-ons by id and narrows unknown ids', () => {
    expect(getAddon('managed_ads')?.name).toBe('Managed Advertising');
    expect(getAddon('nope')).toBeUndefined();
    expect(isAddonId('managed_content')).toBe(true);
    expect(isAddonId('managed_nonsense')).toBe(false);
  });

  it('every fixed-tier add-on has at least one tier', () => {
    for (const addon of ADDON_CATALOG) {
      if (addon.pricing.kind === 'fixed_tiers') {
        expect(addon.pricing.tiers.length).toBeGreaterThan(0);
      }
    }
  });

  it('locks the Managed Posting starter tier at $49 / 12 posts', () => {
    const posting = getAddon('managed_posting')!;
    expect(posting.pricing.kind).toBe('fixed_tiers');
    if (posting.pricing.kind === 'fixed_tiers') {
      const starter = posting.pricing.tiers.find(t => t.id === 'starter')!;
      expect(starter.monthlyUsd).toBe(49);
      expect(starter.allotment).toContain('12 posts');
    }
  });

  it('knows which add-ons require a tier', () => {
    expect(requiresTier(getAddon('managed_posting')!)).toBe(true);
    expect(requiresTier(getAddon('managed_ads')!)).toBe(false); // percent_of_spend
    expect(requiresTier(getAddon('managed_expansion')!)).toBe(false); // per_account
  });

  it('resolves tiers only for fixed-tier add-ons', () => {
    const posting = getAddon('managed_posting')!;
    expect(resolveTier(posting, 'professional')?.monthlyUsd).toBe(99);
    expect(resolveTier(posting, 'nope')).toBeNull();
    expect(resolveTier(getAddon('managed_ads')!, 'anything')).toBeNull();
  });

  it('validates activation: tier required, valid, and unknown add-ons rejected', () => {
    expect(validateActivation('managed_nonsense')).toEqual({
      ok: false,
      error: 'Unknown add-on: managed_nonsense',
    });
    // tiered add-on with no tier → rejected
    const noTier = validateActivation('managed_posting');
    expect(noTier.ok).toBe(false);
    // tiered add-on with a bad tier → rejected
    expect(validateActivation('managed_posting', 'bogus').ok).toBe(false);
    // tiered add-on with a good tier → ok, tier resolved
    const good = validateActivation('managed_posting', 'scale');
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.tier?.monthlyUsd).toBe(199);
    }
    // non-tiered add-on ignores any tier and is ok
    const ads = validateActivation('managed_ads');
    expect(ads.ok).toBe(true);
    if (ads.ok) {
      expect(ads.tier).toBeNull();
    }
  });

  it('computes a "from" price per pricing model', () => {
    // fixed_tiers → cheapest tier
    expect(addonFromPriceUsd(getAddon('managed_posting')!)).toBe(49);
    // per_account
    expect(addonFromPriceUsd(getAddon('managed_expansion')!)).toBe(80);
    // percent_of_spend → the setup fee
    expect(addonFromPriceUsd(getAddon('managed_ads')!)).toBe(49);
    // per_case
    expect(addonFromPriceUsd(getAddon('managed_recovery')!)).toBe(99);
    // custom → null
    expect(addonFromPriceUsd(getAddon('managed_localization')!)).toBeNull();
  });
});
