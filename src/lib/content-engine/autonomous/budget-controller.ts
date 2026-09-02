// Content Intelligence Engine — Budget Controller
// Phase 9: Cost management with hard stops

import { db } from '@/lib/db';
import { generationJobSchema } from '@/models/Schema';
import { eq, and, sql, sum } from 'drizzle-orm';
import type {
  BudgetConfig,
  BudgetStatus,
  BudgetPeriod,
  CostRecord,
} from './types';
import { DEFAULT_BUDGET_CONFIG } from './types';

// ─── Budget Controller ───────────────────────────────────────────────────────

/**
 * BudgetController — manages generation costs with hard stops.
 *
 * This is the economic governor of the factory.
 *
 * Daily budget: $25
 * Spent: $21.40
 * Remaining: $3.60
 *
 * Factory automatically reduces generation when approaching limits.
 */
export class BudgetController {
  private config: BudgetConfig;

  constructor(config: Partial<BudgetConfig> = {}) {
    this.config = {
      ...DEFAULT_BUDGET_CONFIG,
      ...config,
    };
  }

  // ── Budget Check ──────────────────────────────────────────────────────────

  /**
   * Check if we can still generate content.
   */
  async checkBudget(_orgId: string): Promise<BudgetStatus> {
    const orgId = _orgId;
    const daily = await this.getDailyBudget(orgId);
    const monthly = await this.getMonthlyBudget(orgId);
    const byProvider = await this.getProviderBudgets(orgId);
    const byModel = await this.getModelBudgets(orgId);
    const byContentType = await this.getContentTypeBudgets(orgId);

    // Check if any budget is exceeded
    let canGenerate = true;
    let reason: string | undefined;

    if (daily.utilization >= this.config.hardStopThreshold) {
      canGenerate = false;
      reason = `Daily budget exhausted (${Math.round(daily.utilization * 100)}%)`;
    } else if (monthly.utilization >= this.config.hardStopThreshold) {
      canGenerate = false;
      reason = `Monthly budget exhausted (${Math.round(monthly.utilization * 100)}%)`;
    }

    // Check provider budgets
    for (const [providerId, providerBudget] of byProvider) {
      if (providerBudget.utilization >= this.config.hardStopThreshold) {
        canGenerate = false;
        reason = `Provider ${providerId} budget exhausted`;
        break;
      }
    }

    return {
      daily,
      monthly,
      byProvider,
      byModel,
      byContentType,
      canGenerate,
      reason,
    };
  }

  /**
   * Get remaining budget for a specific provider.
   */
  async getProviderRemaining(orgId: string, providerId: string): Promise<number> {
    const budgets = await this.getProviderBudgets(orgId);
    const budget = budgets.get(providerId);

    return budget?.remaining ?? this.config.perProviderBudget;
  }

  /**
   * Get remaining budget for a specific model.
   */
  async getModelRemaining(orgId: string, modelId: string): Promise<number> {
    const budgets = await this.getModelBudgets(orgId);
    const budget = budgets.get(modelId);

    return budget?.remaining ?? this.config.perModelBudget;
  }

  /**
   * Check if a specific generation would exceed budget.
   */
  async canAfford(
    orgId: string,
    estimatedCost: number,
    providerId?: string,
    modelId?: string,
  ): Promise<{ canAfford: boolean; reason?: string }> {
    const budgetStatus = await this.checkBudget(orgId);

    if (!budgetStatus.canGenerate) {
      return { canAfford: false, reason: budgetStatus.reason };
    }

    // Check if this cost would exceed daily budget
    if (budgetStatus.daily.remaining < estimatedCost) {
      return {
        canAfford: false,
        reason: `Insufficient daily budget ($${budgetStatus.daily.remaining.toFixed(2)} remaining)`,
      };
    }

    // Check provider budget
    if (providerId) {
      const providerRemaining = budgetStatus.byProvider.get(providerId)?.remaining ?? this.config.perProviderBudget;
      if (providerRemaining < estimatedCost) {
        return {
          canAfford: false,
          reason: `Insufficient provider budget ($${providerRemaining.toFixed(2)} remaining for ${providerId})`,
        };
      }
    }

    // Check model budget
    if (modelId) {
      const modelRemaining = budgetStatus.byModel.get(modelId)?.remaining ?? this.config.perModelBudget;
      if (modelRemaining < estimatedCost) {
        return {
          canAfford: false,
          reason: `Insufficient model budget ($${modelRemaining.toFixed(2)} remaining for ${modelId})`,
        };
      }
    }

    return { canAfford: true };
  }

  // ── Cost Recording ────────────────────────────────────────────────────────

  /**
   * Record a generation cost.
   */
  async recordCost(record: Omit<CostRecord, 'id' | 'recordedAt'>): Promise<void> {
    // In production, this would insert into a cost_tracking table
    // For now, we'll use generation_job metadata
    console.log(`[BudgetController] Recording cost: $${record.cost} for ${record.providerId}/${record.modelId}`);
  }

  // ── Budget Periods ────────────────────────────────────────────────────────

  /**
   * Get daily budget status.
   */
  private async getDailyBudget(orgId: string): Promise<BudgetPeriod> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await db
      .select({ totalCost: sum(generationJobSchema.actualCost) })
      .from(generationJobSchema)
      .where(
        and(
          eq(generationJobSchema.orgId, orgId),
          sql`${generationJobSchema.createdAt} >= ${today}`,
          eq(generationJobSchema.status, 'completed'),
        ),
      );

