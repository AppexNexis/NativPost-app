import { describe, expect, it } from 'vitest';

import { computeHealthScore, scoreTone } from './health';

describe('computeHealthScore', () => {
  it('averages the five dimensions into an overall', () => {
    const s = computeHealthScore({
      health: 100,
      growth: 80,
      consistency: 90,
      compliance: 100,
      brandMatch: 80,
    });
    expect(s.overall).toBe(90); // (100+80+90+100+80)/5
    expect(s.dimensions).toHaveLength(5);
  });

  it('defaults compliance to 100 and clamps out-of-range values', () => {
    const s = computeHealthScore({ health: 150, growth: -20 });
    const byLabel = Object.fromEntries(s.dimensions.map(d => [d.label, d.value]));
    expect(byLabel.Health).toBe(100);
    expect(byLabel.Growth).toBe(0);
    expect(byLabel.Compliance).toBe(100);
  });
});

describe('scoreTone', () => {
  it('buckets scores', () => {
    expect(scoreTone(95)).toBe('live');
    expect(scoreTone(70)).toBe('warn');
    expect(scoreTone(30)).toBe('danger');
  });
});
