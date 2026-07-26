import { describe, expect, it } from 'vitest';

import {
  AD_SETUP_FEE_CENTS,
  computeManagementFeeCents,
  formatUsd,
  isValidManagementPct,
} from './managed-ads';

describe('Managed Advertising', () => {
  it('sets the setup fee at $49', () => {
    expect(AD_SETUP_FEE_CENTS).toBe(4900);
  });

  it('validates management pct is a whole number 10–20', () => {
    expect(isValidManagementPct(10)).toBe(true);
    expect(isValidManagementPct(15)).toBe(true);
    expect(isValidManagementPct(20)).toBe(true);
    expect(isValidManagementPct(9)).toBe(false);
    expect(isValidManagementPct(21)).toBe(false);
    expect(isValidManagementPct(15.5)).toBe(false);
  });

  it('computes the management fee as pct of spend, rounded', () => {
    expect(computeManagementFeeCents(100000, 15)).toBe(15000); // $1000 spend, 15% → $150
    expect(computeManagementFeeCents(33333, 10)).toBe(3333); // rounds
    expect(computeManagementFeeCents(0, 15)).toBe(0);
    expect(computeManagementFeeCents(100000, 0)).toBe(0);
  });

  it('formats cents as USD', () => {
    expect(formatUsd(150000)).toBe('$1,500.00');
    expect(formatUsd(4900)).toBe('$49.00');
  });
});
