// Content Intelligence Engine — Inventory Intelligence Types
// Phase 7: Deduplication, Diversity, Inventory, Demand

// ─── Deduplication ───────────────────────────────────────────────────────────

/**
 * Types of duplicates the system detects.
 */
export type DuplicateType =
  | 'exact'        // Same hash/file
  | 'visual'       // Similar visual embeddings
  | 'semantic'     // Similar meaning, different visuals
  | 'composition'; // Same assets in different order

/**
 * A group of duplicate content.
 */
export interface DuplicateGroup {
  id: string;
  canonicalContentId: string;  // The "best" version
  duplicateContentIds: string[];
  duplicateType: DuplicateType;
  similarity: number;          // 0-1
  reason: string;
  detectedAt: Date;
  resolvedAt: Date | null;
  resolution: DuplicateResolution | null;
}

export type DuplicateResolution =
  | 'keep_canonical'    // Keep the best, mark others as duplicates
  | 'merge'             // Merge into single content
  | 'archive_duplicates' // Archive duplicates, keep canonical
  | 'ignore';           // Not actually duplicates

/**
 * Result of a deduplication check.
 */
export interface DeduplicationResult {
  isDuplicate: boolean;
  duplicateType: DuplicateType | null;
  similarity: number;
  canonicalContentId: string | null;
  groupId: string | null;
  reasoning: string[];
}

/**
 * Signature for composition deduplication.
 */
export interface CompositionSignature {
  assetIds: string[];
  assetOrder: string[];
  textHash: string;
  contentTypeId: string;
  signature: string;  // sha256 of above
}

// ─── Diversity ───────────────────────────────────────────────────────────────

/**
 * Dimensions along which we track diversity.
 */
export type DiversityDimension =
  | 'industry'
  | 'audience'
  | 'gender'
  | 'visual_style'
  | 'country'
  | 'content_type'
  | 'creator_type'
  | 'emotion'
  | 'offer_type'
  | 'hook_style'
  | 'audio_style'
  | 'aspect_ratio'
  | 'color_palette'
  | 'setting'
  | 'language';

/**
 * Distribution of content across a dimension.
 */
export interface ContentDistribution {
  dimension: DiversityDimension;
  distribution: DistributionEntry[];
  totalAssets: number;
  entropy: number;           // 0-1, higher = more diverse
  dominanceScore: number;    // 0-1, higher = less diverse (one category dominates)
  topCategory: string;
  topCategoryPercentage: number;
}

export interface DistributionEntry {
  category: string;
  count: number;
  percentage: number;
  targetPercentage: number | null;
  deviation: number;         // percentage - targetPercentage
}

/**
 * An imbalance detected in content distribution.
 */
export interface DiversityImbalance {
  dimension: DiversityDimension;
  category: string;
  currentCount: number;
  targetCount: number;
  deficit: number;           // targetCount - currentCount
  severity: 'low' | 'medium' | 'high' | 'critical';
  recommendation: string;
}

/**
 * Overall diversity score.
 */
export interface DiversityScore {
  overall: number;           // 0-100
  byDimension: Record<DiversityDimension, number>;
  imbalances: DiversityImbalance[];
  recommendations: string[];
  calculatedAt: Date;
}

// ─── Inventory ───────────────────────────────────────────────────────────────

/**
 * Health status of inventory for a content type.
 */
export type InventoryHealth =
  | 'healthy'      // >= 80% of target
  | 'low'          // 50-79% of target
  | 'critical'     // < 50% of target
  | 'overstocked'; // > 120% of target

/**
 * Inventory status for a specific content type.
 */
export interface InventoryStatus {
  contentTypeId: string;
  contentTypeName: string;
  currentCount: number;
  targetCount: number;
  coverage: number;          // currentCount / targetCount (0-1+)
  health: InventoryHealth;
 freshnessScore: number;    // 0-1, how fresh the content is
  lastGeneratedAt: Date | null;
  oldestContentAge: number;  // days
  newestContentAge: number;  // days
  averageAge: number;        // days
}

