// Job workflow state machine (docs §7). This module is the source of truth for
// the `msi_job.state` column and the `msi_job.job_type` values.
//
// The QA pipeline (docs §7.3) is expressed as internal review sub-states:
//   in_progress → peer_review → qa → completed
// with rejections at either gate looping back to in_progress. Note the
// *customer* review is part of the account lifecycle (docs §5), not the job.

import type { Guard } from './state-machine';
import { createMachine } from './state-machine';

export const JOB_STATES = [
  'queued',
  'assigned',
  'in_progress',
  'blocked',
  'peer_review',
  'qa',
  'completed',
  'failed',
  'cancelled',
] as const;

export type JobState = (typeof JOB_STATES)[number];

/** Every operation is modelled as one of these job types (docs §7.1). */
export const JOB_TYPES = [
  'create_account',
  'update_profile',
  'replace_avatar',
  'update_bio',
  'prepare_first_posts',
  'publish_post',
  'pause_account',
  'resume_account',
  'transfer_ownership',
  'recover_account',
  'appeal_restriction',
  'archive_account',
] as const;

export type JobType = (typeof JOB_TYPES)[number];

/** Guard inputs for job transitions. All optional; missing = falsy/zero. */
export type JobTransitionContext = {
  hasOperator?: boolean;
  hasDevice?: boolean;
  evidenceAttached?: boolean;
  reviewerApproved?: boolean;
  qaApproved?: boolean;
  attempts?: number;
  maxAttempts?: number;
};

const requireAssignment: Guard<JobTransitionContext> = (ctx) => {
  if (!ctx.hasOperator) {
    return 'no operator assigned';
  }
  if (!ctx.hasDevice) {
    return 'no device assigned';
  }
  return true;
};

const requireEvidence: Guard<JobTransitionContext> = ctx =>
  ctx.evidenceAttached ? true : 'task evidence has not been attached';

const requireReviewer: Guard<JobTransitionContext> = ctx =>
  ctx.reviewerApproved ? true : 'peer reviewer has not approved';

const requireQa: Guard<JobTransitionContext> = ctx =>
  ctx.qaApproved ? true : 'QA has not approved';

const canRetry: Guard<JobTransitionContext> = ctx =>
  (ctx.attempts ?? 0) < (ctx.maxAttempts ?? 3)
    ? true
    : 'retry limit reached';

export const jobWorkflow = createMachine<JobState, JobTransitionContext>({
  states: JOB_STATES,
  initial: 'queued',
  terminal: ['completed', 'cancelled'],
  transitions: {
    queued: { assigned: requireAssignment, cancelled: true },
    // assigned → queued = unassign (operator/device released back to the pool).
    assigned: { in_progress: true, queued: true, cancelled: true },
    in_progress: {
      blocked: true,
      peer_review: requireEvidence,
      failed: true,
      cancelled: true,
    },
    blocked: { in_progress: true, cancelled: true },
    // peer_review → in_progress = reviewer requested changes.
    peer_review: { qa: requireReviewer, in_progress: true, cancelled: true },
    // qa → in_progress = QA rejected.
    qa: { completed: requireQa, in_progress: true, cancelled: true },
    // failed → queued = retry (guarded by attempt count).
    failed: { queued: canRetry, cancelled: true },
    completed: {},
    cancelled: {},
  },
});

export function transitionJob(
  from: JobState,
  to: JobState,
  ctx: JobTransitionContext = {},
): JobState {
  return jobWorkflow.transition(from, to, ctx);
}

export const canTransitionJob = (from: JobState, to: JobState): boolean =>
  jobWorkflow.can(from, to);

export const isJobTerminal = (state: JobState): boolean =>
  jobWorkflow.isTerminal(state);
