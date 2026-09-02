// Content Intelligence Engine — Factory Validation
// Phase 10: Production validation and hardening

// ─── Types ───────────────────────────────────────────────────────────────────
export type {
  DryRunConfig,
  DryRunResult,
  DryRunInventoryStatus,
  DryRunDemand,
  DryRunPrioritizedTask,
  DryRunBudgetProjection,
  DryRunModelSelection,
  SandboxConfig,
  SandboxResult,
  EndToEndTest,
  EndToEndStep,
  TestAssertion,
  ProvenanceChain,
  ProvenanceNode,
  ProvenanceLevel,
  ProvenanceAudit,
  QualityInvariantTest,
  InvariantTestSuite,
  CostAccuracyReport,
  KillSwitchState,
  SafetyLimits,
  SafetyCheck,
  ProductionActivation,
  ProductionGate,
} from './types';

export {
  DEFAULT_DRY_RUN_CONFIG,
  DEFAULT_SANDBOX_CONFIG,
  DEFAULT_KILL_SWITCH,
  DEFAULT_SAFETY_LIMITS,
} from './types';

// ─── Dry Run ─────────────────────────────────────────────────────────────────
export {
  DryRunEngine,
  getDryRunEngine,
  resetDryRunEngine,
} from './dry-run';

// ─── Sandbox ─────────────────────────────────────────────────────────────────
export {
  SandboxExecutor,
  getSandboxExecutor,
  resetSandboxExecutor,
} from './sandbox';

// ─── Kill Switch ─────────────────────────────────────────────────────────────
export {
  KillSwitch,
  getKillSwitch,
  resetKillSwitch,
} from './kill-switch';

// ─── Provenance Auditor ──────────────────────────────────────────────────────
export {
  ProvenanceAuditor,
  getProvenanceAuditor,
  resetProvenanceAuditor,
} from './provenance-auditor';

// ─── Quality Invariant Tester ────────────────────────────────────────────────
export {
  QualityInvariantTester,
  getQualityInvariantTester,
  resetQualityInvariantTester,
} from './quality-invariant-tester';

// ─── Cost Accuracy ───────────────────────────────────────────────────────────
export {
  CostAccuracyTracker,
  getCostAccuracyTracker,
  resetCostAccuracyTracker,
} from './cost-accuracy';

// ─── Safety Limits ───────────────────────────────────────────────────────────
export {
  SafetyLimitsEngine,
  getSafetyLimitsEngine,
  resetSafetyLimitsEngine,
} from './safety-limits';

// ─── Production Activation ───────────────────────────────────────────────────
export {
  ProductionActivationGuard,
  getProductionActivationGuard,
  resetProductionActivationGuard,
} from './production-activation';

// ─── End-to-End Test ─────────────────────────────────────────────────────────
export {
  EndToEndAcceptanceTest,
  getEndToEndAcceptanceTest,
  resetEndToEndAcceptanceTest,
} from './end-to-end-test';
