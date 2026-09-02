// Content Intelligence Engine — Autonomous Factory Types
// Phase 9: Self-replenishing content factory

// ─── Factory Scheduler ───────────────────────────────────────────────────────

/**
 * Configuration for the factory scheduler.
 */
export interface FactorySchedulerConfig {
  enabled: boolean;
  intervalMinutes: number;
  maxConcurrentRuns: number;
  retryDelayMinutes: number;
  maxRetries: number;
  quietHoursStart: number;   // 0-23
  quietHoursEnd: number;     // 0-23
  timezone: string;
}

export const DEFAULT_SCHEDULER_CONFIG: FactorySchedulerConfig = {
  enabled: true,
  intervalMinutes: 30,
  maxConcurrentRuns: 1,
  retryDelayMinutes: 5,
  maxRetries: 3,
  quietHoursStart: 2,
  quietHoursEnd: 6,
  timezone: 'UTC',
};

/**
 * A factory run represents one execution of the autonomous loop.
 */
export interface FactoryRun {
  id: string;
  orgId: string;
  startedAt: Date;
  completedAt: Date | null;
  status: FactoryRunStatus;
  phases: FactoryRunPhase[];
  metrics: FactoryRunMetrics;
  errors: string[];
}

export type FactoryRunStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface FactoryRunPhase {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt: Date | null;
  completedAt: Date | null;
  duration: number | null;
  metrics: Record<string, number>;
}

export interface FactoryRunMetrics {
  demandsCreated: number;
  jobsQueued: number;
  jobsCompleted: number;
  jobsFailed: number;
  assetsGenerated: number;
  assetsAccepted: number;
  assetsRejected: number;
  assetsDeduplicated: number;
  contentConstructed: number;
  costTotal: number;
  costPerAcceptedAsset: number;
}

// ─── Demand Prioritization ───────────────────────────────────────────────────

/**
 * Priority score components for demand prioritization.
 */
export interface DemandPriorityScore {
  demandId: string;
  contentTypeId: string;
  scores: {
    deficit: number;          // 0-1, how critical the gap is
    importance: number;       // 0-1, content type importance
    velocity: number;         // 0-1, how fast demand is growing
    freshness: number;        // 0-1, how stale existing content is
    diversity: number;        // 0-1, diversity contribution
    cost: number;             // 0-1, cost efficiency (inverse)
  };
  weighted: number;           // Final weighted score
  priority: 'critical' | 'high' | 'medium' | 'low';
  reasoning: string[];
}

/**
 * Configuration for demand prioritization.
 */
export interface PrioritizationConfig {
  weights: {
    deficit: number;
    importance: number;
    velocity: number;
    freshness: number;
    diversity: number;
    cost: number;
  };
  priorityThresholds: {
    critical: number;
    high: number;
    medium: number;
  };
}

export const DEFAULT_PRIORITIZATION_CONFIG: PrioritizationConfig = {
  weights: {
    deficit: 0.30,
    importance: 0.20,
    velocity: 0.15,
    freshness: 0.15,
    diversity: 0.10,
    cost: 0.10,
  },
  priorityThresholds: {
    critical: 0.8,
    high: 0.6,
    medium: 0.4,
  },
};

// ─── Budget Controller ───────────────────────────────────────────────────────

/**
 * Budget configuration.
 */
export interface BudgetConfig {
  dailyBudget: number;        // USD
  monthlyBudget: number;      // USD
  perProviderBudget: number;  // USD
  perModelBudget: number;     // USD
  perContentTypeBudget: number; // USD
  hardStopThreshold: number;  // Stop at this % of budget
  alertThreshold: number;     // Alert at this % of budget
}

export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  dailyBudget: 25.00,
  monthlyBudget: 500.00,
  perProviderBudget: 100.00,
  perModelBudget: 50.00,
  perContentTypeBudget: 100.00,
  hardStopThreshold: 0.95,
  alertThreshold: 0.80,
};

/**
 * Current budget status.
 */
export interface BudgetStatus {
  daily: BudgetPeriod;
  monthly: BudgetPeriod;
  byProvider: Map<string, BudgetPeriod>;
  byModel: Map<string, BudgetPeriod>;
  byContentType: Map<string, BudgetPeriod>;
  canGenerate: boolean;
  reason?: string;
}

export interface BudgetPeriod {
  budget: number;
  spent: number;
  remaining: number;
  utilization: number;       // 0-1
  projectedDaily: number;    // Projected daily spend
  daysUntilReset: number;
}

/**
 * Cost record for tracking generation costs.
 */
export interface CostRecord {
  id: string;
  orgId: string;
  jobId: string;
  providerId: string;
  modelId: string;
  contentTypeId: string;
  cost: number;
  success: boolean;
  recordedAt: Date;
}

