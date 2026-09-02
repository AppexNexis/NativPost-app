// Content Intelligence Engine — Diversity Controller
// Phase 9: Inventory diversity as first-class generation objective

import type {
  DiversityTarget,
  DiversityAction,
  DiversityControlResult,
} from './types';
import { getDiversityEngine } from '../inventory/diversity-engine';

// ─── Diversity Controller ────────────────────────────────────────────────────

/**
 * DiversityController — ensures inventory stays diverse.
 *
 * The factory shouldn't just chase quantity.
 *
 * Example:
 *   10,000 assets
 *   But: 62% male, 71% B2B, 80% office scenes
 *
 * That's a bad library despite the number.
 *
 * Diversity controller says:
 *   "Don't generate more generic male office content.
 *    Generate: Female, Fitness, B2C, Outdoor, Creator-style"
 */
export class DiversityController {
  private targetDiversityScore: number;
  private minDiversityPerDimension: number;

  constructor(config: { targetDiversityScore?: number; minDiversityPerDimension?: number } = {}) {
    this.targetDiversityScore = config.targetDiversityScore ?? 0.8;
    this.minDiversityPerDimension = config.minDiversityPerDimension ?? 0.6;
  }

  // ── Diversity Control ─────────────────────────────────────────────────────

  /**
   * Analyze diversity and generate control actions.
   */
  async analyzeAndControl(
    orgId: string,
  ): Promise<DiversityControlResult> {
    const diversityEngine = getDiversityEngine();
    const diversityScore = await diversityEngine.calculateDiversityScore(orgId);
    const imbalances = await diversityEngine.detectImbalances(orgId);

    const actions: DiversityAction[] = [];
    const dimensionsImproved: string[] = [];

    // Generate actions for imbalances
    for (const imbalance of imbalances) {
      if (imbalance.severity === 'critical' || imbalance.severity === 'high') {
        const action = this.createActionFromImbalance(imbalance);
        actions.push(action);

        if (!dimensionsImproved.includes(imbalance.dimension)) {
          dimensionsImproved.push(imbalance.dimension);
        }
      }
    }

    // Generate suppression actions for overrepresented categories
    const distributions = await diversityEngine.calculateAllDistributions(orgId);
    for (const [dimension, distribution] of distributions) {
      for (const entry of distribution.distribution) {
        if (entry.percentage > 40) { // More than 40% is overrepresented
          actions.push({
            type: 'suppress',
            dimension,
            category: entry.category,
            count: 0,
            reasoning: `${entry.category} is overrepresented at ${entry.percentage.toFixed(1)}% — reduce generation`,
          });
        }
      }
    }

    // Estimate impact
    const estimatedImpact = this.estimateImpact(actions, diversityScore.overall);

    return {
      actions,
      overallDiversityScore: diversityScore.overall,
      dimensionsImproved,
      estimatedImpact,
    };
  }

