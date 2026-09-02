// Content Intelligence Engine — Quality Gate
// Phase 4: Hard quality gate for media acceptance

import type {
  QualityGateResult,
  QualityScores,
  QualityAssessment,
  MediaProcessingResult,
  FailureCode,
  VideoValidation,
  ImageValidation,
  AudioMetadata,
} from './types';
import { isHardFailure } from './types';

// ─── Quality Gate Version ───────────────────────────────────────────────────

/** Current quality gate version. */
const QUALITY_GATE_VERSION = '1.0.0';

// ─── QualityGate ────────────────────────────────────────────────────────────

/**
 * QualityGate — determines whether media is eligible to proceed.
 *
 * Responsibilities:
 * 1. Evaluate hard failure conditions
 * 2. Compute quality scores
 * 3. Return structured gate results
 * 4. Separate hard failures from warnings
 *
 * HARD RULES:
 * - Generated video without valid audio CANNOT pass
 * - Corrupt media CANNOT pass
 * - Invalid dimensions CANNOT pass
 */
export class QualityGate {
  private gateVersion: string;

  constructor(gateVersion: string = QUALITY_GATE_VERSION) {
    this.gateVersion = gateVersion;
  }

  /**
   * Evaluate a media processing result against the quality gate.
   *
   * @param result - Complete media processing result
   * @returns Structured gate result
   */
  evaluate(result: MediaProcessingResult): QualityGateResult {
    const failures: FailureCode[] = [];
    const warnings: string[] = [];

    // Collect failures from all validators
    if (result.video) {
      failures.push(...result.video.failures);
      warnings.push(...result.video.warnings);
    }

    if (result.image) {
      failures.push(...result.image.failures);
      warnings.push(...result.image.warnings);
    }

    if (result.audio) {
      failures.push(...result.audio.failures);
    }

    // Filter to only hard failures
    const hardFailures = failures.filter(isHardFailure);

    // Determine pass/fail
    const passed = hardFailures.length === 0;

    // Build quality assessment
    const assessment = this.buildAssessment(result.quality.scores, result.quality.flags);

    return {
      passed,
      failures: hardFailures,
      warnings,
      assessment,
      processing: result.processing,
      gateVersion: this.gateVersion,
      evaluatedAt: new Date(),
    };
  }

  /**
   * Quick evaluation for video assets.
   * Checks only the most critical conditions.
   */
  evaluateVideoQuick(
    video: VideoValidation,
    audio: AudioMetadata,
  ): QualityGateResult {
    const failures: FailureCode[] = [];
    const warnings: string[] = [...(video.warnings ?? [])];

    // Check video validity
    if (!video.isValid) {
      failures.push(...video.failures);
    }

    // Check audio — HARD REQUIREMENT
    if (audio.status === 'no_audio') {
      failures.push('NO_AUDIO');
    } else if (audio.status === 'silent_audio') {
      failures.push('SILENT_AUDIO');
    } else if (audio.status === 'invalid_audio') {
      failures.push('INVALID_AUDIO');
    } else if (audio.status === 'truncated_audio') {
      failures.push('TRUNCATED_AUDIO');
    }

    // Filter to hard failures
    const hardFailures = failures.filter(isHardFailure);

    // Build assessment
    const scores: QualityScores = {
      technical: video.isValid ? 0.8 : 0.2,
      audio: audio.status === 'valid' ? 0.8 : 0.1,
      visual: null, // Not evaluated in quick check
      safety: null, // Not evaluated here
      composition: null, // Not for raw assets
      semantic: null, // Not evaluated here
    };

    const assessment = this.buildAssessment(scores, []);

    return {
      passed: hardFailures.length === 0,
      failures: hardFailures,
      warnings,
      assessment,
      processing: {
        durationMs: 0,
        processorVersion: this.gateVersion,
        steps: ['quick_evaluation'],
      },
      gateVersion: this.gateVersion,
      evaluatedAt: new Date(),
    };
  }

  /**
   * Quick evaluation for image assets.
   */
  evaluateImageQuick(image: ImageValidation): QualityGateResult {
    const failures: FailureCode[] = [...image.failures];
    const warnings: string[] = [...image.warnings];

    // Filter to hard failures
    const hardFailures = failures.filter(isHardFailure);

    // Build assessment
    const scores: QualityScores = {
      technical: image.isValid ? 0.8 : 0.2,
      audio: null, // Not applicable for images
      visual: null, // Not evaluated in quick check
      safety: null, // Not evaluated here
      composition: null, // Not for raw assets
      semantic: null, // Not evaluated here
    };

    const assessment = this.buildAssessment(scores, []);

    return {
      passed: hardFailures.length === 0,
      failures: hardFailures,
      warnings,
      assessment,
      processing: {
        durationMs: 0,
        processorVersion: this.gateVersion,
        steps: ['quick_evaluation'],
      },
      gateVersion: this.gateVersion,
      evaluatedAt: new Date(),
    };
  }

  /**
   * Check if a specific failure code is present in the result.
   */
  hasFailure(result: QualityGateResult, code: FailureCode): boolean {
    return result.failures.includes(code);
  }

  /**
   * Check if the result has any hard failures.
   */
  hasHardFailures(result: QualityGateResult): boolean {
    return result.failures.some(isHardFailure);
  }

  /**
   * Get a summary of the gate result.
   */
  getSummary(result: QualityGateResult): string {
    if (result.passed) {
      return `PASSED (${result.warnings.length} warnings)`;
    }
    return `FAILED (${result.failures.length} failures: ${result.failures.join(', ')})`;
  }

  /**
   * Build a quality assessment from scores.
   */
  private buildAssessment(
    scores: QualityScores,
    flags: string[],
  ): QualityAssessment {
    // Calculate overall score (average of non-null scores)
    const nonNullScores = [
      scores.technical,
      scores.audio,
      scores.visual,
      scores.safety,
      scores.composition,
      scores.semantic,
    ].filter((s): s is number => s !== null);

    const overall = nonNullScores.length > 0
      ? nonNullScores.reduce((a, b) => a + b, 0) / nonNullScores.length
      : null;

    return {
      scores,
      overall,
      flags,
      gateVersion: this.gateVersion,
      assessedAt: new Date(),
    };
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let instance: QualityGate | null = null;

/**
 * Get the singleton QualityGate instance.
 */
export function getQualityGate(gateVersion?: string): QualityGate {
  if (!instance) {
    instance = new QualityGate(gateVersion);
  }
  return instance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetQualityGate(): void {
  instance = null;
}
