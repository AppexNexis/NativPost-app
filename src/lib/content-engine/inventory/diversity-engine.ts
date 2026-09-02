// Content Intelligence Engine — Diversity Engine
// Phase 7: Tracks content distribution and identifies imbalances

import { db } from '@/lib/db';
import { mediaAssetSchema, assetTagSchema, tagSchema } from '@/models/Schema';
import { eq } from 'drizzle-orm';
import type {
  DiversityDimension,
  ContentDistribution,
  DistributionEntry,
  DiversityImbalance,
  DiversityScore,
  InventoryEngineConfig,
} from './types';

// ─── Diversity Engine ────────────────────────────────────────────────────────

/**
 * DiversityEngine — tracks content distribution and identifies imbalances.
 *
 * You don't want:
 *   1000 B2B men
 *
 * You want:
 *   men, women, africans, americans, asians,
 *   founders, fitness, fashion, ugc, ai, finance,
 *   agency, coaches, creators
 */
export class DiversityEngine {
  private config: InventoryEngineConfig['diversity'];
  private dimensions: DiversityDimension[];

  constructor(config: Partial<InventoryEngineConfig['diversity']> = {}) {
    this.config = {
      minEntropy: 0.7,
      maxDominance: 0.4,
      imbalanceThreshold: 50,
      ...config,
    };

    this.dimensions = [
      'industry',
      'audience',
      'gender',
      'visual_style',
      'country',
      'content_type',
      'creator_type',
      'emotion',
      'offer_type',
      'hook_style',
      'audio_style',
      'aspect_ratio',
      'color_palette',
      'setting',
      'language',
    ];
  }

  // ── Distribution Analysis ────────────────────────────────────────────────

  /**
   * Calculate distribution for a specific dimension.
   */
  async calculateDistribution(
    orgId: string,
    dimension: DiversityDimension,
    targetDistribution?: Record<string, number>,
  ): Promise<ContentDistribution> {
    // Fetch content with tags
    const contents = await this.fetchContentsWithTags(orgId);

    // Map dimension to tag categories
    const tagCategories = this.mapDimensionToTags(dimension);

    // Count occurrences
    const counts = new Map<string, number>();
    for (const content of contents) {
      for (const tag of content.tags) {
        if (tagCategories.includes(tag.category)) {
          counts.set(tag.name, (counts.get(tag.name) ?? 0) + 1);
        }
      }
    }

    // Build distribution
    const total = contents.length;
    const entries: DistributionEntry[] = [];

    for (const [category, count] of counts) {
      const percentage = total > 0 ? (count / total) * 100 : 0;
      const targetPercentage = targetDistribution?.[category] ?? null;
      const deviation = targetPercentage !== null ? percentage - targetPercentage : 0;

      entries.push({
        category,
        count,
        percentage,
        targetPercentage,
        deviation,
      });
    }

    // Sort by count descending
    entries.sort((a, b) => b.count - a.count);

    // Calculate entropy
    const entropy = this.calculateEntropy(entries.map(e => e.percentage / 100));

    // Calculate dominance
    const dominanceScore = this.calculateDominance(entries);

    // Find top category
    const topEntry = entries[0];

    return {
      dimension,
      distribution: entries,
      totalAssets: total,
      entropy,
      dominanceScore,
      topCategory: topEntry?.category ?? 'none',
      topCategoryPercentage: topEntry?.percentage ?? 0,
    };
  }

  /**
   * Calculate distribution for all dimensions.
   */
  async calculateAllDistributions(
    orgId: string,
    targetDistributions?: Record<DiversityDimension, Record<string, number>>,
  ): Promise<Map<DiversityDimension, ContentDistribution>> {
    const distributions = new Map<DiversityDimension, ContentDistribution>();

    for (const dimension of this.dimensions) {
      const target = targetDistributions?.[dimension];
      distributions.set(
        dimension,
        await this.calculateDistribution(orgId, dimension, target),
      );
    }

    return distributions;
  }

  // ── Imbalance Detection ──────────────────────────────────────────────────

