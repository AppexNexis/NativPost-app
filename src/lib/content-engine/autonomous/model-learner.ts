// Content Intelligence Engine — Model Learner
// Phase 9: Optimize routing based on cost per accepted asset

import { db } from '@/lib/db';
import { generationJobSchema } from '@/models/Schema';
import { eq, and, sql } from 'drizzle-orm';
import type {
  ModelPerformance,
  RoutingRecommendation,
} from './types';

// ─── Model Learner ───────────────────────────────────────────────────────────

/**
 * ModelLearner — learns which models produce the best results.
 *
 * Instead of routing by lowest cost, it routes by:
 *   lowest cost per accepted asset
 *
 * Model A: $0.08, 94% usable → $0.085/accepted
 * Model B: $0.04, 61% usable → $0.066/accepted
 * Model C: $0.12, 98% usable → $0.122/accepted
 *
 * Model B wins on cost per accepted asset.
 */
export class ModelLearner {
  // ── Performance Tracking ──────────────────────────────────────────────────

  /**
   * Get performance metrics for all models.
   */
  async getModelPerformance(
    orgId: string,
    contentTypeId?: string,
  ): Promise<ModelPerformance[]> {
    // Get all jobs with their attempts
    const jobs = await db
      .select({
        providerId: generationJobSchema.providerId,
        modelId: generationJobSchema.modelId,
        status: generationJobSchema.status,
        actualCost: generationJobSchema.actualCost,
        createdAt: generationJobSchema.createdAt,
      })
      .from(generationJobSchema)
      .where(
        and(
          eq(generationJobSchema.orgId, orgId),
          sql`${generationJobSchema.status} IN ('completed', 'failed')`,
        ),
      );

    // Group by provider + model
    const grouped = new Map<string, typeof jobs>();
    for (const job of jobs) {
      if (!job.providerId || !job.modelId) continue;

      const key = `${job.providerId}:${job.modelId}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(job);
    }

    // Calculate performance for each model
    const performances: ModelPerformance[] = [];

    for (const [key, modelJobs] of grouped) {
      const [providerId, modelId] = key.split(':');

      const totalGenerations = modelJobs.length;
      const successfulGenerations = modelJobs.filter(j => j.status === 'completed').length;
      const failedGenerations = modelJobs.filter(j => j.status === 'failed').length;
      const successRate = totalGenerations > 0 ? successfulGenerations / totalGenerations : 0;

      const totalCost = modelJobs.reduce((sum, j) => sum + Number(j.actualCost ?? 0), 0);
      const averageCost = totalGenerations > 0 ? totalCost / totalGenerations : 0;

      // Cost per accepted asset (assuming 80% of successful become accepted)
      const acceptedRate = successRate * 0.8;
      const costPerAcceptedAsset = acceptedRate > 0 ? averageCost / acceptedRate : averageCost;

      // Calculate trends
      const trends = this.calculateTrends(modelJobs);

      performances.push({
        providerId: providerId!,
        modelId: modelId!,
        contentTypeId: contentTypeId ?? 'all',
        metrics: {
          totalGenerations,
          successfulGenerations,
          failedGenerations,
          successRate,
          averageCost,
          costPerAcceptedAsset,
          averageQualityScore: 0.8, // Simplified
          averageGenerationTime: 0, // Would need to calculate from attempts
        },
        trends,
        lastUpdated: new Date(),
      });
    }

    // Sort by cost per accepted asset (best first)
    performances.sort((a, b) => a.metrics.costPerAcceptedAsset - b.metrics.costPerAcceptedAsset);

    return performances;
  }

  /**
   * Get routing recommendations for a content type.
   */
  async getRecommendations(
    orgId: string,
    contentTypeId: string,
    count: number,
  ): Promise<RoutingRecommendation> {
    const performances = await this.getModelPerformance(orgId, contentTypeId);

    // Take top 5 models
    const topModels = performances.slice(0, 5);

    const recommendations = topModels.map((perf, index) => ({
      providerId: perf.providerId,
      modelId: perf.modelId,
      score: 1 - (index / topModels.length), // 1.0 for first, decreasing
      reason: `Cost per accepted: $${perf.metrics.costPerAcceptedAsset.toFixed(3)}, Success rate: ${(perf.metrics.successRate * 100).toFixed(1)}%`,
      estimatedCost: perf.metrics.costPerAcceptedAsset * count,
      estimatedSuccessRate: perf.metrics.successRate,
    }));

    return {
      contentTypeId,
      recommendations,
      generatedAt: new Date(),
    };
  }

  /**
   * Get the best model for a specific content type.
   */
  async getBestModel(
    orgId: string,
    contentTypeId: string,
  ): Promise<{ providerId: string; modelId: string; score: number } | null> {
    const recommendations = await this.getRecommendations(orgId, contentTypeId, 1);

    if (recommendations.recommendations.length === 0) return null;

    const best = recommendations.recommendations[0]!;
    return {
      providerId: best.providerId,
      modelId: best.modelId,
      score: best.score,
    };
  }

  // ── Trend Analysis ────────────────────────────────────────────────────────

  /**
   * Calculate trends for a model.
   */
  private calculateTrends(
    jobs: Array<{
      status: string;
      actualCost: number | null;
      createdAt: Date;
    }>,
  ): ModelPerformance['trends'] {
    if (jobs.length < 10) {
      return {
        successRateTrend: 'stable',
        costTrend: 'stable',
        qualityTrend: 'stable',
      };
    }

    // Split into halves
    const midpoint = Math.floor(jobs.length / 2);
    const firstHalf = jobs.slice(0, midpoint);
    const secondHalf = jobs.slice(midpoint);

    // Success rate trend
    const firstSuccessRate = firstHalf.filter(j => j.status === 'completed').length / firstHalf.length;
    const secondSuccessRate = secondHalf.filter(j => j.status === 'completed').length / secondHalf.length;
    const successRateTrend =
      secondSuccessRate > firstSuccessRate * 1.05 ? 'improving' :
      secondSuccessRate < firstSuccessRate * 0.95 ? 'declining' :
      'stable';

    // Cost trend
    const firstAvgCost = firstHalf.reduce((sum, j) => sum + Number(j.actualCost ?? 0), 0) / firstHalf.length;
    const secondAvgCost = secondHalf.reduce((sum, j) => sum + Number(j.actualCost ?? 0), 0) / secondHalf.length;
    const costTrend =
      secondAvgCost < firstAvgCost * 0.95 ? 'decreasing' :
      secondAvgCost > firstAvgCost * 1.05 ? 'increasing' :
      'stable';

    return {
      successRateTrend,
      costTrend,
      qualityTrend: 'stable', // Would need quality scores
    };
  }

  // ── Learning ──────────────────────────────────────────────────────────────

  /**
   * Update model performance based on new job completion.
   */
  async recordJobResult(
    _orgId: string,
    providerId: string,
    modelId: string,
    success: boolean,
    cost: number,
    qualityScore?: number,
  ): Promise<void> {
    // In production, this would update a model_performance table
    // For now, we'll log it
    console.log(
      `[ModelLearner] Recording result: ${providerId}/${modelId} - ${success ? 'success' : 'failure'} - $${cost}${qualityScore ? ` - quality: ${qualityScore}` : ''}`,
    );
  }

  /**
   * Get model learning insights.
   */
  async getInsights(orgId: string): Promise<{
    bestModels: Array<{ providerId: string; modelId: string; metric: string; value: number }>;
    worstModels: Array<{ providerId: string; modelId: string; metric: string; value: number }>;
    recommendations: string[];
  }> {
    const performances = await this.getModelPerformance(orgId);

    const bestModels = performances.slice(0, 3).map(p => ({
      providerId: p.providerId,
      modelId: p.modelId,
      metric: 'costPerAcceptedAsset',
      value: p.metrics.costPerAcceptedAsset,
    }));

    const worstModels = performances.slice(-3).map(p => ({
      providerId: p.providerId,
      modelId: p.modelId,
      metric: 'costPerAcceptedAsset',
      value: p.metrics.costPerAcceptedAsset,
    }));

    const recommendations: string[] = [];

    // Generate recommendations
    if (performances.length > 0) {
      const best = performances[0]!;
      const worst = performances[performances.length - 1]!;

      if (best.metrics.costPerAcceptedAsset < worst.metrics.costPerAcceptedAsset * 0.5) {
        recommendations.push(
          `Consider replacing ${worst.providerId}/${worst.modelId} with ${best.providerId}/${best.modelId} — ${(1 - best.metrics.costPerAcceptedAsset / worst.metrics.costPerAcceptedAsset) * 100}% cheaper per accepted asset`,
        );
      }

      // Check for declining models
      const declining = performances.filter(p => p.trends.successRateTrend === 'declining');
      if (declining.length > 0) {
        recommendations.push(
          `${declining.length} models showing declining success rates — monitor closely`,
        );
      }
    }

    return {
      bestModels,
      worstModels,
      recommendations,
    };
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: ModelLearner | null = null;

export function getModelLearner(): ModelLearner {
  if (!_instance) {
    _instance = new ModelLearner();
  }
  return _instance;
}

export function resetModelLearner(): void {
  _instance = null;
}