  /**
   * Get diversity targets for generation.
   */
  async getGenerationTargets(
    orgId: string,
  ): Promise<DiversityTarget[]> {
    const diversityEngine = getDiversityEngine();
    const distributions = await diversityEngine.calculateAllDistributions(orgId);

    const targets: DiversityTarget[] = [];

    for (const [dimension, distribution] of distributions) {
      // Check each category
      for (const entry of distribution.distribution) {
        // Target: each category should be between 5-20% of total
        const targetPercentage = 10; // 10% target for each category
        const currentPercentage = entry.percentage;
        const deficit = Math.max(0, targetPercentage - currentPercentage);

        if (deficit > 1) { // Only if deficit is significant
          let priority: DiversityTarget['priority'] = 'low';
          if (deficit > 15) priority = 'critical';
          else if (deficit > 10) priority = 'high';
          else if (deficit > 5) priority = 'medium';

          targets.push({
            dimension,
            category: entry.category,
            targetPercentage,
            currentPercentage,
            deficit,
            priority,
          });
        }
      }
    }

    // Sort by priority
    targets.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4);
    });

    return targets;
  }

  /**
   * Check if diversity is healthy.
   */
  async isDiversityHealthy(orgId: string): Promise<{
    healthy: boolean;
    score: number;
    issues: string[];
  }> {
    const diversityEngine = getDiversityEngine();
    const diversityScore = await diversityEngine.calculateDiversityScore(orgId);
    const imbalances = await diversityEngine.detectImbalances(orgId);

    const issues: string[] = [];

    // Check overall score
    if (diversityScore.overall < this.targetDiversityScore * 100) {
      issues.push(`Overall diversity score ${diversityScore.overall}/100 is below target ${this.targetDiversityScore * 100}`);
    }

    // Check individual dimensions
    for (const [dimension, score] of Object.entries(diversityScore.byDimension)) {
      if (score < this.minDiversityPerDimension * 100) {
        issues.push(`${dimension} diversity ${score}/100 is below minimum ${this.minDiversityPerDimension * 100}`);
      }
    }

    // Check critical imbalances
    const criticalImbalances = imbalances.filter(i => i.severity === 'critical');
    if (criticalImbalances.length > 0) {
      issues.push(`${criticalImbalances.length} critical diversity imbalances detected`);
    }

    return {
      healthy: issues.length === 0,
      score: diversityScore.overall,
      issues,
    };
  }

  // ── Action Generation ─────────────────────────────────────────────────────

  /**
   * Create action from imbalance.
   */
  private createActionFromImbalance(
    imbalance: {
      dimension: string;
      category: string;
      deficit: number;
      severity: string;
    },
  ): DiversityAction {
    const count = Math.min(imbalance.deficit, 50); // Cap at 50 per action

    return {
      type: 'generate',
      dimension: imbalance.dimension,
      category: imbalance.category,
      count,
      reasoning: `Fill ${imbalance.dimension}/${imbalance.category} gap (${imbalance.severity} severity)`,
    };
  }

  /**
   * Estimate impact of actions.
   */
  private estimateImpact(
    actions: DiversityAction[],
    currentScore: number,
  ): number {
    // Simple estimation: each generate action improves score by 0.5%
    const generateActions = actions.filter(a => a.type === 'generate');
    const suppressActions = actions.filter(a => a.type === 'suppress');

    const improvement = generateActions.length * 0.5;
    const reduction = suppressActions.length * 0.2;

    return Math.max(0, Math.min(100, currentScore + improvement - reduction));
  }

  /**
   * Get diversity-adjusted generation brief.
   * Modifies a generation brief to improve diversity.
   */
  async adjustBriefForDiversity(
    orgId: string,
    brief: {
      contentType: string;
      count: number;
      metadata?: Record<string, unknown>;
    },
  ): Promise<{
    brief: typeof brief;
    adjustments: string[];
  }> {
    const targets = await this.getGenerationTargets(orgId);
    const adjustments: string[] = [];

    // Find the most needed dimension/category
    const topTarget = targets[0];
    if (!topTarget) {
      return { brief, adjustments: ['No diversity adjustments needed'] };
    }

    // Add diversity tag to brief
    const adjustedBrief = {
      ...brief,
      metadata: {
        ...brief.metadata,
        diversityTarget: {
          dimension: topTarget.dimension,
          category: topTarget.category,
        },
      },
    };

    adjustments.push(
      `Added diversity target: ${topTarget.dimension}/${topTarget.category} (${topTarget.deficit.toFixed(1)}% gap)`,
    );

    return { brief: adjustedBrief, adjustments };
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: DiversityController | null = null;

export function getDiversityController(
  config?: { targetDiversityScore?: number; minDiversityPerDimension?: number },
): DiversityController {
  if (!_instance) {
    _instance = new DiversityController(config);
  }
  return _instance;
}

export function resetDiversityController(): void {
  _instance = null;
}