// ─── Model Learning ──────────────────────────────────────────────────────────

/**
 * Model performance metrics.
 */
export interface ModelPerformance {
  providerId: string;
  modelId: string;
  contentTypeId: string;
  metrics: {
    totalGenerations: number;
    successfulGenerations: number;
    failedGenerations: number;
    successRate: number;
    averageCost: number;
    costPerAcceptedAsset: number;
    averageQualityScore: number;
    averageGenerationTime: number;
  };
  trends: {
    successRateTrend: 'improving' | 'stable' | 'declining';
    costTrend: 'decreasing' | 'stable' | 'increasing';
    qualityTrend: 'improving' | 'stable' | 'declining';
  };
  lastUpdated: Date;
}

/**
 * Routing recommendation based on learning.
 */
export interface RoutingRecommendation {
  contentTypeId: string;
  recommendations: Array<{
    providerId: string;
    modelId: string;
    score: number;
    reason: string;
    estimatedCost: number;
    estimatedSuccessRate: number;
  }>;
  generatedAt: Date;
}

// ─── Quality Recovery ────────────────────────────────────────────────────────

/**
 * Quality recovery strategy for failed content.
 */
export interface RecoveryStrategy {
  failureCode: string;
  recoveryType: RecoveryType;
  maxRetries: number;
  modifications: RecoveryModification[];
  escalateToQuarantine: boolean;
}

export type RecoveryType =
  | 'retry_same'           // Retry with same parameters
  | 'retry_modified'       // Retry with modified parameters
  | 'retry_different_model' // Try a different model
  | 'skip'                 // Skip this asset
  | 'quarantine';          // Move to quarantine

export interface RecoveryModification {
  field: string;
  action: 'increase' | 'decrease' | 'change' | 'remove';
  value: unknown;
  reasoning: string;
}

/**
 * Recovery attempt record.
 */
export interface RecoveryAttempt {
  id: string;
  jobId: string;
  originalFailureCode: string;
  recoveryType: RecoveryType;
  attemptNumber: number;
  modifications: RecoveryModification[];
  result: 'success' | 'failure' | 'escalated';
  newJobId: string | null;
  timestamp: Date;
}

// ─── Diversity Controller ────────────────────────────────────────────────────

/**
 * Diversity target configuration.
 */
export interface DiversityTarget {
  dimension: string;
  category: string;
  targetPercentage: number;
  currentPercentage: number;
  deficit: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Diversity control action.
 */
export interface DiversityAction {
  type: 'generate' | 'suppress' | 'maintain';
  dimension: string;
  category: string;
  count: number;
  reasoning: string;
}

/**
 * Diversity control result.
 */
export interface DiversityControlResult {
  actions: DiversityAction[];
  overallDiversityScore: number;
  dimensionsImproved: string[];
  estimatedImpact: number;
}

// ─── Self-Replenisher ────────────────────────────────────────────────────────

/**
 * The complete autonomous loop configuration.
 */
export interface AutonomousFactoryConfig {
  scheduler: FactorySchedulerConfig;
  prioritization: PrioritizationConfig;
  budget: BudgetConfig;
  qualityRecovery: {
    enabled: boolean;
    maxRetriesPerAsset: number;
    escalationThreshold: number;
  };
  diversityControl: {
    enabled: boolean;
    targetDiversityScore: number;
    minDiversityPerDimension: number;
  };
  selfReplenishment: {
    enabled: boolean;
    targetCoverage: number;
    maxGenerationBatchSize: number;
    cooldownMinutes: number;
  };
}

export const DEFAULT_AUTONOMOUS_CONFIG: AutonomousFactoryConfig = {
  scheduler: DEFAULT_SCHEDULER_CONFIG,
  prioritization: DEFAULT_PRIORITIZATION_CONFIG,
  budget: DEFAULT_BUDGET_CONFIG,
  qualityRecovery: {
    enabled: true,
    maxRetriesPerAsset: 3,
    escalationThreshold: 3,
  },
  diversityControl: {
    enabled: true,
    targetDiversityScore: 0.8,
    minDiversityPerDimension: 0.6,
  },
  selfReplenishment: {
    enabled: true,
    targetCoverage: 0.8,
    maxGenerationBatchSize: 100,
    cooldownMinutes: 5,
  },
};

/**
 * Factory health status.
 */
export interface FactoryHealth {
  status: 'healthy' | 'degraded' | 'critical' | 'offline';
  lastRun: Date | null;
  lastRunStatus: FactoryRunStatus | null;
  nextRunScheduled: Date | null;
  uptime: number;           // seconds
  totalRuns: number;
  successRate: number;
  averageRunDuration: number;
  issues: FactoryIssue[];
}

export interface FactoryIssue {
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: string;
  message: string;
  detectedAt: Date;
  resolvedAt: Date | null;
}
