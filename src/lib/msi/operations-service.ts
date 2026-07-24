// Operator / QA actions on jobs (docs §7, §8). Makes the Ops job board
// actionable: an operator completes a task → when the last task is done the job
// submits for review (in_progress → peer_review). Composes the tested pure
// helpers + the validated job state machine.

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  managedAccountSchema,
  msiAccountReviewSchema,
  msiActivityLogSchema,
  msiJobSchema,
  msiTaskSchema,
} from '@/models/Schema';

import { buildActivityEvent } from './audit';
import { recordPublishEvent } from './billing-service';
import { transitionJob } from './job-workflow';
import type { AccountState } from './lifecycle';
import { advanceAccountThrough, pathToCustomerReview } from './lifecycle-coordination';
import { notifyManagedAccount } from './notify';
import { allTasksDoneAfter } from './provisioning-jobs';

const REVIEW_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export async function completeTask(
  jobId: string,
  taskId: string,
  operatorUserId: string,
) {
  const [job] = await db
    .select({
      id: msiJobSchema.id,
      state: msiJobSchema.state,
      managedAccountId: msiJobSchema.managedAccountId,
    })
    .from(msiJobSchema)
    .where(eq(msiJobSchema.id, jobId))
    .limit(1);
  if (!job) {
    throw new Error('Job not found');
  }

  const tasks = await db
    .select({ id: msiTaskSchema.id, status: msiTaskSchema.status })
    .from(msiTaskSchema)
    .where(eq(msiTaskSchema.jobId, jobId));
  const task = tasks.find(t => t.id === taskId);
  if (!task) {
    throw new Error('Task not found on this job');
  }

  const now = new Date();
  await db
    .update(msiTaskSchema)
    .set({
      status: 'done',
      completedByRole: 'operator',
      completedByUserId: operatorUserId,
      completedAt: now,
    })
    .where(eq(msiTaskSchema.id, taskId));

  const allDone = allTasksDoneAfter(tasks, taskId);
  if (allDone && job.state === 'in_progress') {
    // All work done → submit for peer review.
    transitionJob('in_progress', 'peer_review', { evidenceAttached: true });
    await db
      .update(msiJobSchema)
      .set({ state: 'peer_review', completedAt: now })
      .where(eq(msiJobSchema.id, jobId));
    await db.insert(msiActivityLogSchema).values(
      buildActivityEvent({
        managedAccountId: job.managedAccountId,
        jobId,
        actorType: 'operator',
        actorId: operatorUserId,
        action: 'work_submitted',
      }),
    );
  }

  return { taskId, allDone };
}

/**
 * Reviewer/QA action on a job in review. `approve` advances the current gate
 * (peer_review → qa → completed); `reject` sends it back to in_progress. When a
 * provisioning (create_account) job completes, the account is opened for
 * customer review.
 */
export async function reviewJob(
  jobId: string,
  action: 'approve' | 'reject',
  reviewerUserId: string,
) {
  const [job] = await db
    .select({
      id: msiJobSchema.id,
      state: msiJobSchema.state,
      jobType: msiJobSchema.jobType,
      managedAccountId: msiJobSchema.managedAccountId,
    })
    .from(msiJobSchema)
    .where(eq(msiJobSchema.id, jobId))
    .limit(1);
  if (!job) {
    throw new Error('Job not found');
  }

  const now = new Date();
  const audit = (actionName: string) =>
    db.insert(msiActivityLogSchema).values(
      buildActivityEvent({
        managedAccountId: job.managedAccountId,
        jobId,
        actorType: 'system',
        actorId: reviewerUserId,
        action: actionName,
      }),
    );

  if (action === 'reject') {
    if (job.state !== 'peer_review' && job.state !== 'qa') {
      throw new Error('Job is not awaiting review');
    }
    transitionJob(job.state, 'in_progress');
    await db.update(msiJobSchema).set({ state: 'in_progress' }).where(eq(msiJobSchema.id, jobId));
    await audit('review_rejected');
    return { state: 'in_progress' as const };
  }

  if (job.state === 'peer_review') {
    transitionJob('peer_review', 'qa', { reviewerApproved: true });
    await db.update(msiJobSchema).set({ state: 'qa' }).where(eq(msiJobSchema.id, jobId));
    await audit('peer_review_passed');
    return { state: 'qa' as const };
  }

  if (job.state === 'qa') {
    transitionJob('qa', 'completed', { qaApproved: true });
    await db
      .update(msiJobSchema)
      .set({ state: 'completed', completedAt: now })
      .where(eq(msiJobSchema.id, jobId));
    await audit('qa_passed');
    if (job.jobType === 'create_account') {
      await openCustomerReview(job.managedAccountId);
    }
    if (job.jobType === 'publish_post') {
      // Emit the billable event on the terminal success path only. Best-effort:
      // a billing hiccup must never fail the publish. Idempotent (unique jobId).
      try {
        await recordPublishEvent(jobId, now);
      } catch (billingErr) {
        console.error('[MSI] recordPublishEvent failed:', billingErr);
      }
    }
    return { state: 'completed' as const };
  }

  throw new Error('Job is not awaiting review');
}

/** A provisioning job cleared QA → advance the account to customer_review. */
async function openCustomerReview(managedAccountId: string) {
  const [account] = await db
    .select({
      id: managedAccountSchema.id,
      orgId: managedAccountSchema.orgId,
      displayName: managedAccountSchema.displayName,
      handlePreferences: managedAccountSchema.handlePreferences,
      lifecycleState: managedAccountSchema.lifecycleState,
    })
    .from(managedAccountSchema)
    .where(eq(managedAccountSchema.id, managedAccountId))
    .limit(1);
  if (!account) {
    return;
  }

  const path = pathToCustomerReview(account.lifecycleState);
  if (path.length === 0) {
    return;
  }

  const finalState = advanceAccountThrough(
    account.lifecycleState as AccountState,
    path,
    { allTasksComplete: true, qaPassed: true },
  );
  const now = new Date();

  await db
    .update(managedAccountSchema)
    .set({ lifecycleState: finalState })
    .where(eq(managedAccountSchema.id, managedAccountId));
  await db.insert(msiAccountReviewSchema).values({
    managedAccountId,
    windowOpensAt: now,
    windowClosesAt: new Date(now.getTime() + REVIEW_WINDOW_MS),
    status: 'pending',
  });
  await db.insert(msiActivityLogSchema).values(
    buildActivityEvent({
      managedAccountId,
      actorType: 'system',
      action: 'review_started',
    }),
  );
  await notifyManagedAccount({
    orgId: account.orgId,
    event: 'review_ready',
    accountId: managedAccountId,
    handle: account.displayName || account.handlePreferences?.[0] || 'Your account',
  });
}
