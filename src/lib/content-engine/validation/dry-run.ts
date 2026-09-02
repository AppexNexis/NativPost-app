// Content Intelligence Engine — Dry Run
// Phase 10: Preview what the factory would do without spending money

import type {
  DryRunConfig,
  DryRunResult,
  DryRunInventoryStatus,
  DryRunDemand,
  DryRunPrioritizedTask,
  DryRunBudgetProjection,
  DryRunModelSelection,
} from './types';
import { DEFAULT_DRY_RUN_CONFIG } from './types';
import { getInventoryEngine } from '../inventory/inventory-engine';
import { getDemandEngine } from '../inventory/demand-engine';
import { getDemandPrioritizer } from '../autonomous/demand-prioritizer';
import { getBudgetController } from '../autonomous/budget-controller';
import { getModelLearner } from '../autonomous/model-learner';

// ─── Dry Run Engine ──────────────────────────────────────────────────────────

/**
 * DryRunEngine — runs the entire autonomous decision system without spending money.
 *
 * The dashboard shows:
 *   "If enabled right now, the factory would generate 150 assets at an estimated cost of $X."
 *
 * This catches bad demand logic before any money is spent.
 */
export class DryRunEngine {
  private config: DryRunConfig;

  constructor(config: Partial<DryRunConfig> = {}) {
    this.config = {
      ...DEFAULT_DRY_RUN_CONFIG,
      ...config,
    };
  }

  // ── Dry Run Execution ─────────────────────────────────────────────────────

