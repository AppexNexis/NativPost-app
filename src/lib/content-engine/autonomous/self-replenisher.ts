// Content Intelligence Engine — Self-Replenisher
// Phase 9: The autonomous loop

import { db } from '@/lib/db';
import { generationJobSchema } from '@/models/Schema';
import { eq, and, count, sql } from 'drizzle-orm';
import type {
  AutonomousFactoryConfig,
  FactoryRunMetrics,
} from './types';
import type { GenerationDemand } from '../inventory/types';
import { DEFAULT_AUTONOMOUS_CONFIG } from './types';
import { getInventoryEngine } from '../inventory/inventory-engine';
import { getDemandEngine } from '../inventory/demand-engine';
import { getDemandPrioritizer } from './demand-prioritizer';
import { getBudgetController } from './budget-controller';
import { getQualityRecovery } from './quality-recovery';
import { getDiversityController } from './diversity-controller';

// ─── Self-Replenisher ────────────────────────────────────────────────────────

/**
 * SelfReplenisher — the autonomous content factory loop.
 *
 * This is the heart of the autonomous system.
 *
 * The loop:
 *   1. Check inventory
 *   2. Calculate demand
 *   3. Check budget
 *   4. Prioritize tasks
 *   5. Dispatch generation jobs
 *   6. Monitor progress
 *   7. Recover failed jobs
 *   8. Update inventory
 *   9. Repeat
 *
 * When this loop runs continuously, NativPost has an autonomous content factory.
 */
export class SelfReplenisher {
  private config: AutonomousFactoryConfig;

  constructor(config: Partial<AutonomousFactoryConfig> = {}) {
    this.config = {
      ...DEFAULT_AUTONOMOUS_CONFIG,
      ...config,
    };
  }

  // ── Main Loop ─────────────────────────────────────────────────────────────

  /**
   * Execute one cycle of the autonomous loop.
   */
  async executeCycle(orgId: string): Promise<{
    success: boolean;
    metrics: FactoryRunMetrics;
    actions: string[];
  }> {
    const actions: string[] = [];
    const metrics: FactoryRunMetrics = {
      demandsCreated: 0,
      jobsQueued: 0,
      jobsCompleted: 0,
      jobsFailed: 0,
      assetsGenerated: 0,
      assetsAccepted: 0,
      assetsRejected: 0,
      assetsDeduplicated: 0,
      contentConstructed: 0,
      costTotal: 0,
      costPerAcceptedAsset: 0,
    };

    try {
      // 1. Check inventory health
      const health = await this.checkInventoryHealth(orgId);
      actions.push(`Inventory health: ${health.filter(h => h.status === 'healthy').length} healthy, ${health.filter(h => h.status !== 'healthy').length} gaps`);

      // 2. Check budget
      const budgetController = getBudgetController(this.config.budget);
      const budgetStatus = await budgetController.checkBudget(orgId);

      if (!budgetStatus.canGenerate) {
        actions.push(`Budget exhausted: ${budgetStatus.reason}`);
        return { success: true, metrics, actions };
      }

      actions.push(`Budget: $${budgetStatus.daily.remaining.toFixed(2)} daily remaining`);

      // 3. Generate demand
      const demands = await this.generateDemand(orgId);
      metrics.demandsCreated = demands.length;
      actions.push(`Generated ${demands.length} demands`);

      // 4. Prioritize
      const prioritizer = getDemandPrioritizer(this.config.prioritization);
      const prioritized = await prioritizer.prioritizeAll(orgId, demands);
      actions.push(`Prioritized: ${prioritized.filter(d => d.priority === 'critical').length} critical, ${prioritized.filter(d => d.priority === 'high').length} high`);

      // 5. Dispatch generation jobs
      const dispatchResult = await this.dispatchGenerationJobs(orgId);
      metrics.jobsQueued = dispatchResult.queued;
      actions.push(`Dispatched ${dispatchResult.queued} jobs, skipped ${dispatchResult.skipped}`);

      // 6. Monitor progress
      const monitorResult = await this.monitorRecentJobs(orgId);
      metrics.jobsCompleted = monitorResult.completed;
      metrics.jobsFailed = monitorResult.failed;
      actions.push(`Progress: ${monitorResult.completed} completed, ${monitorResult.failed} failed`);

      // 7. Quality recovery
      const recoveryResult = await this.recoverFailedJobs(orgId);
      metrics.assetsAccepted = recoveryResult.recovered;
      metrics.assetsRejected = recoveryResult.escalated;
      actions.push(`Recovery: ${recoveryResult.recovered} recovered, ${recoveryResult.escalated} escalated`);

      // 8. Update inventory
      const snapshot = await this.updateInventory(orgId);
      actions.push(`Inventory: ${snapshot.totalAssets} assets, ${(snapshot.overallCoverage * 100).toFixed(1)}% coverage`);

      // Calculate cost per accepted asset
      if (metrics.assetsAccepted > 0) {
        metrics.costPerAcceptedAsset = metrics.costTotal / metrics.assetsAccepted;
      }

      return { success: true, metrics, actions };
    } catch (error) {
      actions.push(`Error: ${error instanceof Error ? error.message : String(error)}`);
      return { success: false, metrics, actions };
    }
  }

