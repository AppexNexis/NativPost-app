// Content Intelligence Engine — Factory Validation Types
// Phase 10: Production validation and hardening

// ─── Dry Run ─────────────────────────────────────────────────────────────────

/**
 * Dry-run mode configuration.
 */
export interface DryRunConfig {
  enabled: boolean;
  previewOnly: boolean;        // Never submit to providers
  maxPreviewJobs: number;      // Cap preview generation
  includeCostEstimates: boolean;
}

export const DEFAULT_DRY_RUN_CONFIG: DryRunConfig = {
  enabled: true,
  previewOnly: true,
  maxPreviewJobs: 1000,
  includeCostEstimates: true,
};

/**
 * Dry-run result — what the factory would do without spending money.
 */
export interface DryRunResult {
  id: string;
  orgId: string;
  startedAt: Date;
  completedAt: Date;
  preview: {
    inventoryStatus: DryRunInventoryStatus[];
    demands: DryRunDemand[];
    prioritizedTasks: DryRunPrioritizedTask[];
    budgetProjection: DryRunBudgetProjection;
    modelSelections: DryRunModelSelection[];
    estimatedTotalCost: number;
    estimatedTotalJobs: number;
    warnings: string[];
  };
  wouldHaveGenerated: boolean;
  blockedReason: string | null;
}

export interface DryRunInventoryStatus {
  contentTypeId: string;
  contentTypeName: string;
  currentCount: number;
  targetCount: number;
  coverage: number;
  health: string;
  wouldGenerate: number;
}

export interface DryRunDemand {
  id: string;
  contentTypeId: string;
  count: number;
  priority: string;
  reason: string;
}

export interface DryRunPrioritizedTask {
  demandId: string;
  contentTypeId: string;
  priority: string;
  score: number;
  batchSize: number;
  estimatedCost: number;
  reasoning: string[];
}

export interface DryRunBudgetProjection {
  dailyBudget: number;
  dailySpent: number;
  dailyRemaining: number;
  monthlyBudget: number;
  monthlySpent: number;
  monthlyRemaining: number;
  estimatedDailySpendAfter: number;
  wouldExceedBudget: boolean;
}

export interface DryRunModelSelection {
  contentTypeId: string;
  selectedModel: {
    providerId: string;
    modelId: string;
    estimatedCost: number;
    estimatedSuccessRate: number;
  };
  alternatives: Array<{
    providerId: string;
    modelId: string;
    estimatedCost: number;
    estimatedSuccessRate: number;
  }>;
}

// ─── Sandbox ─────────────────────────────────────────────────────────────────

/**
 * Sandbox configuration — actual generation with hard caps.
 */
export interface SandboxConfig {
  enabled: boolean;
  maxJobs: number;
  maxSpend: number;           // USD
  maxAttempts: number;
  allowedProviders: string[]; // Whitelist providers
  allowedModels: string[];    // Whitelist models
  dryRunFirst: boolean;       // Always dry-run before executing
}

export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  enabled: false,
  maxJobs: 5,
  maxSpend: 1.00,
  maxAttempts: 2,
  allowedProviders: ['fal'],
  allowedModels: ['kling_video', 'flux_image', 'elevenlabs_speech'],
  dryRunFirst: true,
};

/**
 * Sandbox execution result.
 */
export interface SandboxResult {
  id: string;
  orgId: string;
  startedAt: Date;
  completedAt: Date;
  config: SandboxConfig;
  dryRun: DryRunResult;
  execution: {
    jobsAttempted: number;
    jobsSucceeded: number;
    jobsFailed: number;
    jobsSkipped: number;
    totalSpent: number;
    budgetRemaining: number;
    errors: string[];
  };
  outcomes: {
    assetsGenerated: number;
    assetsAccepted: number;
    assetsRejected: number;
    costPerAcceptedAsset: number;
  };
}

// ─── End-to-End Test ─────────────────────────────────────────────────────────

/**
 * End-to-end acceptance test result.
 */
export interface EndToEndTest {
  id: string;
  name: string;
  description: string;
  orgId: string;
  startedAt: Date;
  completedAt: Date;
  status: 'passed' | 'failed' | 'partial';
  steps: EndToEndStep[];
  assertions: TestAssertion[];
  totalDuration: number;
  summary: string;
}

export interface EndToEndStep {
  order: number;
  name: string;
  description: string;
  status: 'passed' | 'failed' | 'skipped';
  startedAt: Date;
  completedAt: Date;
  duration: number;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error: string | null;
}

export interface TestAssertion {
  description: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
  message: string;
}

// ─── Provenance ───────────────────────────────────────────────────────────────

/**
 * Complete provenance chain for a library item.
 */
