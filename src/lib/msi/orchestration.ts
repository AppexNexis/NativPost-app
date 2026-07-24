// Worker orchestration (docs §3.3, §7): advance provisioning jobs through the
// Execution Layer. Pure decision core — Job → strategy → operation → intent,
// and ExecutionResult → resulting job state. The DB runner (worker-service)
// resolves the adapter, calls execute(), and applies these. No db/Env.

import type {
  ExecutionContext,
  ExecutionOperation,
  ExecutionResult,
} from './execution';
import { executionEffect, jobToOperation, resolveStrategy } from './execution';

export type OrchestrationJob = {
  id: string;
  managedAccountId: string;
  jobType: string;
  state: string;
  startedAt: Date | null;
};

export type OrchestrationAccount = {
  platform: string;
  country: string;
  executionStrategy: string | null;
};

/**
 * Jobs ready to have their operation executed this tick: post-allocation
 * (`assigned`), not yet started, and mapping to a real platform operation.
 */
export function selectJobsToStart(
  jobs: OrchestrationJob[],
): OrchestrationJob[] {
  return jobs.filter(
    j =>
      j.state === 'assigned'
      && j.startedAt === null
      && jobToOperation(j.jobType) !== null,
  );
}

export type ExecutionIntent = {
  jobId: string;
  jobState: string;
  operation: ExecutionOperation;
  ctx: ExecutionContext;
};

/** Build execution intents for the startable jobs, resolving each account's
 *  strategy. Skips jobs whose account is missing. */
export function planJobOrchestration(
  jobs: OrchestrationJob[],
  accountsById: Map<string, OrchestrationAccount>,
): ExecutionIntent[] {
  const intents: ExecutionIntent[] = [];
  for (const job of selectJobsToStart(jobs)) {
    const account = accountsById.get(job.managedAccountId);
    if (!account) {
      continue;
    }
    const operation = jobToOperation(job.jobType);
    if (!operation) {
      continue;
    }
    const strategy = resolveStrategy({
      executionStrategy: account.executionStrategy,
      platform: account.platform,
    });
    intents.push({
      jobId: job.id,
      jobState: job.state,
      operation,
      ctx: {
        managedAccountId: job.managedAccountId,
        platform: account.platform,
        country: account.country,
        strategy,
      },
    });
  }
  return intents;
}

export type StartOutcome = {
  jobId: string;
  /** State AFTER the assigned→in_progress start the runner performs first. */
  nextState: 'in_progress' | 'peer_review' | 'failed';
  completeAllTasks: boolean;
  failureReason: string | null;
  auditAction: string;
  auditDetail: Record<string, unknown>;
};

/**
 * Map an execution result to the job's resulting state — uniform across every
 * strategy. `completed` → submit for QA (peer_review) + tasks done; `failed` →
 * failed; `pending_operator` → stays in_progress awaiting the operator.
 */
export function resolveStartOutcome(
  intent: ExecutionIntent,
  result: ExecutionResult,
): StartOutcome {
  const effect = executionEffect(result);

  if (effect.jobFailed) {
    return {
      jobId: intent.jobId,
      nextState: 'failed',
      completeAllTasks: false,
      failureReason: result.detail ?? 'execution failed',
      auditAction: 'execution_failed',
      auditDetail: { operation: intent.operation, detail: result.detail ?? null },
    };
  }

  if (result.outcome === 'completed') {
    return {
      jobId: intent.jobId,
      nextState: 'peer_review',
      completeAllTasks: true,
      failureReason: null,
      auditAction: 'execution_completed',
      auditDetail: { operation: intent.operation, strategy: intent.ctx.strategy },
    };
  }

  // pending_operator
  return {
    jobId: intent.jobId,
    nextState: 'in_progress',
    completeAllTasks: false,
    failureReason: null,
    auditAction: 'execution_started',
    auditDetail: {
      operation: intent.operation,
      strategy: intent.ctx.strategy,
      awaiting: 'operator',
    },
  };
}
