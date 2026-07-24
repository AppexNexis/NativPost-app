import { describe, expect, it } from 'vitest';

import { ACCOUNT_STATES } from './lifecycle';
import { rollupCountries, summarizePipeline } from './ops-overview';

describe('ops overview aggregation', () => {
  it('tallies pipeline states, zero for missing, and covers every state', () => {
    const counts = summarizePipeline([
      'live',
      'live',
      'customer_review',
      'building',
    ]);
    expect(counts.live).toBe(2);
    expect(counts.customer_review).toBe(1);
    expect(counts.building).toBe(1);
    expect(counts.ordered).toBe(0);
    for (const s of ACCOUNT_STATES) {
      expect(counts[s]).toBeGreaterThanOrEqual(0);
    }
  });

  it('ignores unknown states', () => {
    expect(summarizePipeline(['live', 'bogus']).live).toBe(1);
  });

  it('rolls up country inventory, busiest first', () => {
    const rows = rollupCountries(
      [{ country: 'US' }, { country: 'US' }, { country: 'UK' }],
      [{ country: 'US', capacity: 10 }, { country: 'UK', capacity: 5 }],
      [{ country: 'US', capacity: 5 }],
    );
    expect(rows[0]!.country).toBe('US');
    expect(rows[0]!.accounts).toBe(2);
    expect(rows[0]!.operators).toBe(1);
    expect(rows[0]!.operatorCapacity).toBe(10);
    expect(rows[0]!.deviceCapacity).toBe(5);
    expect(rows[1]!.country).toBe('UK');
    expect(rows[1]!.devices).toBe(0);
  });
});