    const spent = Number(result[0]?.totalCost ?? 0);
    const budget = this.config.dailyBudget;
    const remaining = Math.max(0, budget - spent);
    const utilization = budget > 0 ? spent / budget : 0;

    // Project daily spend based on current rate
    const hoursElapsed = (Date.now() - today.getTime()) / (1000 * 60 * 60);
    const projectedDaily = hoursElapsed > 0 ? (spent / hoursElapsed) * 24 : 0;

    return {
      budget,
      spent,
      remaining,
      utilization,
      projectedDaily,
      daysUntilReset: 1,
    };
  }

  /**
   * Get monthly budget status.
   */
  private async getMonthlyBudget(orgId: string): Promise<BudgetPeriod> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const result = await db
      .select({ totalCost: sum(generationJobSchema.actualCost) })
      .from(generationJobSchema)
      .where(
        and(
          eq(generationJobSchema.orgId, orgId),
          sql`${generationJobSchema.createdAt} >= ${monthStart}`,
          eq(generationJobSchema.status, 'completed'),
        ),
      );

    const spent = Number(result[0]?.totalCost ?? 0);
    const budget = this.config.monthlyBudget;
    const remaining = Math.max(0, budget - spent);
    const utilization = budget > 0 ? spent / budget : 0;

    // Days until month end
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const daysUntilReset = Math.ceil((monthEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // Project monthly spend
    const daysElapsed = (now.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24);
    const projectedDaily = daysElapsed > 0 ? spent / daysElapsed : 0;

    return {
      budget,
      spent,
      remaining,
      utilization,
      projectedDaily,
      daysUntilReset,
    };
  }

  /**
   * Get provider budgets.
   */
  private async getProviderBudgets(
    orgId: string,
  ): Promise<Map<string, BudgetPeriod>> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const result = await db
      .select({
        providerId: generationJobSchema.providerId,
        totalCost: sum(generationJobSchema.actualCost),
      })
      .from(generationJobSchema)
      .where(
        and(
          eq(generationJobSchema.orgId, orgId),
          sql`${generationJobSchema.createdAt} >= ${monthStart}`,
          eq(generationJobSchema.status, 'completed'),
        ),
      )
      .groupBy(generationJobSchema.providerId);

    const budgets = new Map<string, BudgetPeriod>();

    for (const row of result) {
      if (!row.providerId) continue;

      const spent = Number(row.totalCost ?? 0);
      const budget = this.config.perProviderBudget;
      const remaining = Math.max(0, budget - spent);
      const utilization = budget > 0 ? spent / budget : 0;

      budgets.set(row.providerId, {
        budget,
        spent,
        remaining,
        utilization,
        projectedDaily: 0,
        daysUntilReset: Math.ceil(
          (new Date(now.getFullYear(), now.getMonth() + 1, 0).getTime() - now.getTime()) /
          (1000 * 60 * 60 * 24),
        ),
      });
    }

    return budgets;
  }

  /**
   * Get model budgets.
   */
  private async getModelBudgets(
    orgId: string,
  ): Promise<Map<string, BudgetPeriod>> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const result = await db
      .select({
        modelId: generationJobSchema.modelId,
        totalCost: sum(generationJobSchema.actualCost),
      })
      .from(generationJobSchema)
      .where(
        and(
          eq(generationJobSchema.orgId, orgId),
          sql`${generationJobSchema.createdAt} >= ${monthStart}`,
          eq(generationJobSchema.status, 'completed'),
        ),
      )
      .groupBy(generationJobSchema.modelId);

    const budgets = new Map<string, BudgetPeriod>();

    for (const row of result) {
      if (!row.modelId) continue;

      const spent = Number(row.totalCost ?? 0);
      const budget = this.config.perModelBudget;
      const remaining = Math.max(0, budget - spent);
      const utilization = budget > 0 ? spent / budget : 0;

      budgets.set(row.modelId, {
        budget,
        spent,
        remaining,
        utilization,
        projectedDaily: 0,
        daysUntilReset: Math.ceil(
          (new Date(now.getFullYear(), now.getMonth() + 1, 0).getTime() - now.getTime()) /
          (1000 * 60 * 60 * 24),
        ),
      });
    }

    return budgets;
  }

  /**
   * Get content type budgets.
   */
  private async getContentTypeBudgets(
    _orgId: string,
  ): Promise<Map<string, BudgetPeriod>> {
    // Simplified: return empty map for now
    // In production, would track costs by content type
    return new Map();
  }

  // ── Budget Adjustment ─────────────────────────────────────────────────────

  /**
   * Get recommended batch size based on remaining budget.
   */
  getRecommendedBatchSize(
    remainingBudget: number,
    costPerAsset: number,
    maxBatchSize: number,
  ): number {
    if (costPerAsset <= 0) return maxBatchSize;

    const affordable = Math.floor(remainingBudget / costPerAsset);
    return Math.min(affordable, maxBatchSize);
  }

  /**
   * Get budget utilization alert level.
   */
  getAlertLevel(utilization: number): 'normal' | 'warning' | 'critical' | 'exceeded' {
    if (utilization >= this.config.hardStopThreshold) return 'exceeded';
    if (utilization >= this.config.alertThreshold) return 'critical';
    if (utilization >= this.config.alertThreshold * 0.8) return 'warning';
    return 'normal';
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: BudgetController | null = null;

export function getBudgetController(
  config?: Partial<BudgetConfig>,
): BudgetController {
  if (!_instance) {
    _instance = new BudgetController(config);
  }
  return _instance;
}

export function resetBudgetController(): void {
  _instance = null;
}
