// Content Intelligence Engine — Quality Recovery
// Phase 9: Retry failed content intelligently

import { db } from '@/lib/db';
import { generationJobSchema, generationAttemptSchema } from '@/models/Schema';
import { eq, and, count, desc } from 'drizzle-orm';
import type {
  RecoveryStrategy,
  RecoveryType,
  RecoveryModification,
  RecoveryAttempt,
} from './types';

// ─── Quality Recovery ────────────────────────────────────────────────────────

/**
 * QualityRecovery — handles failed content intelligently.
 *
 * Failed content shouldn't just disappear.
 *
 * Example:
 *   Generation → Quality Gate → FAIL → NO_AUDIO
 *     → same model retry
 *     → different generation parameters
 *     → different model
 *     → quarantine after N failures
 */
export class QualityRecovery {
  private strategies: Map<string, RecoveryStrategy>;

  constructor(_maxRetries: number = 3) {
    this.strategies = this.initializeStrategies();
  }

  // ── Recovery Execution ────────────────────────────────────────────────────

  /**
   * Attempt to recover a failed job.
   */
  async recoverJob(
    jobId: string,
    failureCode: string,
  ): Promise<RecoveryAttempt> {
    const strategy = this.getStrategy(failureCode);
    const attempt = await this.getAttemptCount(jobId);

    console.log(`[QualityRecovery] Recovering job ${jobId} (attempt ${attempt + 1}): ${failureCode}`);

    // Check if we should escalate
    if (attempt >= strategy.maxRetries) {
      return this.createEscalationAttempt(jobId, failureCode, attempt);
    }

    // Determine recovery type
    const recoveryType = this.determineRecoveryType(strategy, attempt);

    // Generate modifications
    const modifications = this.generateModifications(strategy, attempt, recoveryType);

    // Create recovery attempt
    const recoveryAttempt: RecoveryAttempt = {
      id: `recovery_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      jobId,
      originalFailureCode: failureCode,
      recoveryType,
      attemptNumber: attempt + 1,
      modifications,
      result: 'failure', // Will be updated
      newJobId: null,
      timestamp: new Date(),
    };

    // Execute recovery based on type
    switch (recoveryType) {
      case 'retry_same':
        recoveryAttempt.newJobId = await this.retrySame(jobId, modifications);
        break;
      case 'retry_modified':
        recoveryAttempt.newJobId = await this.retryModified(jobId, modifications);
        break;
      case 'retry_different_model':
        recoveryAttempt.newJobId = await this.retryDifferentModel(jobId, modifications);
        break;
      case 'skip':
        recoveryAttempt.result = 'failure';
        break;
      case 'quarantine':
        return this.createEscalationAttempt(jobId, failureCode, attempt);
    }

    return recoveryAttempt;
  }

  /**
   * Recover all failed jobs.
   */
  async recoverAllFailed(
    orgId: string,
  ): Promise<{
    recovered: number;
    escalated: number;
    quarantined: number;
  }> {
    // Get all failed jobs
    const failedJobs = await db
      .select()
      .from(generationJobSchema)
      .where(
        and(
          eq(generationJobSchema.orgId, orgId),
          eq(generationJobSchema.status, 'failed'),
        ),
      )
      .orderBy(desc(generationJobSchema.updatedAt));

    let recovered = 0;
    let escalated = 0;
    let quarantined = 0;

    for (const job of failedJobs) {
      const failureCode = this.extractFailureCode(job);
      if (!failureCode) continue;

      const attempt = await this.recoverJob(job.id, failureCode);

      switch (attempt.result) {
        case 'success':
          recovered++;
          break;
        case 'escalated':
          escalated++;
          break;
        case 'failure':
          quarantined++;
          break;
      }
    }

    return { recovered, escalated, quarantined };
  }

  // ── Strategy Management ───────────────────────────────────────────────────

  /**
   * Get recovery strategy for a failure code.
   */
  getStrategy(failureCode: string): RecoveryStrategy {
    return this.strategies.get(failureCode) ?? this.getDefaultStrategy();
  }

  /**
   * Initialize default strategies.
   */
  private initializeStrategies(): Map<string, RecoveryStrategy> {
    const strategies = new Map<string, RecoveryStrategy>();

    // NO_AUDIO — most common failure
    strategies.set('NO_AUDIO', {
      failureCode: 'NO_AUDIO',
      recoveryType: 'retry_modified',
      maxRetries: 3,
      modifications: [
        {
          field: 'audioEnabled',
          action: 'change',
          value: true,
          reasoning: 'Enable audio generation',
        },
      ],
      escalateToQuarantine: true,
    });

    // SILENT_AUDIO
    strategies.set('SILENT_AUDIO', {
      failureCode: 'SILENT_AUDIO',
      recoveryType: 'retry_different_model',
      maxRetries: 2,
      modifications: [
        {
          field: 'modelId',
          action: 'change',
          value: 'elevenlabs_speech',
          reasoning: 'Try ElevenLabs for speech generation',
        },
      ],
      escalateToQuarantine: true,
    });

    // INVALID_AUDIO
    strategies.set('INVALID_AUDIO', {
      failureCode: 'INVALID_AUDIO',
      recoveryType: 'retry_modified',
      maxRetries: 2,
      modifications: [
        {
          field: 'audioFormat',
          action: 'change',
          value: 'mp3',
          reasoning: 'Force MP3 format',
        },
      ],
      escalateToQuarantine: true,
    });

    // VIDEO_TOO_SHORT
    strategies.set('VIDEO_TOO_SHORT', {
      failureCode: 'VIDEO_TOO_SHORT',
      recoveryType: 'retry_modified',
      maxRetries: 2,
      modifications: [
        {
          field: 'duration',
          action: 'increase',
          value: 10,
          reasoning: 'Increase target duration to 10 seconds',
        },
      ],
      escalateToQuarantine: true,
    });

    // VIDEO_TOO_LONG
    strategies.set('VIDEO_TOO_LONG', {
      failureCode: 'VIDEO_TOO_LONG',
      recoveryType: 'retry_modified',
      maxRetries: 2,
      modifications: [
        {
          field: 'duration',
          action: 'decrease',
          value: 30,
          reasoning: 'Decrease target duration to 30 seconds',
        },
      ],
      escalateToQuarantine: true,
    });

    // NO_FACE
    strategies.set('NO_FACE', {
      failureCode: 'NO_FACE',
      recoveryType: 'retry_different_model',
      maxRetries: 2,
      modifications: [
        {
          field: 'prompt',
          action: 'change',
          value: 'person speaking to camera',
          reasoning: 'Modify prompt to emphasize face',
        },
      ],
      escalateToQuarantine: true,
    });

    // QUALITY_TOO_LOW
    strategies.set('QUALITY_TOO_LOW', {
      failureCode: 'QUALITY_TOO_LOW',
      recoveryType: 'retry_different_model',
      maxRetries: 2,
      modifications: [
        {
          field: 'quality',
          action: 'increase',
          value: 'high',
          reasoning: 'Request higher quality output',
        },
      ],
      escalateToQuarantine: true,
    });

    return strategies;
  }

  /**
   * Get default strategy.
   */
  private getDefaultStrategy(): RecoveryStrategy {
    return {
      failureCode: 'UNKNOWN',
      recoveryType: 'retry_same',
      maxRetries: 1,
      modifications: [],
      escalateToQuarantine: true,
    };
  }

  // ── Recovery Execution ────────────────────────────────────────────────────

  /**
   * Determine recovery type based on strategy and attempt.
   */
  private determineRecoveryType(
    strategy: RecoveryStrategy,
    attempt: number,
  ): RecoveryType {
    // First attempt: use strategy's default
    if (attempt === 0) {
      return strategy.recoveryType;
    }

    // Second attempt: try different model
    if (attempt === 1) {
      return 'retry_different_model';
    }

    // Third attempt: quarantine
    return 'quarantine';
  }

  /**
   * Generate modifications for recovery.
   */
  private generateModifications(
    strategy: RecoveryStrategy,
    attempt: number,
    recoveryType: RecoveryType,
  ): RecoveryModification[] {
    const modifications: RecoveryModification[] = [...strategy.modifications];

    // Add attempt-specific modifications
    if (attempt > 0) {
      modifications.push({
        field: 'attempt',
        action: 'change',
        value: attempt + 1,
        reasoning: `Retry attempt ${attempt + 1}`,
      });
    }

    if (recoveryType === 'retry_different_model') {
      modifications.push({
        field: 'modelId',
        action: 'change',
        value: 'fallback_model',
        reasoning: 'Switch to fallback model',
      });
    }

    return modifications;
  }

  /**
   * Retry with same parameters.
   */
  private async retrySame(
    jobId: string,
    _modifications: RecoveryModification[],
  ): Promise<string> {
    // Get original job
    const originalJob = await db
      .select()
      .from(generationJobSchema)
      .where(eq(generationJobSchema.id, jobId))
      .limit(1);

    if (originalJob.length === 0) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Create new job with same parameters
    const newJobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    console.log(`[QualityRecovery] Retrying same: ${jobId} → ${newJobId}`);

    // In production, would create actual generation job
    return newJobId;
  }

  /**
   * Retry with modified parameters.
   */
  private async retryModified(
    jobId: string,
    modifications: RecoveryModification[],
  ): Promise<string> {
    console.log(`[QualityRecovery] Retrying modified: ${jobId} with ${modifications.length} modifications`);

    // In production, would create generation job with modified parameters
    const newJobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return newJobId;
  }

  /**
   * Retry with different model.
   */
  private async retryDifferentModel(
    jobId: string,
    _modifications: RecoveryModification[],
  ): Promise<string> {
    console.log(`[QualityRecovery] Retrying different model: ${jobId}`);

    // In production, would create generation job with different model
    const newJobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return newJobId;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Get attempt count for a job.
   */
  private async getAttemptCount(jobId: string): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(generationAttemptSchema)
      .where(eq(generationAttemptSchema.jobId, jobId));

    return result[0]?.count ?? 0;
  }

  /**
   * Extract failure code from job.
   */
  private extractFailureCode(job: { errorMessage: string | null; errorCode: string | null }): string | null {
    // Use errorCode if available, otherwise try to parse errorMessage
    if (job.errorCode) return job.errorCode;
    if (job.errorMessage) {
      // Try to extract failure code from error message
      const match = job.errorMessage.match(/([A-Z_]+):/);
      if (match?.[1]) return match[1];
    }
    return null;
  }

  /**
   * Create escalation attempt.
   */
  private createEscalationAttempt(
    jobId: string,
    failureCode: string,
    attempt: number,
  ): RecoveryAttempt {
    return {
      id: `recovery_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      jobId,
      originalFailureCode: failureCode,
      recoveryType: 'quarantine',
      attemptNumber: attempt + 1,
      modifications: [],
      result: 'escalated',
      newJobId: null,
      timestamp: new Date(),
    };
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: QualityRecovery | null = null;

export function getQualityRecovery(maxRetries?: number): QualityRecovery {
  if (!_instance) {
    _instance = new QualityRecovery(maxRetries);
  }
  return _instance;
}

export function resetQualityRecovery(): void {
  _instance = null;
}
