// Content Intelligence Engine — Demand Prioritizer
// Phase 9: Smart prioritization of what to generate next

import { db } from '@/lib/db';
import { generationJobSchema } from '@/models/Schema';
import { eq, and, count, sql } from 'drizzle-orm';
import type {
  DemandPriorityScore,
  PrioritizationConfig,
} from './types';
import type { GenerationDemand } from '../inventory/types';
import { getInventoryEngine } from '../inventory/inventory-engine';
import { getDiversityEngine } from '../inventory/diversity-engine';
import { getDemandEngine } from '../inventory/demand-engine';

// ─── Demand Prioritizer ──────────────────────────────────────────────────────

/**
 * DemandPrioritizer — decides what to generate next.
 *
 * This is the brain of the autonomous factory.
 *
 * Instead of "We're missing 400 reels," it says:
 *   "Generate these 50 first."
 *
 * Priority = deficit × importance × velocity × freshness × diversity × cost
 */
export class DemandPrioritizer {
  private config: PrioritizationConfig;

  constructor(config: Partial<PrioritizationConfig> = {}) {
    this.config = {
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
      ...config,
    };
  }

  // ── Prioritization ────────────────────────────────────────────────────────

  /**
   * Prioritize all pending demands.
   */
  async prioritizeAll(
    orgId: string,
    demands?: GenerationDemand[],
  ): Promise<DemandPriorityScore[]> {
    // Get demands if not provided
    if (!demands) {
      const demandEngine = getDemandEngine();
      demands = await demandEngine.generateDemand(orgId);
    }

    // Score each demand
    const scores: DemandPriorityScore[] = [];
    for (const demand of demands) {
      const score = await this.scoreDemand(orgId, demand);
      scores.push(score);
    }

    // Sort by weighted score descending
    scores.sort((a, b) => b.weighted - a.weighted);

    // Assign priority based on thresholds
    for (const score of scores) {
      score.priority = this.determinePriority(score.weighted);
    }

    return scores;
  }

  /**
   * Score a single demand.
   */
  async scoreDemand(
    orgId: string,
    demand: GenerationDemand,
  ): Promise<DemandPriorityScore> {
    const scores = {
      deficit: await this.scoreDeficit(orgId, demand),
      importance: await this.scoreImportance(orgId, demand),
      velocity: await this.scoreVelocity(orgId, demand),
      freshness: await this.scoreFreshness(orgId, demand),
      diversity: await this.scoreDiversity(orgId, demand),
      cost: await this.scoreCost(orgId, demand),
    };

    // Calculate weighted score
    const weighted =
      scores.deficit * this.config.weights.deficit +
      scores.importance * this.config.weights.importance +
      scores.velocity * this.config.weights.velocity +
      scores.freshness * this.config.weights.freshness +
      scores.diversity * this.config.weights.diversity +
      scores.cost * this.config.weights.cost;

    // Generate reasoning
    const reasoning = this.generateReasoning(demand, scores, weighted);

    return {
      demandId: demand.id,
      contentTypeId: demand.contentTypeId,
      scores,
      weighted,
      priority: 'medium', // Will be set after sorting
      reasoning,
    };
  }

  // ── Score Components ──────────────────────────────────────────────────────

  /**
   * Score based on inventory deficit.
   * Higher deficit = higher priority.
   */
  private async scoreDeficit(
    orgId: string,
    demand: GenerationDemand,
  ): Promise<number> {
    const inventoryEngine = getInventoryEngine();
    const status = await inventoryEngine.getContentTypeStatus(orgId, demand.contentTypeId);

    if (!status) return 0.5; // Unknown type = medium priority

    // Coverage ratio: 0 = critical, 1 = healthy
    const coverage = status.coverage;

    // Invert: low coverage = high priority
    return Math.max(0, 1 - coverage);
  }

  /**
   * Score based on content type importance.
   * Some content types are more important than others.
   */
  private async scoreImportance(
    _orgId: string,
    demand: GenerationDemand,
  ): Promise<number> {
    // Content type importance weights
    const importanceMap: Record<string, number> = {
      talking_head: 0.9,
      ugc: 0.85,
      reel: 0.8,
      slideshow: 0.7,
      green_screen: 0.6,
      image: 0.5,
      audio: 0.4,
    };

    return importanceMap[demand.contentTypeId] ?? 0.5;
  }

  /**
   * Score based on demand velocity.
   * How fast is demand growing for this type?
   */
  private async scoreVelocity(
    orgId: string,
    _demand: GenerationDemand,
  ): Promise<number> {
    // Get recent jobs for this content type
    const recentJobs = await db
      .select({ count: count() })
      .from(generationJobSchema)
      .where(
        and(
          eq(generationJobSchema.orgId, orgId),
          sql`${generationJobSchema.createdAt} > NOW() - INTERVAL '7 days'`,
        ),
      );

    const jobCount = recentJobs[0]?.count ?? 0;

    // More recent jobs = higher velocity = higher priority
    // Normalize: 0 jobs = 0.1, 10+ jobs = 1.0
    return Math.min(1, 0.1 + (jobCount / 10) * 0.9);
  }