export interface ProvenanceChain {
  libraryContentId: string;
  chain: ProvenanceNode[];
  isComplete: boolean;
  hasGaps: string[];
}

export interface ProvenanceNode {
  level: ProvenanceLevel;
  id: string;
  type: string;
  createdAt: Date;
  metadata: Record<string, unknown>;
  parentId: string | null;
}

export type ProvenanceLevel =
  | 'demand'
  | 'generation_job'
  | 'generation_attempt'
  | 'provider'
  | 'model'
  | 'media_asset'
  | 'quality_result'
  | 'tags'
  | 'embedding'
  | 'qualification'
  | 'composition'
  | 'library_content';

/**
 * Provenance audit result.
 */
export interface ProvenanceAudit {
  orgId: string;
  totalLibraryItems: number;
  itemsWithCompleteProvenance: number;
  itemsWithGaps: number;
  gapsByType: Record<string, number>;
  auditedAt: Date;
}

// ─── Quality Invariants ──────────────────────────────────────────────────────

/**
 * Quality invariant test case.
 */
export interface QualityInvariantTest {
  id: string;
  name: string;
  description: string;
  failureCode: string;
  expectedBehavior: 'quarantine' | 'retry' | 'reject';
  setup: () => Promise<{ mediaUrl: string; metadata: Record<string, unknown> }>;
  assertions: TestAssertion[];
  status: 'passed' | 'failed' | 'skipped';
}

/**
 * Invariant test suite result.
 */
export interface InvariantTestSuite {
  orgId: string;
  startedAt: Date;
  completedAt: Date;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  results: QualityInvariantTest[];
  allInvariantsHeld: boolean;
}

// ─── Cost Accuracy ───────────────────────────────────────────────────────────

/**
 * Cost accuracy tracking.
 */
export interface CostAccuracyReport {
  orgId: string;
  period: { start: Date; end: Date };
  totalJobs: number;
  totalEstimatedCost: number;
  totalActualCost: number;
  accuracyPercent: number;
  variance: number;
  byProvider: Array<{
    providerId: string;
    estimated: number;
    actual: number;
    accuracy: number;
  }>;
  byModel: Array<{
    modelId: string;
    estimated: number;
    actual: number;
    accuracy: number;
  }>;
  costPerUsableContent: number;
  totalUsableContent: number;
  generatedAt: Date;
}

// ─── Kill Switch ─────────────────────────────────────────────────────────────

/**
 * Kill switch state.
 */
export interface KillSwitchState {
  active: boolean;
  reason: string;
  activatedAt: Date | null;
  activatedBy: string | null;
  allowsInFlightCompletion: boolean;
}

export const DEFAULT_KILL_SWITCH: KillSwitchState = {
  active: false,
  reason: '',
  activatedAt: null,
  activatedBy: null,
  allowsInFlightCompletion: true,
};

// ─── Safety Limits ───────────────────────────────────────────────────────────

/**
 * Safety limits for autonomous operation.
 */
export interface SafetyLimits {
  minimumObservationsPerModel: number;
  minimumSuccessfulGenerationsPerModel: number;
  minimumQualitySamples: number;
  minimumDaysOfHistory: number;
  maxDailySpend: number;
  maxMonthlySpend: number;
  maxJobsPerRun: number;
  maxConcurrentRuns: number;
  requireManualApprovalAbove: number; // Cost threshold
  allowNewProviders: boolean;
  allowExperimentalModels: boolean;
}

export const DEFAULT_SAFETY_LIMITS: SafetyLimits = {
  minimumObservationsPerModel: 50,
  minimumSuccessfulGenerationsPerModel: 20,
  minimumQualitySamples: 30,
  minimumDaysOfHistory: 7,
  maxDailySpend: 25.00,
  maxMonthlySpend: 500.00,
  maxJobsPerRun: 100,
  maxConcurrentRuns: 1,
  requireManualApprovalAbove: 10.00,
  allowNewProviders: false,
  allowExperimentalModels: false,
};

/**
 * Safety check result.
 */
export interface SafetyCheck {
  check: string;
  passed: boolean;
  message: string;
  details: Record<string, unknown>;
}

// ─── Production Activation ───────────────────────────────────────────────────

/**
 * Production activation status.
 */
export interface ProductionActivation {
  status: 'disabled' | 'dry_run_only' | 'sandbox' | 'limited' | 'full';
  activatedAt: Date | null;
  activatedBy: string | null;
  limits: SafetyLimits;
  requiredTests: string[];
  passedTests: string[];
  blockedBy: string[];
  readyForProduction: boolean;
}

/**
 * Production gate — all checks that must pass.
 */
export interface ProductionGate {
  gate: string;
  description: string;
  required: boolean;
  status: 'passed' | 'failed' | 'pending';
  checkedAt: Date | null;
  message: string;
}
