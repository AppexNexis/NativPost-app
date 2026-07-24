// Provisioning worker — the pure PLANNING tick (docs §14, §7). Given the
// current state of jobs, review windows, and reservations, it decides which
// time-based transitions should fire. It performs NO account operations itself
// (that execution is Phase 0-gated); a thin runner applies this plan to the DB.

import type { ActivityEvent } from './audit';
import { buildActivityEvent } from './audit';
import type { JobState } from './job-workflow';
import { isJobTerminal, transitionJob } from './job-workflow';

export type WorkerJob = {
  id: string;
  state: JobState;
  attempts: number;
  maxAttempts: number;
  slaDueAt: Date | null;
  /** Needed to attribute an SLA-breach event; optional for planning. */
  managedAccountId?: string | null;
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

export type JobRetry = { id: string; attempts: number };

export type WorkerMutations = {
  reservationsToExpire: string[];
  reviewsToClose: string[];
  jobRetries: JobRetry[];
  slaBreachEvents: ActivityEvent[];
};

/**
 * Enrich a WorkerPlan into concrete, ready-to-apply mutations: each retry
 * carries its incremented attempt count (validated against the job state
 * machine), and each SLA breach becomes a built activity event. Pure — the DB
 * runner just executes the result. Unknown ids (job not in `jobs`) are skipped
 * for retries and get a null-account event for breaches.
 */
export function deriveWorkerMutations(
  plan: WorkerPlan,
  jobs: WorkerJob[],
): WorkerMutations {
  const byId = new Map(jobs.map(j => [j.id, j]));

  const jobRetries: JobRetry[] = [];
  for (const id of plan.jobsToRetry) {
    const job = byId.get(id);
    if (!job) {
      continue;
    }
    // Defensive: assert the retry is legal (the plan already guarantees this).
    transitionJob('failed', 'queued', {
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
    });
    jobRetries.push({ id, attempts: job.attempts + 1 });
  }

  const slaBreachEvents: ActivityEvent[] = plan.slaBreaches.map((id) => {
    const job = byId.get(id);
    return buildActivityEvent({
      managedAccountId: job?.managedAccountId ?? null,
      jobId: id,
      actorType: 'system',
      action: 'sla_breach',
      detail: { slaDueAt: job?.slaDueAt ?? null },
    });
  });

  return {
    reservationsToExpire: plan.reservationsToExpire,
    reviewsToClose: plan.reviewsToClose,
    jobRetries,
    slaBreachEvents,
  };
}
