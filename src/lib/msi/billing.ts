// Metered billing foundation (docs §6). Pure logic only — no db/Env imports, so
// it stays unit-testable. The publishing pipeline records one immutable
// `billable_publish_event` per successful publish; a separate reporter (behind
// a feature flag) later ships un-reported events to the billing provider. This
// split means metered billing can be switched on later WITHOUT changing the
// publish pipeline.

// Type-only — erased at compile time, so the pure-logic path and unit tests
// never load the Stripe SDK (the client is imported lazily; see below).
import type Stripe from 'stripe';

import { getActiveBillingProvider } from '@/lib/plans';

export type PublishEventInput = {
  orgId: string;
  managedAccountId: string;
  jobId: string;
  contentItemId: string | null;
  platform: string;
  occurredAt: Date;
  // The platform's post id, when known (automated flow); null in manual.
  platformPostId?: string | null;
  // The live post permalink, when the publish result carried one; null otherwise.
  permalink?: string | null;
};

export type PublishEventRow = Omit<PublishEventInput, 'platformPostId' | 'permalink'> & {
  platformPostId: string | null;
  permalink: string | null;
  billingPeriod: string;
};

/** UTC billing month bucket, `YYYY-MM`. */
export function billingPeriodOf(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/** Build the immutable event row for a successful publish (pure). */
export function buildPublishEvent(input: PublishEventInput): PublishEventRow {
  return {
    ...input,
    platformPostId: input.platformPostId ?? null,
    permalink: input.permalink ?? null,
    billingPeriod: billingPeriodOf(input.occurredAt),
  };
}

// -----------------------------------------------------------------------------
// BillingService — the provider seam. The pipeline never calls this directly;
// only the reporter does. Ships behind MSI_METERED_BILLING_ENABLED.
// -----------------------------------------------------------------------------

export type UsageRecord = {
  orgId: string;
  billingPeriod: string;
  eventId: string;
  // The org's Stripe customer id, resolved by the reporter (which owns DB
  // access). Absent/null for orgs that aren't Stripe customers — the Stripe
  // provider cannot meter those and the reporter skips them.
  //
  // Polar needs no equivalent: it keys usage on `external_customer_id`, and
  // NativPost passes the Clerk orgId as that everywhere, so `orgId` above is
  // already the customer reference. That is why the Polar provider can meter
  // an org the moment it exists, with no id-resolution step.
  stripeCustomerId?: string | null;
  // When the publish happened — used as the meter-event timestamp when recent.
  occurredAt?: Date;
};

/** Outcome of reporting one event: the provider's record id for reconciliation. */
export type ReportResult = { providerRecordId: string | null };

export type BillingServiceId = 'noop' | 'stripe' | 'polar';

export type BillingService = {
  readonly id: BillingServiceId;
  readonly enabled: boolean;
  /**
   * Whether this provider has everything it needs to meter this record. False
   * means "not yet" — the reporter leaves the event un-reported for a later
   * tick rather than dropping it or stamping it as done.
   */
  canReport: (record: UsageRecord) => boolean;
  /** Report one usage unit to the provider. No-op when disabled. */
  reportUsage: (record: UsageRecord) => Promise<ReportResult>;
};

/** Disabled provider — the default until metered billing is turned on. */
export const noopBillingService: BillingService = {
  id: 'noop',
  enabled: false,
  canReport() {
    return false;
  },
  async reportUsage() {
    // Intentionally does nothing — events accumulate un-reported until a real
    // provider is wired and the flag is enabled.
    return { providerRecordId: null };
  },
};

// The meter's `event_name` in Stripe (Billing → Meters). Each reported unit is
// one managed post; the meter's price ($MSI_PER_POST_USD) lives in Stripe.
const METER_EVENT_NAME
  = process.env.STRIPE_MSI_METER_EVENT_NAME || 'nativpost_managed_post';

// Stripe rejects meter-event timestamps older than ~35 days. Stay safely inside
// that so a late reporter run doesn't fail; otherwise the event defaults to now.
const METER_TIMESTAMP_MAX_AGE_MS = 34 * 24 * 60 * 60 * 1000;

// Built lazily on first use so the pure-logic path never loads the SDK.
let stripeClient: Stripe | null = null;

async function getStripeClient(): Promise<Stripe> {
  if (stripeClient) {
    return stripeClient;
  }
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set — cannot report metered usage.');
  }
  const { default: Stripe } = await import('stripe');
  stripeClient = new Stripe(key);
  return stripeClient;
}