/**
 * Inventory snapshot for historical tracking.
 */
export interface InventorySnapshot {
  id: string;
  orgId: string;
  snapshotDate: Date;
  contentTypes: InventoryStatus[];
  overallCoverage: number;
  overallHealth: InventoryHealth;
  totalAssets: number;
  totalTarget: number;
}

/**
 * Inventory health configuration.
 */
export interface InventoryConfig {
  healthyThreshold: number;    // 0.8 = 80%
  lowThreshold: number;        // 0.5 = 50%
  overstockedThreshold: number; // 1.2 = 120%
  freshnessDecayDays: number;  // Days before content is "stale"
  criticalDecayDays: number;   // Days before content is "critical"
  defaultTargetPerType: number;
}

export const DEFAULT_INVENTORY_CONFIG: InventoryConfig = {
  healthyThreshold: 0.8,
  lowThreshold: 0.5,
  overstockedThreshold: 1.2,
  freshnessDecayDays: 90,
  criticalDecayDays: 180,
  defaultTargetPerType: 1000,
};

// ─── Freshness ───────────────────────────────────────────────────────────────

/**
 * Content freshness scoring.
 */
export interface FreshnessScore {
  contentId: string;
  ageDays: number;
  freshness: number;         // 0-1, 1 = brand new, 0 = expired
  category: FreshnessCategory;
  regenerationRecommended: boolean;
}

export type FreshnessCategory =
  | 'fresh'       // < 30 days
  | 'mature'      // 30-90 days
  | 'aging'       // 90-180 days
  | 'stale'       // 180-365 days
  | 'expired';    // > 365 days

/**
 * Industry-specific decay rates.
 */
export interface DecayRate {
  industry: string;
  halfLifeDays: number;      // Days until content loses 50% value
  refreshFrequencyDays: number;
}

export const DEFAULT_DECAY_RATES: DecayRate[] = [
  { industry: 'ai', halfLifeDays: 30, refreshFrequencyDays: 14 },
  { industry: 'marketing', halfLifeDays: 60, refreshFrequencyDays: 30 },
  { industry: 'crypto', halfLifeDays: 45, refreshFrequencyDays: 21 },
  { industry: 'finance', halfLifeDays: 90, refreshFrequencyDays: 60 },
  { industry: 'health', halfLifeDays: 120, refreshFrequencyDays: 90 },
  { industry: 'fitness', halfLifeDays: 180, refreshFrequencyDays: 120 },
  { industry: 'fashion', halfLifeDays: 90, refreshFrequencyDays: 60 },
  { industry: 'food', halfLifeDays: 60, refreshFrequencyDays: 30 },
  { industry: 'travel', halfLifeDays: 120, refreshFrequencyDays: 90 },
  { industry: 'education', halfLifeDays: 365, refreshFrequencyDays: 180 },
];

// ─── Demand ──────────────────────────────────────────────────────────────────

/**
 * A generation task created by the demand engine.
 */
export interface GenerationDemand {
  id: string;
  orgId: string;
  contentTypeId: string;
  contentType: string;
  priority: DemandPriority;
  count: number;
  brief: GenerationBrief;
  status: DemandStatus;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  metadata: DemandMetadata;
}

export type DemandPriority =
  | 'critical'   // Inventory critically low
  | 'high'       // Inventory low
  | 'medium'     // Normal replenishment
  | 'low';       // Optimization/balance

export type DemandStatus =
  | 'pending'    // Waiting to be processed
  | 'queued'     // In generation queue
  | 'generating' // Actively generating
  | 'completed'  // Generation complete
  | 'failed'     // Generation failed
  | 'cancelled'; // Manually cancelled

/**
 * Brief for generating content.
 */
export interface GenerationBrief {
  contentType: string;
  audience?: string;
  industry?: string;
  gender?: string;
  tone?: string;
  visualStyle?: string;
  hookStyle?: string;
  language?: string;
  count: number;
  requirements: BriefRequirement[];
  metadata: Record<string, unknown>;
}

