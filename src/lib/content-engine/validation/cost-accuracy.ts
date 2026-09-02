// Content Intelligence Engine — Cost Accuracy Tracker
// Phase 10: Track estimated vs actual cost accuracy

import { db } from '@/lib/db';
import { generationJobSchema, mediaAssetSchema } from '@/models/Schema';
import { eq, and, sql, count } from 'drizzle-orm';
import type { CostAccuracyReport } from './types';

// ─── Cost Accuracy Tracker ───────────────────────────────────────────────────

/**
 * CostAccuracyTracker — measures how well cost estimation predicts actual cost.
 *
 * The autonomous system needs to prove:
 *   estimated_cost vs actual_cost
 *
 * And ultimately:
 *   total_cost / usable_content
 *
 * For example:
 *   100 generations, $8.40 total
 *   83 pass quality
 *   76 become usable content
 *   4 duplicates
 *   72 net new library contents
 *
 *   Cost / net usable content = $0.1167
 */
export class CostAccuracyTracker {
  // ── Reports ───────────────────────────────────────────────────────────────

  /**
   * Generate a cost accuracy report for a period.
   */
  async generateReport(
    orgId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<CostAccuracyReport> {
    // Get all jobs in period
    const jobs = await db
      .select({
        id: generationJobSchema.id,
        providerId: generationJobSchema.providerId,
        modelId: generationJobSchema.modelId,
        estimatedCost: generationJobSchema.estimatedCost,
        actualCost: generationJobSchema.actualCost,
        status: generationJobSchema.status,
      })
      .from(generationJobSchema)
      .where(
        and(
          eq(generationJobSchema.orgId, orgId),
          sql`${generationJobSchema.createdAt} >= ${startDate}`,
          sql`${generationJobSchema.createdAt} <= ${endDate}`,
        ),
      );

    const completedJobs = jobs.filter(j => j.status === 'completed');
    const totalJobs = jobs.length;
    const totalEstimated = jobs.reduce((sum, j) => sum + (j.estimatedCost ?? 0), 0);
    const totalActual = jobs.reduce((sum, j) => sum + (j.actualCost ?? 0), 0);
    const accuracy = totalEstimated > 0
      ? Math.max(0, 100 - Math.abs(totalEstimated - totalActual) / totalEstimated * 100)
      : 0;
    const variance = totalActual - totalEstimated;

    // By provider
    const byProviderMap = new Map<string, { estimated: number; actual: number }>();
    for (const job of completedJobs) {
      if (!job.providerId) continue;
      const existing = byProviderMap.get(job.providerId) ?? { estimated: 0, actual: 0 };
      existing.estimated += job.estimatedCost ?? 0;
      existing.actual += job.actualCost ?? 0;
      byProviderMap.set(job.providerId, existing);
    }
    const byProvider = Array.from(byProviderMap.entries()).map(([providerId, costs]) => ({
      providerId,
      estimated: costs.estimated,
      actual: costs.actual,
      accuracy: costs.estimated > 0
        ? Math.max(0, 100 - Math.abs(costs.estimated - costs.actual) / costs.estimated * 100)
        : 0,
    }));

    // By model
    const byModelMap = new Map<string, { estimated: number; actual: number }>();
    for (const job of completedJobs) {
      if (!job.modelId) continue;
      const existing = byModelMap.get(job.modelId) ?? { estimated: 0, actual: 0 };
      existing.estimated += job.estimatedCost ?? 0;
      existing.actual += job.actualCost ?? 0;
      byModelMap.set(job.modelId, existing);
    }
    const byModel = Array.from(byModelMap.entries()).map(([modelId, costs]) => ({
      modelId,
      estimated: costs.estimated,
      actual: costs.actual,
      accuracy: costs.estimated > 0
        ? Math.max(0, 100 - Math.abs(costs.estimated - costs.actual) / costs.estimated * 100)
        : 0,
    }));

    // Usable content count
    const usableContentResult = await db
      .select({ count: count() })
      .from(mediaAssetSchema)
      .where(
        and(
          eq(mediaAssetSchema.orgId, orgId),
          eq(mediaAssetSchema.status, 'validated'),
          sql`${mediaAssetSchema.createdAt} >= ${startDate}`,
          sql`${mediaAssetSchema.createdAt} <= ${endDate}`,
        ),
      );
    const totalUsableContent = usableContentResult[0]?.count ?? 0;

    const costPerUsableContent = totalUsableContent > 0
      ? totalActual / totalUsableContent
      : 0;

    return {
      orgId,
      period: { start: startDate, end: endDate },
      totalJobs,
      totalEstimatedCost: totalEstimated,
      totalActualCost: totalActual,
      accuracyPercent: accuracy,
      variance,
      byProvider,
      byModel,
      costPerUsableContent,
      totalUsableContent,
      generatedAt: new Date(),
    };
  }

  // ── Real-Time Tracking ────────────────────────────────────────────────────

  /**
   * Get current month's cost per usable content.
   */
  async getCurrentMonthMetrics(orgId: string): Promise<{
    totalSpent: number;
    totalUsableContent: number;
    costPerUsableContent: number;
  }> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const report = await this.generateReport(orgId, monthStart, now);

    return {
      totalSpent: report.totalActualCost,
      totalUsableContent: report.totalUsableContent,
      costPerUsableContent: report.costPerUsableContent,
    };
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: CostAccuracyTracker | null = null;

export function getCostAccuracyTracker(): CostAccuracyTracker {
  if (!_instance) {
    _instance = new CostAccuracyTracker();
  }
  return _instance;
}

export function resetCostAccuracyTracker(): void {
  _instance = null;
}
