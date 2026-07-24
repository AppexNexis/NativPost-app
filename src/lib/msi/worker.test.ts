import { describe, expect, it } from 'vitest';

import { planWorkerTick, type WorkerJob } from './worker';

const now = new Date('2026-07-23T12:00:00Z');
const past = new Date(now.getTime() - 60_000);
const future = new Date(now.getTime() + 60_000);

describe('planWorkerTick', () => {
  it('expires only held reservations past their TTL', () => {
    const plan = planWorkerTick({
      jobs: [],
      reviews: [],
      reservations: [
        { id: 'r-expire', status: 'held', expiresAt: past },
        { id: 'r-live', status: 'held', expiresAt: future },
        { id: 'r-consumed', status: 'consumed', expiresAt: past },
      ],
      now,
    });
    expect(plan.reservationsToExpire).toEqual(['r-expire']);
  });

  it('closes only pending review windows past close', () => {
    const plan = planWorkerTick({
      jobs: [],
      reviews: [
        { id: 'rev-close', status: 'pending', windowClosesAt: past },
        { id: 'rev-open', status: 'pending', windowClosesAt: future },
        { id: 'rev-approved', status: 'approved', windowClosesAt: past },
      ],
      reservations: [],
      now,
    });
    expect(plan.reviewsToClose).toEqual(['rev-close']);
  });

  it('retries failed jobs only while under the attempt limit', () => {
    const jobs: WorkerJob[] = [
      { id: 'j-retry', state: 'failed', attempts: 1, maxAttempts: 3, slaDueAt: null },
      { id: 'j-exhausted', state: 'failed', attempts: 3, maxAttempts: 3, slaDueAt: null },
      { id: 'j-ok', state: 'in_progress', attempts: 0, maxAttempts: 3, slaDueAt: null },
    ];
    const plan = planWorkerTick({ jobs, reviews: [], reservations: [], now });
    expect(plan.jobsToRetry).toEqual(['j-retry']);
  });

  it('flags SLA breaches for non-terminal jobs only', () => {
    const jobs: WorkerJob[] = [
      { id: 'j-breach', state: 'in_progress', attempts: 0, maxAttempts: 3, slaDueAt: past },
      { id: 'j-on-time', state: 'in_progress', attempts: 0, maxAttempts: 3, slaDueAt: future },
      { id: 'j-done-late', state: 'completed', attempts: 0, maxAttempts: 3, slaDueAt: past },
      { id: 'j-no-sla', state: 'queued', attempts: 0, maxAttempts: 3, slaDueAt: null },
    ];
    const plan = planWorkerTick({ jobs, reviews: [], reservations: [], now });
    expect(plan.slaBreaches).toEqual(['j-breach']);
  });

  it('produces an empty plan when nothing is due', () => {
    const plan = planWorkerTick({
      jobs: [{ id: 'j', state: 'in_progress', attempts: 0, maxAttempts: 3, slaDueAt: future }],
      reviews: [{ id: 'rev', status: 'pending', windowClosesAt: future }],
      reservations: [{ id: 'r', status: 'held', expiresAt: future }],
      now,
    });
    expect(plan).toEqual({
      reservationsToExpire: [],
      reviewsToClose: [],
      jobsToRetry: [],
      slaBreaches: [],
    });
  });
});