/**
 * Stripe metered-billing provider. Reports one usage unit per managed post via
 * the Billing Meter Events API. Idempotent: the event id is both the Stripe
 * `identifier` (dedup within Stripe's rolling window) and the idempotency key,
 * so a retry/replay never double-meters. Enabled only when
 * MSI_METERED_BILLING_ENABLED is on; the reporter skips events with no Stripe
 * customer id (this call requires one).
 */
export function createStripeBillingService(): BillingService {
  return {
    id: 'stripe',
    enabled: true,
    canReport(record: UsageRecord): boolean {
      // The Stripe meter call is keyed on the Stripe customer id, so an org
      // that has never transacted on Stripe cannot be metered yet.
      return !!record.stripeCustomerId;
    },
    async reportUsage(record: UsageRecord): Promise<ReportResult> {
      if (!record.stripeCustomerId) {
        throw new Error(
          `Cannot meter usage for org ${record.orgId}: no Stripe customer id.`,
        );
      }
      const stripe = await getStripeClient();
      const withinWindow
        = record.occurredAt != null
          && Date.now() - record.occurredAt.getTime() < METER_TIMESTAMP_MAX_AGE_MS;

      const event = await stripe.billing.meterEvents.create(
        {
          event_name: METER_EVENT_NAME,
          payload: {
            stripe_customer_id: record.stripeCustomerId,
            value: '1',
          },
          identifier: record.eventId,
          ...(withinWindow
            ? { timestamp: Math.floor(record.occurredAt!.getTime() / 1000) }
            : {}),
        },
        { idempotencyKey: `msi-meter-${record.eventId}` },
      );

      return { providerRecordId: event.identifier };
    },
  };
}

// The meter's event `name` in Polar (Usage Billing → Meters). Kept as its own
// env var rather than reusing the Stripe one so the two catalogs can be named
// independently, though the default matches.
const POLAR_METER_EVENT_NAME
  = process.env.POLAR_MSI_METER_EVENT_NAME
    || process.env.STRIPE_MSI_METER_EVENT_NAME
    || 'nativpost_managed_post';

/**
 * Polar metered-billing provider. Reports one usage unit per managed post via
 * the Events Ingestion API.
 *
 * Two differences from the Stripe provider, both in NativPost's favour:
 *
 *  - No customer-id resolution. Polar keys events on `external_customer_id`,
 *    and NativPost passes the Clerk orgId as that on every checkout, so any
 *    org can be metered immediately — there is no "skipped, no customer id"
 *    class of event on this rail.
 *
 *  - Idempotency is `external_id`, which Polar dedups on ingest. We send the
 *    billable-event row id, so a retried or replayed tick is counted once and
 *    reported back in the response's `duplicates` count rather than
 *    double-billing.
 *
 * Note Polar attributes usage to a billing period by RECEIPT time, not by the
 * event timestamp: a late reporter run bills into the current period instead
 * of reopening a closed invoice. The timestamp is still sent for accurate
 * usage reporting to the customer.
 */
export function createPolarBillingService(): BillingService {
  return {
    id: 'polar',
    enabled: true,
    canReport(): boolean {
      // orgId is the external customer id — always present on a usage record.
      return true;
    },
    async reportUsage(record: UsageRecord): Promise<ReportResult> {
      const { getPolarClient } = await import('@/lib/billing/polar-client');
      const polar = await getPolarClient();

      await polar.events.ingest({
        events: [
          {
            name: POLAR_METER_EVENT_NAME,
            externalCustomerId: record.orgId,
            externalId: record.eventId,
            ...(record.occurredAt ? { timestamp: record.occurredAt } : {}),
            metadata: {
              billing_period: record.billingPeriod,
              units: 1,
            },
          },
        ],
      });

      // Polar's ingest response returns counts, not per-event ids, so the
      // external_id we sent IS the reconciliation anchor.
      return { providerRecordId: record.eventId };
    },
  };
}

/** True when metered billing is switched on via env flag. */
export function isMeteredBillingEnabled(
  flag: string | undefined = process.env.MSI_METERED_BILLING_ENABLED,
): boolean {
  return flag === 'true' || flag === '1';
}

/**
 * Resolve the active metered provider: the kill-switch decides whether
 * anything is reported at all, BILLING_PROVIDER decides where to.
 */
export function getBillingService(): BillingService {
  if (!isMeteredBillingEnabled()) {
    return noopBillingService;
  }
  return getActiveBillingProvider() === 'polar'
    ? createPolarBillingService()
    : createStripeBillingService();
}
