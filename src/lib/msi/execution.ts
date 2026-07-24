// MSI Execution Layer (docs §Execution Layer; Phase 0 §2 hybrid model).
//
// The execution mechanism is an implementation detail of this layer and is
// intentionally abstracted from the customer experience. The workflow engine,
// audit trail, billing, provisioning, and analytics are execution-agnostic:
// they ask the layer to perform an operation and consume a uniform result,
// never knowing whether it ran through an official API, delegated business
// access, or a customer-authorized manual/device-based process.
//
// Each managed account carries an `execution_strategy` (resolved at
// provisioning). The worker: Job → strategy → adapter → execute. Pure — no
// db/Env; the DB layer resolves rows and calls in.

export const EXECUTION_STRATEGIES = [
  'official_api', // sanctioned platform APIs (e.g. IG Content Publishing, TikTok Content Posting)
  'delegated_access', // partner/agency delegation (Meta Business Manager / TikTok Business Center)
  'manual', // customer-authorized, in-country human/device operation
] as const;

export type ExecutionStrategy = (typeof EXECUTION_STRATEGIES)[number];

export function isExecutionStrategy(v: unknown): v is ExecutionStrategy {
  return (
    typeof v === 'string'
    && (EXECUTION_STRATEGIES as readonly string[]).includes(v)
  );
}

/** Platform operations the pipeline can ask the execution layer to perform. */
export const EXECUTION_OPERATIONS = [
  'create_account',
  'apply_profile',
  'publish_post',
  'pause_account',
  'resume_account',
  'archive_account',
] as const;

export type ExecutionOperation = (typeof EXECUTION_OPERATIONS)[number];

export type ExecutionContext = {
  managedAccountId: string;
  platform: string;
  country: string;
  strategy: ExecutionStrategy;
  payload?: Record<string, unknown>;
};

export type ExecutionOutcome = 'completed' | 'pending_operator' | 'failed';

export type ExecutionResult = {
  outcome: ExecutionOutcome;
  detail?: string;
  evidenceUrl?: string;
};

export type ExecutionAdapter = {
  readonly strategy: ExecutionStrategy;
  execute: (
    operation: ExecutionOperation,
    ctx: ExecutionContext,
  ) => Promise<ExecutionResult>;
};

// ---------------------------------------------------------------------------
// Strategy resolution (per-account, per-platform)
// ---------------------------------------------------------------------------

/**
 * Fallback default strategy per platform. The AUTHORITATIVE value is
 * `managed_account.execution_strategy` (set at provisioning); this map is only
 * used when that is unset. Conservative default is `manual` (always
 * customer-authorized). Add explicit entries as each platform's mechanism is
 * cleared + configured.
 */
export const PLATFORM_DEFAULT_STRATEGY: Record<string, ExecutionStrategy> = {
  // instagram: 'delegated_access',
  // tiktok: 'official_api',
};

export const DEFAULT_EXECUTION_STRATEGY: ExecutionStrategy = 'manual';

export function resolveStrategy(input: {
  executionStrategy?: string | null;
  platform: string;
}): ExecutionStrategy {
  if (isExecutionStrategy(input.executionStrategy)) {
    return input.executionStrategy;
  }
  return PLATFORM_DEFAULT_STRATEGY[input.platform] ?? DEFAULT_EXECUTION_STRATEGY;
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

export const manualExecutionAdapter: ExecutionAdapter = {
  strategy: 'manual',
  async execute(_operation, _ctx) {
    // A real in-country operator performs the action natively under the
    // customer's authorization. No automated platform call is made here; the
    // pipeline records the task as awaiting the operator.
    return { outcome: 'pending_operator', detail: 'Awaiting in-country operator' };
  },
};

export class AdapterNotConfiguredError extends Error {
  constructor(public readonly strategy: ExecutionStrategy) {
    super(
      `No execution adapter configured for strategy "${strategy}". It must be configured + reviewed before operating this platform.`,
    );
    this.name = 'AdapterNotConfiguredError';
  }
}

/**
 * Registry — FAILS CLOSED: an unconfigured strategy throws rather than silently
 * no-op'ing. The official_api / delegated_access adapters require platform app
 * credentials + their own Phase-0 sign-off, and are registered as each is
 * cleared and integration-ready.
 */
const ADAPTERS: Partial<Record<ExecutionStrategy, ExecutionAdapter>> = {
  manual: manualExecutionAdapter,
};

export function getExecutionAdapter(strategy: ExecutionStrategy): ExecutionAdapter {
  const adapter = ADAPTERS[strategy];
  if (!adapter) {
    throw new AdapterNotConfiguredError(strategy);
  }
  return adapter;
}

/**
 * Register a concrete adapter for a strategy — call at app/worker bootstrap
 * once the platform clients are configured (see ./execution-api). Until then
 * the strategy stays fail-closed.
 */
export function registerExecutionAdapter(adapter: ExecutionAdapter): void {
  ADAPTERS[adapter.strategy] = adapter;
}

/** Remove a registered adapter; the strategy reverts to fail-closed. */
export function unregisterExecutionAdapter(strategy: ExecutionStrategy): void {
  delete ADAPTERS[strategy];
}

export function getAdapterForAccount(input: {
  executionStrategy?: string | null;
  platform: string;
}): ExecutionAdapter {
  return getExecutionAdapter(resolveStrategy(input));
}

// ---------------------------------------------------------------------------
// Result → pipeline effect (uniform across every strategy)
// ---------------------------------------------------------------------------

export type ExecutionEffect = {
  taskStatus: 'done' | 'in_progress' | 'pending';
  jobFailed: boolean;
  operatorActionRequired: boolean;
};

const EFFECTS: Record<ExecutionOutcome, ExecutionEffect> = {
  completed: { taskStatus: 'done', jobFailed: false, operatorActionRequired: false },
  pending_operator: {
    taskStatus: 'in_progress',
    jobFailed: false,
    operatorActionRequired: true,
  },
  failed: { taskStatus: 'pending', jobFailed: true, operatorActionRequired: false },
};

export function executionEffect(result: ExecutionResult): ExecutionEffect {
  return EFFECTS[result.outcome];
}

// ---------------------------------------------------------------------------
// Job → operation mapping
// ---------------------------------------------------------------------------

const JOB_OPERATION: Record<string, ExecutionOperation> = {
  create_account: 'create_account',
  update_profile: 'apply_profile',
  replace_avatar: 'apply_profile',
  update_bio: 'apply_profile',
  publish_post: 'publish_post',
  pause_account: 'pause_account',
  resume_account: 'resume_account',
  archive_account: 'archive_account',
};

/** Map a job type to the platform operation it drives, or null if it has none. */
export function jobToOperation(jobType: string): ExecutionOperation | null {
  return JOB_OPERATION[jobType] ?? null;
}
