// Billing usage reporter (docs §6). The buildable half of metered billing:
// reads immutable events that haven't been reported yet and ships them to the
// billing provider, stamping reported_at + the provider's record id. Decoupled
// from the publish pipeline — enabling billing is: implement the Stripe call in
// createStripeBillingService, flip MSI_METERED_BILLING_ENABLED, run this tick.
//
// When the flag is OFF the provider is the no-op (enabled=false) and this tick
// is a deliberate skip — events stay un-reported until a real provider exists,
// so nothing is ever marked reported without actually being reported.

import { eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { msiBillablePublishEventSchema } from '@/models/Schema';

import { getBillingService } from './billing';

const DEFAULT_BATCH = 500;

export async function runBillingReportTick(
  limit: number = DEFAULT_BATCH,
): Promise<{ reported: number; skipped: boolean }> {
  const service = getBillingService();
  if (!service.enabled) {
    // Billing disabled — do not stamp anything. Events accumulate for later.
    return { reported: 0, skipped: true };
  }

  const pending = await db
    .select({
      id: msiBillablePublishEventSchema.id,
      orgId: msiBillablePublishEventSchema.orgId,
      billingPeriod: msiBillablePublishEventSchema.billingPeriod,
    })
    .from(msiBillablePublishEventSchema)
    .where(isNull(msiBillablePublishEventSchema.reportedAt))
    .limit(limit);

  let reported = 0;
  for (const event of pending) {
    // Report one unit. A provider error propagates and fails the tick (loud) —
    // the event stays un-reported (reported_at null) and is retried next tick.
    const { providerRecordId } = await service.reportUsage({
      orgId: event.orgId,
      billingPeriod: event.billingPeriod,
      eventId: event.id,
    });
    await db
      .update(msiBillablePublishEventSchema)
      .set({ reportedAt: new Date(), stripeUsageRecordId: providerRecordId })
      .where(eq(msiBillablePublishEventSchema.id, event.id));
    reported += 1;
  }

  return { reported, skipped: false };
}
