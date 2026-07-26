import { describe, expect, it } from 'vitest';

import { canDeliver, composeReportSummary, reportPeriodOf } from './managed-analytics';

describe('Managed Analytics', () => {
  it('buckets the period by UTC year-month', () => {
    expect(reportPeriodOf(new Date('2026-07-15T12:00:00Z'))).toBe('2026-07');
    expect(reportPeriodOf(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
    expect(reportPeriodOf(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12');
  });

  it('composes a report with headline, sections, and recommendations', () => {
    const r = composeReportSummary({ period: '2026-07', postsPublished: 24 });
    expect(r.headline).toContain('2026-07');
    expect(r.headline).toContain('24 posts');
    expect(r.sections.map(s => s.title)).toEqual(['Activity', 'What worked', 'Audience']);
    expect(r.recommendations.length).toBeGreaterThan(0);
  });

  it('adapts copy to a light month', () => {
    const light = composeReportSummary({ period: '2026-07', postsPublished: 3 });
    expect(light.sections[0]!.body).toMatch(/light month/i);
    expect(light.recommendations[0]).toMatch(/cadence/i);
  });

  it('adapts copy to an empty month', () => {
    const empty = composeReportSummary({ period: '2026-07', postsPublished: 0 });
    expect(empty.sections[0]!.body).toMatch(/no posts/i);
    expect(empty.headline).toMatch(/plan/i);
  });

  it('reflects optional follower + top-post inputs', () => {
    const r = composeReportSummary({
      period: '2026-07',
      postsPublished: 10,
      followerDelta: 120,
      topPostUrl: 'https://example.com/p/1',
    });
    const audience = r.sections.find(s => s.title === 'Audience')!;
    expect(audience.body).toContain('+120');
  });

  it('allows delivery only from in_review', () => {
    expect(canDeliver('in_review')).toBe(true);
    expect(canDeliver('generating')).toBe(false);
    expect(canDeliver('delivered')).toBe(false);
  });
});
