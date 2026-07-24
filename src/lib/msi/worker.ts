// Provisioning worker — the pure PLANNING tick (docs §14, §7). Given the
// current state of jobs, review windows, and reservations, it decides which
// time-based transitions should fire. It performs NO account operations itself
// (that execution is Phase 0-gated); a thin runner applies this plan to the DB.

import type { JobState } from './job-workflow';
import { isJobTerminal } from './job-workflow';

export type WorkerJob = {
  id: string;
  state: JobState;
  attempts: number;
  maxAttempts: number;
  slaDueAt: Date | null;
};

export type WorkerReview = {
  id: string;
  status: string; // pending | changes_requested | approved | expired
  windowClosesAt: Date;
};

export type WorkerReservation = {
  id: string;
  status: string; // held | consumed | released | expired
  expiresAt: Date;
};

export type WorkerPlan = {
  /** Held reservations past their TTL → mark expired. */
  reservationsToExpire: string[];
  /** Pending review windows past close → the change window closes. */
  reviewsToClose: string[];
  /** Failed jobs still under the retry limit → requeue. */
  jobsToRetry: string[];
  /** Non-terminal jobs past their SLA → escalate (docs §8.4). */
  slaBreaches: string[];
};

export function planWorkerTick(input: {
  jobs: WorkerJob[];
  reviews: WorkerReview[];
  reservations: WorkerReservation[];
  now?: Date;
}): WorkerPlan {
  const t = (input.now ?? new Date()).getTime();

  return {
    reservationsToExpire: input.reservations
      .filter(r => r.status === 'held' && r.expiresAt.getTime() <= t)
      .map(r => r.id),

    reviewsToClose: input.reviews
      .filter(r => r.status === 'pending' && r.windowClosesAt.getTime() <= t)
      .map(r => r.id),

    jobsToRetry: input.jobs
      .filter(j => j.state === 'failed' && j.attempts < j.maxAttempts)
      .map(j => j.id),

    slaBreaches: input.jobs
      .filter(
        j =>
          !isJobTerminal(j.state) &&
          j.slaDueAt !== null &&
          j.slaDueAt.getTime() < t,
      )
      .map(j => j.id),
  };
}
