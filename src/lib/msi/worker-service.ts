// Provisioning worker runner (docs §14). Loads the time-based work, computes
// the plan with the (tested, pure) planWorkerTick, and applies it to the DB.
// SAFE / non-provisioning: it only advances internal bookkeeping — expiring
// reservations, closing review windows, requeuing failed jobs, and recording
// SLA-breach escalations. It performs NO account operations against platforms.

import { eq, inArray, notInArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  msiAccountReviewSchema,
  msiActivityLogSchema,
  msiCapacityReservationSchema,
  msiJobSchema,
} from '@/models/Schema';

import { buildActivityEvent } from './audit';
import type { JobState } from './job-workflow';
import { transitionJob } from './job-workflow';
import type { WorkerJob } from './worker';
import { planWorkerTick } from './worker';

const TERMINAL_JOB_STATES = ['completed', 'cancelled'];

export async function runWorkerTick(now: Date = new Date()) {
  const [jobRows, reviewRows, reservationRows] = await Promise.all([
    db
      .select()
      .from(msiJobSchema)
      .where(notInArray(msiJobSchema.state, TERMINAL_JOB_STATES)),
    db
      .select()
      .from(msiAccountReviewSchema)
      .where(eq(msiAccountReviewSchema.status, 'pending')),
    db
      .select()
      .from(msiCapacityReservationSchema)
      .where(eq(msiCapacityReservationSchema.status, 'held')),
  ]);

  const jobs: WorkerJob[] = jobRows.map(j => ({
    id: j.id,
    state: j.state as JobState,
    attempts: j.attempts,
    maxAttempts: j.maxAttempts,
    slaDueAt: j.slaDueAt,
  }));

  const plan = planWorkerTick({
    jobs,
    reviews: reviewRows.map(r => ({
      id: r.id,
      status: r.status,
      windowClosesAt: r.windowClosesAt,
    })),
    reservations: reservationRows.map(r => ({
      id: r.id,
      status: r.status,
      expiresAt: r.expiresAt,
    })),
    now,
  });

  if (plan.reservationsToExpire.length > 0) {
    await db
      .update(msiCapacityReservationSchema)
      .set({ status: 'expired' })
      .where(inArray(msiCapacityReservationSchema.id, plan.reservationsToExpire));
  }

  if (plan.reviewsToClose.length > 0) {
    await db
      .update(msiAccountReviewSchema)
      .set({ status: 'expired' })
      .where(inArray(msiAccountReviewSchema.id, plan.reviewsToClose));
  }

  const rowById = new Map(jobRows.map(j => [j.id, j]));
  for (const id of plan.jobsToRetry) {
    const row = rowById.get(id);
    if (!row) {
      continue;
    }
    // Validate the transition against the state machine before persisting.
    transitionJob('failed', 'queued', {
      attempts: row.attempts,
      maxAttempts: row.maxAttempts,
    });
    await db
      .update(msiJobSchema)
      .set({ state: 'queued', attempts: row.attempts + 1, failureReason: null })
      .where(eq(msiJobSchema.id, id));
  }

  for (const id of plan.slaBreaches) {
    const row = rowById.get(id);
    await db.insert(msiActivityLogSchema).values(
      buildActivityEvent({
        managedAccountId: row?.managedAccountId ?? null,
        jobId: id,
        actorType: 'system',
        action: 'sla_breach',
        detail: { slaDueAt: row?.slaDueAt ?? null },
      }),
    );
  }

  return plan;
}
