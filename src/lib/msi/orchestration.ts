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
  /** For publish_post jobs — the content to publish (docs §13). */
  contentItemId?: string | null;
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
        // Carry the content ref so a publish adapter knows what to publish.
        ...(job.contentItemId
          ? { payload: { contentItemId: job.contentItemId } }
          : {}),
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
  /** Async handle to persist when `processing` (else null). */
  providerHandle: string | null;
  auditAction: string;
  auditDetail: Record<string, unknown>;
};

/**
 * Map an execution result to the job's resulting state — uniform across every
 * strategy. `completed` → submit for QA (peer_review) + tasks done; `failed` →
 * failed; `processing` → stays in_progress with a handle (confirmed later);
 * `pending_operator` → stays in_progress awaiting the operator.
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
      providerHandle: null,
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
      providerHandle: null,
      auditAction: 'execution_completed',
      auditDetail: { operation: intent.operation, strategy: intent.ctx.strategy },
    };
  }

  if (result.outcome === 'processing') {
    return {
      jobId: intent.jobId,
      nextState: 'in_progress',
      completeAllTasks: false,
      failureReason: null,
      providerHandle: result.providerHandle ?? null,
      auditAction: 'execution_processing',
      auditDetail: {
        operation: intent.operation,
        strategy: intent.ctx.strategy,
        awaiting: 'platform',
      },
    };
  }

  // pending_operator
  return {
    jobId: intent.jobId,
    nextState: 'in_progress',
    completeAllTasks: false,
    failureReason: null,
    providerHandle: null,
    auditAction: 'execution_started',
    auditDetail: {
      operation: intent.operation,
      strategy: intent.ctx.strategy,
      awaiting: 'operator',
    },
  };
}

export type ConfirmOutcome = {
  jobId: string;
  resolution: 'completed' | 'failed' | 'still_processing';
  completeAllTasks: boolean;
  platformPostId: string | null;
  /** Advanced async handle to persist while still processing (else null). */
  providerHandle: string | null;
  failureReason: string | null;
  /** Null while still processing (no audit noise per idle tick). */
  auditAction: string | null;
  auditDetail: Record<string, unknown>;
};

/**
 * Map a `checkStatus` result for an in-flight async job to its resolution.
 * `completed` → peer_review + tasks done (+ platform post id); `failed` →
 * failed; `processing` → leave it for the next tick.
 */
export function resolveConfirmOutcome(
  jobId: string,
  jobType: string,
  result: ExecutionResult,
): ConfirmOutcome {
  const effect = executionEffect(result);

  if (effect.jobFailed) {
    return {
      jobId,
      resolution: 'failed',
      completeAllTasks: false,
      platformPostId: null,
      providerHandle: null,
      failureReason: result.detail ?? 'execution failed',
      auditAction: 'execution_failed',
      auditDetail: { jobType, detail: result.detail ?? null },
    };
  }

  if (result.outcome === 'completed') {
    return {
      jobId,
      resolution: 'completed',
      completeAllTasks: true,
      platformPostId: result.platformPostId ?? null,
      providerHandle: null,
      failureReason: null,
      auditAction: 'execution_completed',
      auditDetail: { jobType, platformPostId: result.platformPostId ?? null },
    };
  }

  // still processing — carry the (possibly advanced) handle to persist.
  return {
    jobId,
    resolution: 'still_processing',
    completeAllTasks: false,
    platformPostId: null,
    providerHandle: result.providerHandle ?? null,
    failureReason: null,
    auditAction: null,
    auditDetail: {},
  };
}