  /**
   * Detect imbalances in content distribution.
   */
  async detectImbalances(
    orgId: string,
    targetDistributions?: Record<DiversityDimension, Record<string, number>>,
  ): Promise<DiversityImbalance[]> {
    const distributions = await this.calculateAllDistributions(orgId, targetDistributions);
    const imbalances: DiversityImbalance[] = [];

    for (const [dimension, distribution] of distributions) {
      for (const entry of distribution.distribution) {
        if (entry.targetPercentage !== null) {
          const deficit = Math.max(0, entry.targetPercentage - entry.percentage);
          const deficitCount = Math.round((deficit / 100) * distribution.totalAssets);

          if (deficitCount >= this.config.imbalanceThreshold) {
            imbalances.push({
              dimension,
              category: entry.category,
              currentCount: entry.count,
              targetCount: Math.round((entry.targetPercentage / 100) * distribution.totalAssets),
              deficit: deficitCount,
              severity: this.calculateSeverity(deficitCount, distribution.totalAssets),
              recommendation: this.generateRecommendation(dimension, entry.category, deficitCount),
            });
          }
        }
      }
    }

    // Sort by severity
    imbalances.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4);
    });

    return imbalances;
  }

  // ── Diversity Score ──────────────────────────────────────────────────────

  /**
   * Calculate overall diversity score.
   */
  async calculateDiversityScore(
    orgId: string,
    targetDistributions?: Record<DiversityDimension, Record<string, number>>,
  ): Promise<DiversityScore> {
    const distributions = await this.calculateAllDistributions(orgId, targetDistributions);
    const imbalances = await this.detectImbalances(orgId, targetDistributions);

    const byDimension = {} as Record<DiversityDimension, number>;
    let totalEntropy = 0;
    let dimensionCount = 0;

    for (const [dimension, distribution] of distributions) {
      // Score = entropy normalized to 0-100
      const score = Math.round(distribution.entropy * 100);
      byDimension[dimension] = score;
      totalEntropy += distribution.entropy;
      dimensionCount++;
    }

    // Overall = average of dimension scores
    const overall = dimensionCount > 0
      ? Math.round((totalEntropy / dimensionCount) * 100)
      : 0;

    // Generate recommendations
    const recommendations = this.generateRecommendations(imbalances, byDimension);

    return {
      overall,
      byDimension,
      imbalances,
      recommendations,
      calculatedAt: new Date(),
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Calculate Shannon entropy of a distribution.
   */
  private calculateEntropy(percentages: number[]): number {
    if (percentages.length === 0) return 0;

    let entropy = 0;
    for (const p of percentages) {
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }

    // Normalize to 0-1 (max entropy = log2(n))
    const maxEntropy = Math.log2(percentages.length);
    return maxEntropy > 0 ? entropy / maxEntropy : 0;
  }

  /**
   * Calculate dominance score (1 = one category dominates).
   */
  private calculateDominance(entries: DistributionEntry[]): number {
    if (entries.length === 0) return 1;

    const maxPercentage = Math.max(...entries.map(e => e.percentage));
    return maxPercentage / 100;
  }

  /**
   * Calculate severity of an imbalance.
   */
  private calculateSeverity(
    deficit: number,
    total: number,
  ): DiversityImbalance['severity'] {
    const percentage = total > 0 ? (deficit / total) * 100 : 0;

    if (percentage >= 20) return 'critical';
    if (percentage >= 10) return 'high';
    if (percentage >= 5) return 'medium';
    return 'low';
  }

  /**
   * Generate a recommendation for an imbalance.
   */
  private generateRecommendation(
    dimension: DiversityDimension,
    category: string,
    deficit: number,
  ): string {
    return `Generate ${deficit} more ${category} content for ${dimension} diversity`;
  }

  /**
   * Generate overall recommendations.
   */
  private generateRecommendations(
    imbalances: DiversityImbalance[],
    byDimension: Record<DiversityDimension, number>,
  ): string[] {
    const recommendations: string[] = [];

    // Low entropy dimensions
    for (const [dimension, score] of Object.entries(byDimension)) {
      if (score < this.config.minEntropy * 100) {
        recommendations.push(
          `Low diversity in ${dimension} (${score}/100) — diversify content`,
        );
      }
    }

    // Critical imbalances
    const criticalImbalances = imbalances.filter(i => i.severity === 'critical');
    if (criticalImbalances.length > 0) {
      recommendations.push(
        `${criticalImbalances.length} critical diversity gaps — prioritize generation`,
      );
    }

    return recommendations;
  }

  /**
   * Map a diversity dimension to tag categories.
   */
  private mapDimensionToTags(dimension: DiversityDimension): string[] {
    const mapping: Record<DiversityDimension, string[]> = {
      industry: ['industry', 'business_type', 'company_type'],
      audience: ['audience', 'target_audience', 'customer_type'],
      gender: ['gender', 'person_gender'],
      visual_style: ['visual_style', 'aesthetic', 'style'],
      country: ['country', 'location', 'region'],
      content_type: ['content_type', 'format', 'media_type'],
      creator_type: ['creator_type', 'influencer_type'],
      emotion: ['emotion', 'mood', 'tone'],
      offer_type: ['offer_type', 'product_type'],
      hook_style: ['hook_style', 'hook_type'],
      audio_style: ['audio_style', 'music_type'],
      aspect_ratio: ['aspect_ratio', 'dimensions'],
      color_palette: ['color_palette', 'color_scheme'],
      setting: ['setting', 'location_type', 'environment'],
      language: ['language', 'locale'],
    };

    return mapping[dimension] ?? [dimension];
  }

  /**
   * Fetch contents with their tags.
   */
  private async fetchContentsWithTags(
    orgId: string,
  ): Promise<Array<{ id: string; tags: Array<{ name: string; category: string }> }>> {
    const results = await db
      .select({
        id: mediaAssetSchema.id,
        tagName: tagSchema.name,
        tagCategory: tagSchema.type,
      })
      .from(mediaAssetSchema)
      .innerJoin(assetTagSchema, eq(mediaAssetSchema.id, assetTagSchema.assetId))
      .innerJoin(tagSchema, eq(assetTagSchema.tagId, tagSchema.id))
      .where(eq(mediaAssetSchema.orgId, orgId));

    // Group by content
    const contentMap = new Map<string, Array<{ name: string; category: string }>>();
    for (const row of results) {
      if (!contentMap.has(row.id)) {
        contentMap.set(row.id, []);
      }
      contentMap.get(row.id)!.push({
        name: row.tagName,
        category: row.tagCategory,
      });
    }

    return Array.from(contentMap.entries()).map(([id, tags]) => ({ id, tags }));
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: DiversityEngine | null = null;

export function getDiversityEngine(
  config?: Partial<InventoryEngineConfig['diversity']>,
): DiversityEngine {
  if (!_instance) {
    _instance = new DiversityEngine(config);
  }
  return _instance;
}
