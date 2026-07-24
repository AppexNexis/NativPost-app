import { describe, expect, it } from 'vitest';

import {
  billingPeriodOf,
  buildPublishEvent,
  getBillingService,
  isMeteredBillingEnabled,
  noopBillingService,
} from './billing';

describe('billingPeriodOf', () => {
  it('buckets by UTC year-month, zero-padded', () => {
    expect(billingPeriodOf(new Date('2026-07-24T12:00:00Z'))).toBe('2026-07');
    expect(billingPeriodOf(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
    // Late-UTC edge stays in the correct month.
    expect(billingPeriodOf(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12');
  });
});

describe('buildPublishEvent', () => {
  it('carries the identifiers and derives the billing period', () => {
    const row = buildPublishEvent({
      orgId: 'org-1',
      managedAccountId: 'acc-1',
      jobId: 'job-1',
      contentItemId: 'content-1',
      platform: 'tiktok',
      occurredAt: new Date('2026-07-24T09:00:00Z'),
    });
    expect(row).toEqual({
      orgId: 'org-1',
      managedAccountId: 'acc-1',
      jobId: 'job-1',
      contentItemId: 'content-1',
      platform: 'tiktok',
      occurredAt: new Date('2026-07-24T09:00:00Z'),
      billingPeriod: '2026-07',
    });
  });
});

describe('billing feature flag', () => {
  it('is off unless explicitly enabled', () => {
    expect(isMeteredBillingEnabled(undefined)).toBe(false);
    expect(isMeteredBillingEnabled('false')).toBe(false);
    expect(isMeteredBillingEnabled('true')).toBe(true);
    expect(isMeteredBillingEnabled('1')).toBe(true);
  });

  it('defaults to the no-op provider (reporting disabled)', () => {
    // Env flag unset in tests → resolver returns the disabled provider.
    const service = getBillingService();
    expect(service.enabled).toBe(false);
    expect(service).toBe(noopBillingService);
  });

  it('no-op provider reports without throwing', async () => {
    await expect(
      noopBillingService.reportUsage({
        orgId: 'o',
        billingPeriod: '2026-07',
        eventId: 'e',
      }),
    ).resolves.toBeUndefined();
  });
});
