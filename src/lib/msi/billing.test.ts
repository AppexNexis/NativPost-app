import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  billingPeriodOf,
  buildPublishEvent,
  createPolarBillingService,
  createStripeBillingService,
  getBillingService,
  isMeteredBillingEnabled,
  noopBillingService,
} from './billing';

// Mock the Stripe SDK the metered provider lazily imports.
const { meterEventsCreate } = vi.hoisted(() => ({ meterEventsCreate: vi.fn() }));
vi.mock('stripe', () => ({
  default: class MockStripe {
    billing = { meterEvents: { create: meterEventsCreate } };
    constructor(_key: string) {}
  },
}));

// Mock the Polar client the metered provider lazily imports, so no test needs
// a real access token or network.
const { eventsIngest } = vi.hoisted(() => ({ eventsIngest: vi.fn() }));
vi.mock('@/lib/billing/polar-client', () => ({
  getPolarClient: async () => ({ events: { ingest: eventsIngest } }),
  isPolarConfigured: () => true,
  getPolarServer: () => 'sandbox',
}));

describe('billingPeriodOf', () => {
  it('buckets by UTC year-month, zero-padded', () => {
    expect(billingPeriodOf(new Date('2026-07-24T12:00:00Z'))).toBe('2026-07');
    expect(billingPeriodOf(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
    // Late-UTC edge stays in the correct month.
    expect(billingPeriodOf(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12');
  });
});

describe('buildPublishEvent', () => {
  it('carries the identifiers, derives the period, defaults platformPostId null', () => {
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
      platformPostId: null,
      permalink: null,
      billingPeriod: '2026-07',
    });
  });

  it('keeps a supplied platformPostId (automated flow)', () => {
    const row = buildPublishEvent({
      orgId: 'org-1',
      managedAccountId: 'acc-1',
      jobId: 'job-1',
      contentItemId: null,
      platform: 'tiktok',
      occurredAt: new Date('2026-07-24T09:00:00Z'),
      platformPostId: '7665041407052139784',
    });

    expect(row.platformPostId).toBe('7665041407052139784');
  });

  it('keeps a supplied permalink (threaded from the publish result)', () => {
    const row = buildPublishEvent({
      orgId: 'org-1',
      managedAccountId: 'acc-1',
      jobId: 'job-1',
      contentItemId: 'content-1',
      platform: 'instagram',
      occurredAt: new Date('2026-07-24T09:00:00Z'),
      permalink: 'https://www.instagram.com/p/DbM-YKCEfmq/',
    });

    expect(row.permalink).toBe('https://www.instagram.com/p/DbM-YKCEfmq/');
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

  it('no-op provider reports without throwing (null provider id)', async () => {
    await expect(
      noopBillingService.reportUsage({
        orgId: 'o',
        billingPeriod: '2026-07',
        eventId: 'e',
      }),
    ).resolves.toEqual({ providerRecordId: null });
  });

  it('routes to the provider BILLING_PROVIDER selects, once enabled', () => {
    process.env.MSI_METERED_BILLING_ENABLED = 'true';
    try {
      process.env.BILLING_PROVIDER = 'polar';

      expect(getBillingService().id).toBe('polar');

      process.env.BILLING_PROVIDER = 'stripe';

      expect(getBillingService().id).toBe('stripe');

      // Unset falls back to Stripe, so an existing deploy that never sets the
      // var keeps metering exactly where it already did.
      delete process.env.BILLING_PROVIDER;

      expect(getBillingService().id).toBe('stripe');
    } finally {
      delete process.env.MSI_METERED_BILLING_ENABLED;
      process.env.BILLING_PROVIDER = 'stripe';
    }
  });

  it('the kill-switch beats the provider choice', () => {
    process.env.BILLING_PROVIDER = 'polar';
    try {
      // Flag off → nothing is reported anywhere, on either rail.
      expect(getBillingService().enabled).toBe(false);
      expect(getBillingService().id).toBe('noop');
    } finally {
      process.env.BILLING_PROVIDER = 'stripe';
    }
  });
});

describe('Stripe metered provider', () => {
  afterEach(() => {
    meterEventsCreate.mockReset();
  });

  it('refuses to meter an org with no Stripe customer id', async () => {
    await expect(
      createStripeBillingService().reportUsage({
        orgId: 'org-1',
        billingPeriod: '2026-07',
        eventId: 'evt-1',
      }),
    ).rejects.toThrow(/no Stripe customer id/);
    expect(meterEventsCreate).not.toHaveBeenCalled();
  });

  it('canReport gates on the Stripe customer id', () => {
    const service = createStripeBillingService();
    const base = { orgId: 'org-1', billingPeriod: '2026-07', eventId: 'evt-1' };

    expect(service.canReport(base)).toBe(false);
    expect(service.canReport({ ...base, stripeCustomerId: 'cus_123' })).toBe(true);
  });

  it('reports one unit via the meter events API, idempotent on the event id', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    meterEventsCreate.mockResolvedValue({ identifier: 'evt-42' });

    const res = await createStripeBillingService().reportUsage({
      orgId: 'org-1',
      billingPeriod: '2026-07',
      eventId: 'evt-42',
      stripeCustomerId: 'cus_123',
      occurredAt: new Date(),
    });

    expect(res).toEqual({ providerRecordId: 'evt-42' });
    expect(meterEventsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { stripe_customer_id: 'cus_123', value: '1' },
        identifier: 'evt-42',
      }),
      { idempotencyKey: 'msi-meter-evt-42' },
    );
  });

  it('omits an out-of-window timestamp (Stripe rejects >35d old)', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    meterEventsCreate.mockResolvedValue({ identifier: 'evt-old' });

    await createStripeBillingService().reportUsage({
      orgId: 'org-1',
      billingPeriod: '2026-05',
      eventId: 'evt-old',
      stripeCustomerId: 'cus_123',
      occurredAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
    });

    const [params] = meterEventsCreate.mock.calls[0]!;

    expect(params).not.toHaveProperty('timestamp');
  });
});

