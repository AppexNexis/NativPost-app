// Provisioning worker runner (docs §14, §3.3). Two responsibilities per tick:
//   1. Time-based bookkeeping — expire reservations, close review windows,
//      requeue failed jobs, record SLA breaches (pure plan; see planWorkerTick).
//   2. Execution orchestration — start assigned jobs through the Execution
//      Layer adapter (Job → strategy → adapter → execute → apply). The adapter
//      abstraction keeps this uniform across strategies; `manual` defers to an
//      in-country operator (pending_operator), so nothing is auto-operated on a
//      platform unless a configured API/delegated adapter says so.

import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  managedAccountSchema,
  msiAccountReviewSchema,
  msiActivityLogSchema,
  msiCapacityReservationSchema,
  msiDeviceAssignmentSchema,
  msiDeviceSchema,
  msiJobSchema,
  msiOperatorSchema,
  msiTaskSchema,
} from '@/models/Schema';

import type { DeviceSlot, OperatorSlot } from './allocation';
import { planAllocations } from './allocation';
import { buildActivityEvent } from './audit';
import type { ExecutionAdapter } from './execution';
import { AdapterNotConfiguredError, getExecutionAdapter } from './execution';
import type { JobState } from './job-workflow';
import { transitionJob } from './job-workflow';
import type { OrchestrationAccount } from './orchestration';
import { planJobOrchestration, resolveStartOutcome, selectJobsToStart } from './orchestration';
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

  // Accounts for every in-flight job (country/platform/strategy) — shared by
  // allocation and execution orchestration below.
  const jobAccountIds = [...new Set(jobRows.map(j => j.managedAccountId))];
  const accountRows = jobAccountIds.length > 0
    ? await db
        .select({
          id: managedAccountSchema.id,
          country: managedAccountSchema.country,
          platform: managedAccountSchema.platform,
          executionStrategy: managedAccountSchema.executionStrategy,
        })
        .from(managedAccountSchema)
        .where(inArray(managedAccountSchema.id, jobAccountIds))
    : [];
  const accountById = new Map(accountRows.map(a => [a.id, a]));

  // --- Allocation: assign an operator + device to queued jobs (queued → assigned) ---
  const assignedThisTick = new Set<string>();
  const queuedJobs = jobRows.filter(j => j.state === 'queued');
  if (queuedJobs.length > 0) {
    const jobsWithCountry = queuedJobs
      .map(j => ({
        id: j.id,
        managedAccountId: j.managedAccountId,
        country: accountById.get(j.managedAccountId)?.country,
      }))
      .filter(
        (j): j is { id: string; managedAccountId: string; country: string } =>
          Boolean(j.country),
      );
    const countries = [...new Set(jobsWithCountry.map(j => j.country))];

    if (countries.length > 0) {
      const [operators, devices] = await Promise.all([
        db
          .select({
            id: msiOperatorSchema.id,
            country: msiOperatorSchema.country,
            role: msiOperatorSchema.role,
            status: msiOperatorSchema.status,
            capacity: msiOperatorSchema.capacity,
            activeLoad: msiOperatorSchema.activeLoad,
          })
          .from(msiOperatorSchema)
          .where(and(inArray(msiOperatorSchema.country, countries), eq(msiOperatorSchema.status, 'active'))),
        db
          .select({
            id: msiDeviceSchema.id,
            country: msiDeviceSchema.country,
            status: msiDeviceSchema.status,
            capacity: msiDeviceSchema.capacity,
          })
          .from(msiDeviceSchema)
          .where(and(inArray(msiDeviceSchema.country, countries), eq(msiDeviceSchema.status, 'active'))),
      ]);

      const deviceIds = devices.map(d => d.id);
      const activeAssignments = deviceIds.length > 0
        ? await db
            .select({
              deviceId: msiDeviceAssignmentSchema.deviceId,
              managedAccountId: msiDeviceAssignmentSchema.managedAccountId,
            })
            .from(msiDeviceAssignmentSchema)
            .where(and(inArray(msiDeviceAssignmentSchema.deviceId, deviceIds), isNull(msiDeviceAssignmentSchema.releasedAt)))
        : [];
      const loadByDevice = new Map<string, number>();
      const existingDeviceByAccount = new Map<string, string>();
      for (const a of activeAssignments) {
        loadByDevice.set(a.deviceId, (loadByDevice.get(a.deviceId) ?? 0) + 1);
        existingDeviceByAccount.set(a.managedAccountId, a.deviceId);
      }

      const operatorSlots: OperatorSlot[] = operators.map(o => ({
        id: o.id,
        country: o.country,
        role: o.role,
        status: o.status,
        capacity: o.capacity,
        activeLoad: o.activeLoad,
      }));
      const deviceSlots: DeviceSlot[] = devices.map(d => ({
        id: d.id,
        country: d.country,
        status: d.status,
        capacity: d.capacity,
        assignedCount: loadByDevice.get(d.id) ?? 0,
      }));

      const accountByJob = new Map(jobsWithCountry.map(j => [j.id, j.managedAccountId]));
      const plans = planAllocations(
        jobsWithCountry.map(j => ({
          id: j.id,
          country: j.country,
          managedAccountId: j.managedAccountId,
        })),
        operatorSlots,
        deviceSlots,
        existingDeviceByAccount,
      );

      for (const plan of plans) {
        const managedAccountId = accountByJob.get(plan.jobId)!;
        transitionJob('queued', 'assigned', { hasOperator: true, hasDevice: true });
        await db
          .update(msiJobSchema)
          .set({ state: 'assigned', assignedOperatorId: plan.operatorId, assignedDeviceId: plan.deviceId })
          .where(eq(msiJobSchema.id, plan.jobId));
        await db
          .update(msiOperatorSchema)
          .set({ activeLoad: sql`${msiOperatorSchema.activeLoad} + 1` })
          .where(eq(msiOperatorSchema.id, plan.operatorId));
        // Only link the account to a device the first time (1:1); later jobs
        // reuse the account's existing device.
        if (plan.isNewDeviceAssignment) {
          await db
            .insert(msiDeviceAssignmentSchema)
            .values({ deviceId: plan.deviceId, managedAccountId });
        }
        await db.insert(msiActivityLogSchema).values(
          buildActivityEvent({
            managedAccountId,
            jobId: plan.jobId,
            actorType: 'system',
            action: 'operator_assigned',
            detail: { operatorId: plan.operatorId, deviceId: plan.deviceId },
          }),
        );
        assignedThisTick.add(plan.jobId);
      }
    }
  }

  // --- Execution orchestration: start assigned jobs through the adapter ---
  const orchestrationJobs = jobRows.map(j => ({
    id: j.id,
    managedAccountId: j.managedAccountId,
    jobType: j.jobType,
    state: assignedThisTick.has(j.id) ? 'assigned' : j.state,
    startedAt: j.startedAt,
    contentItemId: j.contentItemId,
  }));
  const toStart = selectJobsToStart(orchestrationJobs);

  if (toStart.length > 0) {
    const accountsById = new Map<string, OrchestrationAccount>(
      accountRows.map(a => [
        a.id,
        { platform: a.platform, country: a.country, executionStrategy: a.executionStrategy },
      ]),
    );

    const intents = planJobOrchestration(orchestrationJobs, accountsById);
    for (const intent of intents) {
      // Fail closed: an unconfigured strategy is skipped (not operated), to be
      // picked up once its adapter is configured.
      let adapter: ExecutionAdapter | null = null;
      try {
        adapter = getExecutionAdapter(intent.ctx.strategy);
      } catch (err) {
        if (!(err instanceof AdapterNotConfiguredError)) {
          throw err;
        }
      }
      if (!adapter) {
        continue;
      }

      const result = await adapter.execute(intent.operation, intent.ctx);
      const outcome = resolveStartOutcome(intent, result);
      const startedAt = new Date();

      // Start: assigned → in_progress (validated by the state machine).
      transitionJob(intent.jobState as JobState, 'in_progress');
      await db
        .update(msiJobSchema)
        .set({ state: 'in_progress', startedAt })
        .where(eq(msiJobSchema.id, intent.jobId));

      if (outcome.nextState === 'peer_review') {
        transitionJob('in_progress', 'peer_review', { evidenceAttached: true });
        await db
          .update(msiJobSchema)
          .set({ state: 'peer_review', completedAt: startedAt })
          .where(eq(msiJobSchema.id, intent.jobId));
        if (outcome.completeAllTasks) {
          await db
            .update(msiTaskSchema)
            .set({ status: 'done', completedAt: startedAt })
            .where(eq(msiTaskSchema.jobId, intent.jobId));
        }
      } else if (outcome.nextState === 'failed') {
        transitionJob('in_progress', 'failed');
        await db
          .update(msiJobSchema)
          .set({ state: 'failed', failureReason: outcome.failureReason })
          .where(eq(msiJobSchema.id, intent.jobId));
      }

      await db.insert(msiActivityLogSchema).values(
        buildActivityEvent({
          managedAccountId: intent.ctx.managedAccountId,
          jobId: intent.jobId,
          actorType: 'system',
          action: outcome.auditAction,
          detail: outcome.auditDetail,
        }),
      );
    }
  }

  return plan;
}
