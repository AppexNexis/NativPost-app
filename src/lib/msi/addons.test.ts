import { describe, expect, it } from 'vitest';

import {
  ADDON_CATALOG,
  addonFromPriceUsd,
  addonsByPriority,
  getAddon,
  isAddonId,
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