describe('Polar metered provider', () => {
  afterEach(() => {
    eventsIngest.mockReset();
  });

  it('can meter any org — orgId IS the external customer id', () => {
    // Unlike Stripe there is no id-resolution step, so there is no
    // "skipped, no customer" class of event on this rail.
    expect(
      createPolarBillingService().canReport({
        orgId: 'org-1',
        billingPeriod: '2026-07',
        eventId: 'evt-1',
      }),
    ).toBe(true);
  });

  it('ingests one event keyed on the org, deduped by external id', async () => {
    eventsIngest.mockResolvedValue({ inserted: 1, duplicates: 0 });
    const occurredAt = new Date('2026-07-24T09:00:00Z');

    const res = await createPolarBillingService().reportUsage({
      orgId: 'org-1',
      billingPeriod: '2026-07',
      eventId: 'evt-42',
      occurredAt,
    });

    // The external_id we sent IS the reconciliation anchor: Polar's ingest
    // response returns counts, not per-event ids.
    expect(res).toEqual({ providerRecordId: 'evt-42' });
    expect(eventsIngest).toHaveBeenCalledWith({
      events: [
        {
          name: 'nativpost_managed_post',
          externalCustomerId: 'org-1',
          externalId: 'evt-42',
          timestamp: occurredAt,
          metadata: { billing_period: '2026-07', units: 1 },
        },
      ],
    });
  });

  it('omits the timestamp when the event has none', async () => {
    eventsIngest.mockResolvedValue({ inserted: 1, duplicates: 0 });

    await createPolarBillingService().reportUsage({
      orgId: 'org-1',
      billingPeriod: '2026-07',
      eventId: 'evt-43',
    });

    const [payload] = eventsIngest.mock.calls[0]!;

    expect(payload.events[0]).not.toHaveProperty('timestamp');
  });
});
