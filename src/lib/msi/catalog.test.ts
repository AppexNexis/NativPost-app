import { describe, expect, it } from 'vitest';

import {
  isSupportedCountry,
  isSupportedPlatform,
  MSI_COUNTRIES,
  MSI_PLATFORMS,
} from './catalog';

describe('msi catalog', () => {
  it('exposes non-empty platform + country catalogs', () => {
    expect(MSI_PLATFORMS.length).toBeGreaterThan(0);
    expect(MSI_COUNTRIES.length).toBeGreaterThan(0);
  });

  it('has unique values with non-empty labels', () => {
    for (const list of [MSI_PLATFORMS, MSI_COUNTRIES]) {
      const values = list.map(o => o.value);
      expect(new Set(values).size).toBe(values.length);
      expect(list.every(o => o.label.length > 0)).toBe(true);
    }
  });

  it('validates membership', () => {
    expect(isSupportedPlatform('tiktok')).toBe(true);
    expect(isSupportedPlatform('myspace')).toBe(false);
    expect(isSupportedCountry('US')).toBe(true);
    expect(isSupportedCountry('ZZ')).toBe(false);
  });
});
