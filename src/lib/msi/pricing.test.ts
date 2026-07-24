import { describe, expect, it } from 'vitest';

import {
  MSI_PER_ACCOUNT_USD,
  orderMonthlyTotalCents,
  orderMonthlyTotalUsd,
  perAccountCents,
} from './pricing';

describe('msi pricing', () => {
  it('converts the per-account price to cents', () => {
    expect(perAccountCents()).toBe(MSI_PER_ACCOUNT_USD * 100);
  });

  it('multiplies by quantity (min 1, whole accounts)', () => {
    expect(orderMonthlyTotalUsd(10)).toBe(MSI_PER_ACCOUNT_USD * 10);
    expect(orderMonthlyTotalCents(3)).toBe(perAccountCents() * 3);
    expect(orderMonthlyTotalUsd(0)).toBe(MSI_PER_ACCOUNT_USD); // clamps to 1
    expect(orderMonthlyTotalUsd(2.9)).toBe(MSI_PER_ACCOUNT_USD * 2); // floors
  });
});