  /**
   * Execute a dry run.
   */
  async execute(orgId: string): Promise<DryRunResult> {
    const id = `dryrun_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = new Date();

    const warnings: string[] = [];

    // 1. Inventory status
    const inventoryStatuses = await this.getInventoryPreview(orgId);

    // 2. Demand calculation
    const demands = await this.getDemandPreview(orgId);

    // 3. Prioritization
    const prioritized = await this.getPrioritizedPreview(orgId, demands);

    // 4. Budget projection
    const budgetProjection = await this.getBudgetProjection(orgId, prioritized);

    // 5. Model selection
    const modelSelections = await this.getModelSelections(orgId, prioritized);

    // Calculate totals
    const estimatedTotalCost = modelSelections.reduce(
      (sum, sel) => sum + sel.selectedModel.estimatedCost,
      0,
    );
    const estimatedTotalJobs = prioritized.reduce(
      (sum, task) => sum + task.batchSize,
      0,
    );

    // Check for warnings
    if (budgetProjection.wouldExceedBudget) {
      warnings.push(
        `Generation would exceed daily budget: $${estimatedTotalCost.toFixed(2)} > $${budgetProjection.dailyRemaining.toFixed(2)} remaining`,
      );
    }

    const demandsWithoutPriorities = prioritized.filter(t => t.priority === 'low').length;
    if (demandsWithoutPriorities > prioritized.length * 0.8) {
      warnings.push(
        `${demandsWithoutPriorities} low-priority demands — consider tightening prioritization`,
      );
    }

    const completedAt = new Date();

    return {
      id,
      orgId,
      startedAt,
      completedAt,
      preview: {
        inventoryStatus: inventoryStatuses,
        demands: demands.map(d => ({
          id: d.id,
          contentTypeId: d.contentTypeId,
          count: d.count,
          priority: d.priority,
          reason: 'Inventory gap',
        })),
        prioritizedTasks: prioritized,
        budgetProjection,
        modelSelections,
        estimatedTotalCost,
        estimatedTotalJobs,
        warnings,
      },
      wouldHaveGenerated: estimatedTotalJobs > 0 && !budgetProjection.wouldExceedBudget,
      blockedReason: budgetProjection.wouldExceedBudget
        ? 'Daily budget would be exceeded'
        : null,
    };
  }

  // ── Preview Components ────────────────────────────────────────────────────

  /**
   * Preview inventory status.
   */
  private async getInventoryPreview(orgId: string): Promise<DryRunInventoryStatus[]> {
    const inventoryEngine = getInventoryEngine();
    const statuses = await inventoryEngine.getInventoryStatus(orgId);

    return statuses.map(status => ({
      contentTypeId: status.contentTypeId,
      contentTypeName: status.contentTypeName,
      currentCount: status.currentCount,
      targetCount: status.targetCount,
      coverage: status.coverage,
      health: status.health,
      wouldGenerate: Math.max(0, status.targetCount - status.currentCount),
    }));
  }

  /**
   * Preview demand calculation.
   */
  private async getDemandPreview(orgId: string): Promise<DryRunDemand[]> {
    const demandEngine = getDemandEngine();
    const demands = await demandEngine.generateDemand(orgId);

    return demands.map(demand => ({
      id: demand.id,
      contentTypeId: demand.contentTypeId,
      count: demand.count,
      priority: demand.priority,
      reason: demand.metadata?.inventoryStatus ?? 'inventory gap',
    }));
  }

  /**
   * Preview prioritization.
   */
  private async getPrioritizedPreview(
    orgId: string,
    _demands: DryRunDemand[],
  ): Promise<DryRunPrioritizedTask[]> {
    const prioritizer = getDemandPrioritizer();
    const scores = await prioritizer.prioritizeAll(orgId);

    return scores.map(score => ({
      demandId: score.demandId,
      contentTypeId: score.contentTypeId,
      priority: score.priority,
      score: score.weighted,
      batchSize: this.calculateBatchSize(score.priority),
      estimatedCost: this.calculateBatchSize(score.priority) * 0.05,
      reasoning: score.reasoning,
    }));
  }

  /**
   * Preview budget projection.
   */
  private async getBudgetProjection(
    orgId: string,
    tasks: DryRunPrioritizedTask[],
  ): Promise<DryRunBudgetProjection> {
    const budgetController = getBudgetController();
    const status = await budgetController.checkBudget(orgId);

    const estimatedTotalCost = tasks.reduce(
      (sum, task) => sum + task.estimatedCost,
      0,
    );

    return {
      dailyBudget: status.daily.budget,
      dailySpent: status.daily.spent,
      dailyRemaining: status.daily.remaining,
      monthlyBudget: status.monthly.budget,
      monthlySpent: status.monthly.spent,
      monthlyRemaining: status.monthly.remaining,
      estimatedDailySpendAfter: status.daily.spent + estimatedTotalCost,
      wouldExceedBudget:
        status.daily.spent + estimatedTotalCost > status.daily.budget,
    };
  }

  /**
   * Preview model selection.
   */
  private async getModelSelections(
    orgId: string,
    tasks: DryRunPrioritizedTask[],
  ): Promise<DryRunModelSelection[]> {
    const learner = getModelLearner();
    const contentTypes = new Set(tasks.map(t => t.contentTypeId));

    const selections: DryRunModelSelection[] = [];

    for (const contentTypeId of contentTypes) {
      const recommendation = await learner.getRecommendations(orgId, contentTypeId, 50);

      if (recommendation.recommendations.length === 0) {
        // Default fallback
        selections.push({
          contentTypeId,
          selectedModel: {
            providerId: 'fal',
            modelId: 'default',
            estimatedCost: 2.50,
            estimatedSuccessRate: 0.75,
          },
          alternatives: [],
        });
        continue;
      }

      const selected = recommendation.recommendations[0]!;
      const alternatives = recommendation.recommendations.slice(1, 4).map(alt => ({
        providerId: alt.providerId,
        modelId: alt.modelId,
        estimatedCost: alt.estimatedCost,
        estimatedSuccessRate: alt.estimatedSuccessRate,
      }));

      selections.push({
        contentTypeId,
        selectedModel: {
          providerId: selected.providerId,
          modelId: selected.modelId,
          estimatedCost: selected.estimatedCost,
          estimatedSuccessRate: selected.estimatedSuccessRate,
        },
        alternatives,
      });
    }

    return selections;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Calculate batch size based on priority.
   */
  private calculateBatchSize(priority: string): number {
    const maxBatch = this.config.maxPreviewJobs;
    switch (priority) {
      case 'critical':
        return maxBatch;
      case 'high':
        return Math.round(maxBatch * 0.75);
      case 'medium':
        return Math.round(maxBatch * 0.5);
      case 'low':
        return Math.round(maxBatch * 0.25);
      default:
        return Math.round(maxBatch * 0.1);
    }
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: DryRunEngine | null = null;

export function getDryRunEngine(config?: Partial<DryRunConfig>): DryRunEngine {
  if (!_instance) {
    _instance = new DryRunEngine(config);
  }
  return _instance;
}

export function resetDryRunEngine(): void {
  _instance = null;
}
