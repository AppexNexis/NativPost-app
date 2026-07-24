// Billing DB service (docs §6). Records one immutable billable-publish event
// when a publish_post job completes. Idempotent: the unique index on job_id +
// onConflictDoNothing means re-emitting for the same job is a safe no-op, so a
// double-fire (retry, replay) never double-charges. Only the terminal success
// path calls this — failed/retried publishes never reach it.

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  managedAccountSchema,
  msiBillablePublishEventSchema,
  msiJobSchema,
} from '@/models/Schema';

import { buildPublishEvent } from './billing';

/**
 * Emit a billable event for a completed publish_post job. Looks up the job's
 * org/platform/content ref, then inserts idempotently. Returns whether a new
 * event was recorded. Best-effort by contract: callers wrap in try/catch so a
 * billing hiccup never blocks the publish lifecycle.
 */
export async function recordPublishEvent(
  jobId: string,
  occurredAt: Date = new Date(),
): Promise<{ recorded: boolean }> {
  const [row] = await db
    .select({
      jobId: msiJobSchema.id,
      jobType: msiJobSchema.jobType,
      managedAccountId: msiJobSchema.managedAccountId,
      contentItemId: msiJobSchema.contentItemId,
      orgId: managedAccountSchema.orgId,
      platform: managedAccountSchema.platform,
    })
    .from(msiJobSchema)
    .innerJoin(
      managedAccountSchema,
      eq(msiJobSchema.managedAccountId, managedAccountSchema.id),
    )
    .where(eq(msiJobSchema.id, jobId))
    .limit(1);

  // Only publish jobs are billable; provisioning/setup jobs are not.
  if (!row || row.jobType !== 'publish_post') {
    return { recorded: false };
  }

  const event = buildPublishEvent({
    orgId: row.orgId,
    managedAccountId: row.managedAccountId,
    jobId: row.jobId,
    contentItemId: row.contentItemId ?? null,
    platform: row.platform,
    occurredAt,
  });

  const inserted = await db
    .insert(msiBillablePublishEventSchema)
    .values(event)
    .onConflictDoNothing({ target: msiBillablePublishEventSchema.jobId })
    .returning({ id: msiBillablePublishEventSchema.id });

  return { recorded: inserted.length > 0 };
}
