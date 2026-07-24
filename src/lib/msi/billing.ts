// Metered billing foundation (docs §6). Pure logic only — no db/Env imports, so
// it stays unit-testable. The publishing pipeline records one immutable
// `billable_publish_event` per successful publish; a separate reporter (behind
// a feature flag) later ships un-reported events to the billing provider. This
// split means metered billing can be switched on later WITHOUT changing the
// publish pipeline.

export type PublishEventInput = {
  orgId: string;
  managedAccountId: string;
  jobId: string;
  contentItemId: string | null;
  platform: string;
  occurredAt: Date;
};

export type PublishEventRow = PublishEventInput & { billingPeriod: string };

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
};

export type BillingService = {
  readonly enabled: boolean;
  /** Report one usage unit to the provider. No-op when disabled. */
  reportUsage: (record: UsageRecord) => Promise<void>;
};

/** Disabled provider — the default until metered billing is turned on. */
export const noopBillingService: BillingService = {
  enabled: false,
  async reportUsage() {
    // Intentionally does nothing — events accumulate un-reported until a real
    // provider is wired and the flag is enabled.
  },
};

/**
 * Stripe provider STUB. Deliberately not implemented — wiring the real
 * `stripe.billing.meterEvents.create` (or subscription usage record) call is
 * the final step, done only after PlatformClients make publishes trustworthy.
 * Guarded so an accidental enable fails loudly rather than silently no-op'ing.
 */
export function createStripeBillingService(): BillingService {
  return {
    enabled: true,
    async reportUsage() {
      throw new Error(
        'StripeBillingService not implemented — enable only after wiring the '
        + 'real Stripe usage-record call.',
      );
    },
  };
}

/** True when metered billing is switched on via env flag. */
export function isMeteredBillingEnabled(
  flag: string | undefined = process.env.MSI_METERED_BILLING_ENABLED,
): boolean {
  return flag === 'true' || flag === '1';
}

/** Resolve the active provider from the feature flag. */
export function getBillingService(): BillingService {
  return isMeteredBillingEnabled()
    ? createStripeBillingService()
    : noopBillingService;
}
