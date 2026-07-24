import { describe, expect, it } from 'vitest';

import { JOB_SLA_HOURS, percentile, slaDueAt, summarizeSla } from './sla';

describe('sla', () => {
  it('has an SLA for every job type', () => {
    expect(Object.keys(JOB_SLA_HOURS).length).toBe(12);
    expect(JOB_SLA_HOURS.create_account).toBe(48);
  });

  it('computes a due date from the job type SLA', () => {
    const from = new Date('2026-07-23T00:00:00Z');
    const due = slaDueAt('publish_post', from); // 6h
    expect(due.getTime() - from.getTime()).toBe(6 * 3_600_000);
  });

  it('computes nearest-rank percentiles', () => {
    const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(samples, 0.5)).toBe(5);
    expect(percentile(samples, 0.9)).toBe(9);
    expect(percentile(samples, 1)).toBe(10);
  });

  it('handles empty and single-sample inputs', () => {
    expect(percentile([], 0.5)).toBe(0);
    expect(percentile([42], 0.9)).toBe(42);
  });

  it('summarizes p50/p90 with sample size', () => {
    expect(summarizeSla([2, 4, 6, 8])).toEqual({ sampleSize: 4, p50: 4, p90: 8 });
  });
});