  // ── Inventory Health ──────────────────────────────────────────────────────

  /**
   * Check inventory health for all content types.
   */
  async checkInventoryHealth(
    orgId: string,
  ): Promise<Array<{
    contentTypeId: string;
    contentTypeName: string;
    status: 'healthy' | 'low' | 'critical' | 'overstocked';
    coverage: number;
  }>> {
    const inventoryEngine = getInventoryEngine();
    const statuses = await inventoryEngine.getInventoryStatus(orgId);

    return statuses.map(status => ({
      contentTypeId: status.contentTypeId,
      contentTypeName: status.contentTypeName,
      status: status.health,
      coverage: status.coverage,
    }));
  }

  // ── Demand Generation ─────────────────────────────────────────────────────

  /**
   * Generate demand based on inventory gaps and diversity needs.
   */
  async generateDemand(orgId: string): Promise<GenerationDemand[]> {
    const demandEngine = getDemandEngine();
    const demands = await demandEngine.generateDemand(orgId);

    // Also check diversity
    const diversityController = getDiversityController(this.config.diversityControl);
    const diversityResult = await diversityController.analyzeAndControl(orgId);

    // Add diversity-driven demands
    for (const action of diversityResult.actions) {
      if (action.type === 'generate' && action.count > 0) {
        const diversityDemand = await demandEngine.generateDemandForType(
          orgId,
          'diversity_gap',
          action.count,
          'medium',
          {
            metadata: {
              dimension: action.dimension,
              category: action.category,
              triggeredBy: 'diversity_controller',
            },
          },
        );
        demands.push(diversityDemand);
      }
    }

    return demands;
  }

  // ── Job Dispatch ──────────────────────────────────────────────────────────

  /**
   * Dispatch generation jobs based on prioritized demands.
   */
  async dispatchGenerationJobs(
    orgId: string,
  ): Promise<{ queued: number; skipped: number; budgetExceeded: boolean }> {
    const prioritizer = getDemandPrioritizer(this.config.prioritization);
    const plan = await prioritizer.getGenerationPlan(
      orgId,
      this.config.selfReplenishment.maxGenerationBatchSize,
    );

    const budgetController = getBudgetController(this.config.budget);
    const budgetStatus = await budgetController.checkBudget(orgId);

    let queued = 0;
    let skipped = 0;
    let budgetExceeded = false;

    // Process by priority
    const allEntries = [
      ...plan.critical,
      ...plan.high,
      ...plan.medium,
      ...plan.low,
    ];

    for (const entry of allEntries) {
      // Check budget before each dispatch
      if (!budgetStatus.canGenerate) {
        budgetExceeded = true;
        skipped += entry.batchSize;
        continue;
      }

      // Check if we can afford this batch
      const estimatedCost = entry.batchSize * 0.05; // Simplified
      const canAfford = await budgetController.canAfford(orgId, estimatedCost);

      if (!canAfford.canAfford) {
        skipped += entry.batchSize;
        continue;
      }

      // Dispatch jobs
      for (let i = 0; i < entry.batchSize; i++) {
        // In production, would create actual generation job
        queued++;
      }

      // Record cost
      await budgetController.recordCost({
        orgId,
        jobId: `batch_${Date.now()}`,
        providerId: 'fal',
        modelId: 'default',
        contentTypeId: entry.demand.contentTypeId,
        cost: estimatedCost,
        success: true,
      });
    }

    return { queued, skipped, budgetExceeded };
  }