export interface BriefRequirement {
  type: string;
  value: string;
  priority: 'required' | 'preferred';
}

/**
 * Metadata about a demand.
 */
export interface DemandMetadata {
  inventoryStatus: string;
  deficitCount: number;
  triggeredBy: 'inventory_check' | 'freshness_decay' | 'diversity_gap' | 'manual';
  diversityDimensions?: Record<string, number>;
}

// ─── Coverage ────────────────────────────────────────────────────────────────

/**
 * Coverage across content types and dimensions.
 */
export interface CoverageReport {
  orgId: string;
  generatedAt: Date;
  contentTypes: ContentTypeCoverage[];
  dimensions: DimensionCoverage[];
  overallScore: number;
  gaps: CoverageGap[];
  recommendations: string[];
}

export interface ContentTypeCoverage {
  contentTypeId: string;
  count: number;
  target: number;
  coverage: number;
  health: InventoryHealth;
}

export interface DimensionCoverage {
  dimension: DiversityDimension;
  categories: CategoryCoverage[];
  entropy: number;
  balance: number;
}

export interface CategoryCoverage {
  category: string;
  count: number;
  target: number | null;
  coverage: number;
}

export interface CoverageGap {
  contentType: string;
  dimension: string;
  category: string;
  current: number;
  target: number;
  deficit: number;
  priority: DemandPriority;
}

// ─── Clustering ──────────────────────────────────────────────────────────────

/**
 * Content cluster for grouping similar content.
 */
export interface ContentCluster {
  id: string;
  orgId: string;
  clusterType: ClusterType;
  centroid: number[];        // Embedding centroid
  memberIds: string[];
  memberCount: number;
  averageSimilarity: number;
  dominantTags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export type ClusterType =
  | 'visual'       // Visual similarity
  | 'semantic'     // Semantic similarity
  | 'combined';    // Combined similarity

// ─── Analytics ───────────────────────────────────────────────────────────────

/**
 * Analytics about inventory health.
 */
export interface InventoryAnalytics {
  orgId: string;
  period: AnalyticsPeriod;
  totalContent: number;
  totalGenerated: number;
  totalDuplicate: number;
  totalArchived: number;
  averageQuality: number;
  averageFreshness: number;
  diversityScore: number;
  topPerformingTypes: string[];
  underperformingTypes: string[];
  generationEfficiency: number;
}

export type AnalyticsPeriod =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly';

// ─── Engine Config ───────────────────────────────────────────────────────────

/**
 * Configuration for inventory engines.
 */
export interface InventoryEngineConfig {
  deduplication: {
    exactThreshold: number;     // Hash match = 1.0
    visualThreshold: number;    // Cosine similarity threshold
    semanticThreshold: number;  // Cosine similarity threshold
    compositionThreshold: number;
    maxGroupSize: number;
  };
  diversity: {
    minEntropy: number;         // Minimum entropy per dimension
    maxDominance: number;       // Maximum dominance score
    imbalanceThreshold: number; // Minimum deficit to flag
  };
  inventory: InventoryConfig;
  demand: {
    batchSize: number;          // Assets per generation task
    maxConcurrentTasks: number;
    priorityThresholds: {
      critical: number;         // Below this = critical
      high: number;
      medium: number;
    };
  };
}

export const DEFAULT_INVENTORY_ENGINE_CONFIG: InventoryEngineConfig = {
  deduplication: {
    exactThreshold: 1.0,
    visualThreshold: 0.95,
    semanticThreshold: 0.90,
    compositionThreshold: 0.95,
    maxGroupSize: 10,
  },
  diversity: {
    minEntropy: 0.7,
    maxDominance: 0.4,
    imbalanceThreshold: 50,
  },
  inventory: DEFAULT_INVENTORY_CONFIG,
  demand: {
    batchSize: 50,
    maxConcurrentTasks: 5,
    priorityThresholds: {
      critical: 0.3,
      high: 0.5,
      medium: 0.8,
    },
  },
};
