// Content Intelligence Engine — Autonomous Factory
// Phase 9: Self-replenishing content factory

// ─── Types ───────────────────────────────────────────────────────────────────
export type {
  FactorySchedulerConfig,
  FactoryRun,
  FactoryRunPhase,
  FactoryRunStatus,
  FactoryRunMetrics,
  FactoryHealth,
  FactoryIssue,
  DemandPriorityScore,
  PrioritizationConfig,
  BudgetConfig,
  BudgetStatus,
  BudgetPeriod,
  CostRecord,
  ModelPerformance,
  RoutingRecommendation,
  RecoveryStrategy,
  RecoveryType,
  RecoveryModification,
  RecoveryAttempt,
  DiversityTarget,
  DiversityAction,
  DiversityControlResult,
  AutonomousFactoryConfig,
} from './types';

export {
  DEFAULT_SCHEDULER_CONFIG,
  DEFAULT_PRIORITIZATION_CONFIG,
  DEFAULT_BUDGET_CONFIG,
  DEFAULT_AUTONOMOUS_CONFIG,
} from './types';

// ─── Factory Scheduler ───────────────────────────────────────────────────────
export {
  FactoryScheduler,
  getFactoryScheduler,
  resetFactoryScheduler,
} from './factory-scheduler';

// ─── Demand Prioritizer ──────────────────────────────────────────────────────
export {
  DemandPrioritizer,
  getDemandPrioritizer,
  resetDemandPrioritizer,
} from './demand-prioritizer';

// ─── Budget Controller ───────────────────────────────────────────────────────
export {
  BudgetController,
  getBudgetController,
  resetBudgetController,
} from './budget-controller';

// ─── Model Learner ───────────────────────────────────────────────────────────
export {
  ModelLearner,
  getModelLearner,
  resetModelLearner,
} from './model-learner';

// ─── Quality Recovery ────────────────────────────────────────────────────────
export {
  QualityRecovery,
  getQualityRecovery,
  resetQualityRecovery,
} from './quality-recovery';

// ─── Diversity Controller ────────────────────────────────────────────────────
export {
  DiversityController,
  getDiversityController,
  resetDiversityController,
} from './diversity-controller';

// ─── Self-Replenisher ────────────────────────────────────────────────────────
export {
  SelfReplenisher,
  getSelfReplenisher,
  resetSelfReplenisher,
} from './self-replenisher';