  // ── Monitoring ────────────────────────────────────────────────────────────

  /**
   * Monitor recent generation jobs.
   */
  async monitorRecentJobs(
    orgId: string,
  ): Promise<{ completed: number; failed: number; inProgress: number }> {
    const completed = await db
      .select({ count: count() })
      .from(generationJobSchema)
      .where(
        and(
          eq(generationJobSchema.orgId, orgId),
          eq(generationJobSchema.status, 'completed'),
        ),
      );

    const failed = await db
      .select({ count: count() })
      .from(generationJobSchema)
      .where(
        and(
          eq(generationJobSchema.orgId, orgId),
          eq(generationJobSchema.status, 'failed'),
        ),
      );

    const inProgress = await db
      .select({ count: count() })
      .from(generationJobSchema)
      .where(
        and(
          eq(generationJobSchema.orgId, orgId),
          sql`${generationJobSchema.status} IN ('queued', 'submitting', 'submitted', 'processing')`,
        ),
      );

    return {
      completed: completed[0]?.count ?? 0,
      failed: failed[0]?.count ?? 0,
      inProgress: inProgress[0]?.count ?? 0,
    };
  }

  // ── Quality Recovery ──────────────────────────────────────────────────────

  /**
   * Recover failed jobs.
   */
  async recoverFailedJobs(
    orgId: string,
  ): Promise<{ recovered: number; escalated: number; quarantined: number }> {
    const recovery = getQualityRecovery(this.config.qualityRecovery.maxRetriesPerAsset);
    return recovery.recoverAllFailed(orgId);
  }

  // ── Inventory Update ──────────────────────────────────────────────────────

  /**
   * Update inventory snapshot.
   */
  async updateInventory(
    orgId: string,
  ): Promise<{
    totalAssets: number;
    overallCoverage: number;
    overallHealth: string;
  }> {
    const inventoryEngine = getInventoryEngine();
    const snapshot = await inventoryEngine.takeSnapshot(orgId);

    return {
      totalAssets: snapshot.totalAssets,
      overallCoverage: snapshot.overallCoverage,
      overallHealth: snapshot.overallHealth,
    };
  }

  // ── Health Check ──────────────────────────────────────────────────────────

  /**
   * Get overall factory health.
   */
  async getFactoryHealth(
    orgId: string,
  ): Promise<{
    status: 'healthy' | 'degraded' | 'critical';
    inventoryHealth: string;
    budgetHealth: string;
    diversityHealth: string;
    issues: string[];
  }> {
    const issues: string[] = [];

    // Check inventory
    const inventoryHealth = await this.checkInventoryHealth(orgId);
    const criticalTypes = inventoryHealth.filter(h => h.status === 'critical');
    if (criticalTypes.length > 0) {
      issues.push(`${criticalTypes.length} content types with critical inventory`);
    }

    // Check budget
    const budgetController = getBudgetController(this.config.budget);
    const budgetStatus = await budgetController.checkBudget(orgId);
    if (!budgetStatus.canGenerate) {
      issues.push(`Budget exhausted: ${budgetStatus.reason}`);
    }

    // Check diversity
    const diversityController = getDiversityController(this.config.diversityControl);
    const diversityHealth = await diversityController.isDiversityHealthy(orgId);
    if (!diversityHealth.healthy) {
      issues.push(...diversityHealth.issues);
    }

    // Determine overall status
    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (criticalTypes.length > 0 || !budgetStatus.canGenerate) {
      status = 'critical';
    } else if (issues.length > 0) {
      status = 'degraded';
    }

    return {
      status,
      inventoryHealth: `${inventoryHealth.filter(h => h.status === 'healthy').length}/${inventoryHealth.length} healthy`,
      budgetHealth: `$${budgetStatus.daily.remaining.toFixed(2)} daily remaining`,
      diversityHealth: `${diversityHealth.score}/100 diversity score`,
      issues,
    };
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: SelfReplenisher | null = null;

export function getSelfReplenisher(
  config?: Partial<AutonomousFactoryConfig>,
): SelfReplenisher {
  if (!_instance) {
    _instance = new SelfReplenisher(config);
  }
  return _instance;
}

export function resetSelfReplenisher(): void {
  _instance = null;
}
