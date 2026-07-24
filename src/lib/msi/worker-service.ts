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

import type { JobState } from './job-workflow';
import type { WorkerJob } from './worker';
import { deriveWorkerMutations, planWorkerTick } from './worker';

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
    managedAccountId: j.managedAccountId,
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

  // The mutation set is pure + validated (see deriveWorkerMutations); this
  // block is a thin executor.
  const mutations = deriveWorkerMutations(plan, jobs);

  if (mutations.reservationsToExpire.length > 0) {
    await db
      .update(msiCapacityReservationSchema)
      .set({ status: 'expired' })
      .where(
        inArray(msiCapacityReservationSchema.id, mutations.reservationsToExpire),
      );
  }

  if (mutations.reviewsToClose.length > 0) {
    await db
      .update(msiAccountReviewSchema)
      .set({ status: 'expired' })
      .where(inArray(msiAccountReviewSchema.id, mutations.reviewsToClose));
  }

  for (const retry of mutations.jobRetries) {
    await db
      .update(msiJobSchema)
      .set({ state: 'queued', attempts: retry.attempts, failureReason: null })
      .where(eq(msiJobSchema.id, retry.id));
  }

  for (const event of mutations.slaBreachEvents) {
    await db.insert(msiActivityLogSchema).values(event);
  }

  return plan;
}
