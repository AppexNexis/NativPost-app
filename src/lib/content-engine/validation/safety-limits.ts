// Content Intelligence Engine — Safety Limits
// Phase 10: Min observations before models are trusted, autonomous safety

import { db } from '@/lib/db';
import { generationJobSchema } from '@/models/Schema';
import { eq, and, sql, count, sum } from 'drizzle-orm';
import type {
  SafetyLimits,
  SafetyCheck,
} from './types';
import { DEFAULT_SAFETY_LIMITS } from './types';

// ─── Safety Limits Engine ────────────────────────────────────────────────────

/**
 * SafetyLimitsEngine — enforces minimum observations before trusting models.
 *
 * ModelLearner has the architecture to optimize cost per accepted asset.
 * But initially it won't have enough historical observations.
 *
 * Don't let it aggressively optimize based on tiny samples.
 *
 * Establish:
 *   - minimum observations
 *   - minimum successful generations
 *   - minimum quality samples
 *   - minimum days of history
 *
 * before a model is considered "trusted."
 */
export class SafetyLimitsEngine {
  private limits: SafetyLimits;

  constructor(limits: Partial<SafetyLimits> = {}) {
    this.limits = {
      ...DEFAULT_SAFETY_LIMITS,
      ...limits,
    };
  }

  // ── Model Trust Checks ────────────────────────────────────────────────────

  /**
   * Check if a model has enough observations to be trusted.
   */
  async isModelTrusted(
    orgId: string,
    providerId: string,
    modelId: string,
  ): Promise<{
    trusted: boolean;
    observations: number;
    successfulGenerations: number;
    daysOfHistory: number;
    issues: string[];
  }> {
    const issues: string[] = [];

    // Count total observations
    const totalResult = await db
      .select({ count: count() })
      .from(generationJobSchema)
      .where(
        and(
          eq(generationJobSchema.orgId, orgId),
          eq(generationJobSchema.providerId, providerId),
          eq(generationJobSchema.modelId, modelId),
        ),
      );
    const observations = totalResult[0]?.count ?? 0;

    // Count successful generations
    const successfulResult = await db
      .select({ count: count() })
      .from(generationJobSchema)
      .where(
        and(
          eq(generationJobSchema.orgId, orgId),
          eq(generationJobSchema.providerId, providerId),
          eq(generationJobSchema.modelId, modelId),
          eq(generationJobSchema.status, 'completed'),
        ),
      );
    const successfulGenerations = successfulResult[0]?.count ?? 0;

    // Calculate days of history
    const firstJobResult = await db
      .select({ createdAt: generationJobSchema.createdAt })
      .from(generationJobSchema)
      .where(
        and(
          eq(generationJobSchema.orgId, orgId),
          eq(generationJobSchema.providerId, providerId),
          eq(generationJobSchema.modelId, modelId),
        ),
      )
      .orderBy(sql`${generationJobSchema.createdAt} ASC`)
      .limit(1);

    let daysOfHistory = 0;
    if (firstJobResult[0]) {
      const firstDate = firstJobResult[0].createdAt;
      daysOfHistory = Math.floor(
        (Date.now() - firstDate.getTime()) / (1000 * 60 * 60 * 24),
      );
    }

    // Check thresholds
    if (observations < this.limits.minimumObservationsPerModel) {
      issues.push(
        `Only ${observations} observations (minimum: ${this.limits.minimumObservationsPerModel})`,
      );
    }

    if (successfulGenerations < this.limits.minimumSuccessfulGenerationsPerModel) {
      issues.push(
        `Only ${successfulGenerations} successful generations (minimum: ${this.limits.minimumSuccessfulGenerationsPerModel})`,
      );
    }

    if (daysOfHistory < this.limits.minimumDaysOfHistory) {
      issues.push(
        `Only ${daysOfHistory} days of history (minimum: ${this.limits.minimumDaysOfHistory})`,
      );
    }

    return {
      trusted: issues.length === 0,
      observations,
      successfulGenerations,
      daysOfHistory,
      issues,
    };
  }

  // ── Safety Checks ─────────────────────────────────────────────────────────

  /**
   * Run all safety checks.
   */
  async runSafetyChecks(orgId: string): Promise<SafetyCheck[]> {
    const checks: SafetyCheck[] = [];

    // Check 1: Minimum observations
    const totalJobsResult = await db
      .select({ count: count() })
      .from(generationJobSchema)
      .where(eq(generationJobSchema.orgId, orgId));
    const totalJobs = totalJobsResult[0]?.count ?? 0;

    checks.push({
      check: 'minimum_observations',
      passed: totalJobs >= this.limits.minimumObservationsPerModel,
      message: totalJobs >= this.limits.minimumObservationsPerModel
        ? `${totalJobs} observations (meets minimum)`
        : `Only ${totalJobs} observations — need ${this.limits.minimumObservationsPerModel}`,
      details: { totalJobs, minimum: this.limits.minimumObservationsPerModel },
    });

    // Check 2: Daily spend
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dailySpendResult = await db
      .select({ total: sum(generationJobSchema.actualCost) })
      .from(generationJobSchema)
      .where(
        and(
          eq(generationJobSchema.orgId, orgId),
          sql`${generationJobSchema.createdAt} >= ${today}`,
          eq(generationJobSchema.status, 'completed'),
        ),
      );
    const dailySpend = Number(dailySpendResult[0]?.total ?? 0);

    checks.push({
      check: 'daily_spend_limit',
      passed: dailySpend < this.limits.maxDailySpend,
      message: dailySpend < this.limits.maxDailySpend
        ? `Daily spend $${dailySpend.toFixed(2)} within limit`
        : `Daily spend $${dailySpend.toFixed(2)} exceeds limit $${this.limits.maxDailySpend.toFixed(2)}`,
      details: { dailySpend, limit: this.limits.maxDailySpend },
    });

    return checks;
  }

  /**
   * Get current limits.
   */
  getLimits(): SafetyLimits {
    return { ...this.limits };
  }

  /**
   * Update limits.
   */
  updateLimits(limits: Partial<SafetyLimits>): void {
    this.limits = { ...this.limits, ...limits };
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: SafetyLimitsEngine | null = null;

export function getSafetyLimitsEngine(limits?: Partial<SafetyLimits>): SafetyLimitsEngine {
  if (!_instance) {
    _instance = new SafetyLimitsEngine(limits);
  }
  return _instance;
}

export function resetSafetyLimitsEngine(): void {
  _instance = null;
}