  /**
   * Score based on content freshness.
   * Stale content needs replacement.
   */
  private async scoreFreshness(
    orgId: string,
    demand: GenerationDemand,
  ): Promise<number> {
    const inventoryEngine = getInventoryEngine();
    const freshness = await inventoryEngine.calculateFreshness(orgId, demand.contentTypeId);

    // Low freshness = high priority
    return 1 - freshness;
  }

  /**
   * Score based on diversity contribution.
   * Content that improves diversity gets priority.
   */
  private async scoreDiversity(
    orgId: string,
    _demand: GenerationDemand,
  ): Promise<number> {
    const diversityEngine = getDiversityEngine();
    const imbalances = await diversityEngine.detectImbalances(orgId);

    // Check if this demand contributes to diversity
    const relevantImbalances = imbalances.filter(
      i => i.severity === 'critical' || i.severity === 'high',
    );

    if (relevantImbalances.length === 0) return 0.3; // No urgency

    // More critical imbalances = higher priority
    return Math.min(1, 0.3 + (relevantImbalances.length / 5) * 0.7);
  }

  /**
   * Score based on generation cost.
   * Cheaper generation = higher priority (more bang for buck).
   */
  private async scoreCost(
    _orgId: string,
    demand: GenerationDemand,
  ): Promise<number> {
    // Cost efficiency: cheaper = higher score
    // This is a simplified version - in production, would look at actual model costs
    const costMap: Record<string, number> = {
      image: 0.9,    // Cheapest
      audio: 0.8,
      slideshow: 0.7,
      reel: 0.5,
      talking_head: 0.4,
      ugc: 0.3,
      green_screen: 0.3,
    };

    return costMap[demand.contentTypeId] ?? 0.5;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Determine priority from weighted score.
   */
  private determinePriority(weighted: number): DemandPriorityScore['priority'] {
    if (weighted >= this.config.priorityThresholds.critical) return 'critical';
    if (weighted >= this.config.priorityThresholds.high) return 'high';
    if (weighted >= this.config.priorityThresholds.medium) return 'medium';
    return 'low';
  }

  /**
   * Generate reasoning for the score.
   */
  private generateReasoning(
    demand: GenerationDemand,
    scores: DemandPriorityScore['scores'],
    weighted: number,
  ): string[] {
    const reasoning: string[] = [];

    if (scores.deficit > 0.7) {
      reasoning.push(`Critical inventory gap (${Math.round(scores.deficit * 100)}% deficit)`);
    }

    if (scores.importance > 0.8) {
      reasoning.push(`High-value content type (${demand.contentType})`);
    }

    if (scores.freshness > 0.7) {
      reasoning.push('Existing content is stale');
    }

    if (scores.diversity > 0.6) {
      reasoning.push('Improves content diversity');
    }

    if (scores.cost > 0.7) {
      reasoning.push('Cost-effective generation');
    }

    if (reasoning.length === 0) {
      reasoning.push(`Standard priority (${Math.round(weighted * 100)}% score)`);
    }

    return reasoning;
  }

  /**
   * Get prioritized generation plan.
   * Returns demands grouped by priority with batch sizes.
   */
  async getGenerationPlan(
    orgId: string,
    maxBatchSize: number = 50,
  ): Promise<{
    critical: Array<{ demand: GenerationDemand; batchSize: number }>;
    high: Array<{ demand: GenerationDemand; batchSize: number }>;
    medium: Array<{ demand: GenerationDemand; batchSize: number }>;
    low: Array<{ demand: GenerationDemand; batchSize: number }>;
    totalEstimatedCost: number;
  }> {
    const prioritized = await this.prioritizeAll(orgId);

    const plan = {
      critical: [] as Array<{ demand: GenerationDemand; batchSize: number }>,
      high: [] as Array<{ demand: GenerationDemand; batchSize: number }>,
      medium: [] as Array<{ demand: GenerationDemand; batchSize: number }>,
      low: [] as Array<{ demand: GenerationDemand; batchSize: number }>,
      totalEstimatedCost: 0,
    };

    for (const score of prioritized) {
      // Get the original demand
      const demandEngine = getDemandEngine();
      const demands = await demandEngine.generateDemand(orgId);
      const demand = demands.find(d => d.id === score.demandId);

      if (!demand) continue;

      // Calculate batch size based on priority
      let batchSize = maxBatchSize;
      if (score.priority === 'critical') batchSize = maxBatchSize;
      else if (score.priority === 'high') batchSize = Math.round(maxBatchSize * 0.75);
      else if (score.priority === 'medium') batchSize = Math.round(maxBatchSize * 0.5);
      else batchSize = Math.round(maxBatchSize * 0.25);

      // Cap at demand count
      batchSize = Math.min(batchSize, demand.count);

      // Estimate cost (simplified)
      const estimatedCostPerAsset = 0.05; // $0.05 per asset average
      const estimatedCost = batchSize * estimatedCostPerAsset;

      const entry = { demand, batchSize };
      plan[score.priority].push(entry);
      plan.totalEstimatedCost += estimatedCost;
    }

    return plan;
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: DemandPrioritizer | null = null;

export function getDemandPrioritizer(
  config?: Partial<PrioritizationConfig>,
): DemandPrioritizer {
  if (!_instance) {
    _instance = new DemandPrioritizer(config);
  }
  return _instance;
}

export function resetDemandPrioritizer(): void {
  _instance = null;
}
