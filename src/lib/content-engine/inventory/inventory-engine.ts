// Content Intelligence Engine — Inventory Engine
// Phase 7: Tracks content counts, targets, health, and freshness

import { db } from '@/lib/db';
import { mediaAssetSchema, contentTypeSchema } from '@/models/Schema';
import { eq, and, count, sql } from 'drizzle-orm';
import type {
  InventoryStatus,
  InventorySnapshot,
  InventoryHealth,
  FreshnessScore,
  FreshnessCategory,
  DecayRate,
  InventoryConfig,
} from './types';
import { DEFAULT_DECAY_RATES } from './types';

// ─── Inventory Engine ────────────────────────────────────────────────────────

/**
 * InventoryEngine — tracks content counts, targets, health, and freshness.
 *
 * This is the real business engine.
 *
 * Example:
 *   Target: 1000 per type
 *   Current: Talking Head: 241, UGC: 183, Reels: 900, Slideshows: 62
 *   Need: 759 Talking Heads, 817 UGC, 938 Slideshows
 */
export class InventoryEngine {
  private config: InventoryConfig;
  private decayRates: DecayRate[];

  constructor(config: Partial<InventoryConfig> = {}) {
    this.config = {
      healthyThreshold: 0.8,
      lowThreshold: 0.5,
      overstockedThreshold: 1.2,
      freshnessDecayDays: 90,
      criticalDecayDays: 180,
      defaultTargetPerType: 1000,
      ...config,
    };

    this.decayRates = DEFAULT_DECAY_RATES;
  }

  // ── Inventory Status ─────────────────────────────────────────────────────

  /**
   * Get inventory status for all content types.
   */
  async getInventoryStatus(orgId: string): Promise<InventoryStatus[]> {
    // Get all content types
    const contentTypes = await db
      .select()
      .from(contentTypeSchema)
      .where(eq(contentTypeSchema.isActive, true));

    const statuses: InventoryStatus[] = [];

    for (const ct of contentTypes) {
      // Count assets of this type
      const countResult = await db
        .select({ count: count() })
        .from(mediaAssetSchema)
        .where(
          and(
            eq(mediaAssetSchema.orgId, orgId),
            eq(mediaAssetSchema.assetType, ct.id === 'slideshow' ? 'image' : ct.id),
            eq(mediaAssetSchema.status, 'validated'),
          ),
        );

      const currentCount = countResult[0]?.count ?? 0;
      const targetCount = this.config.defaultTargetPerType;
      const coverage = targetCount > 0 ? currentCount / targetCount : 0;

      // Calculate freshness
      const freshness = await this.calculateFreshness(orgId, ct.id);

      // Get age stats
      const ageStats = await this.getAgeStats(orgId, ct.id);

      statuses.push({
        contentTypeId: ct.id,
        contentTypeName: ct.name,
        currentCount,
        targetCount,
        coverage,
        health: this.determineHealth(coverage),
        freshnessScore: freshness,
        lastGeneratedAt: ageStats.lastGenerated,
        oldestContentAge: ageStats.oldestAge,
        newestContentAge: ageStats.newestAge,
        averageAge: ageStats.averageAge,
      });
    }

    return statuses;
  }

  /**
   * Get inventory status for a specific content type.
   */
  async getContentTypeStatus(
    orgId: string,
    contentTypeId: string,
  ): Promise<InventoryStatus | null> {
    const contentTypes = await this.getInventoryStatus(orgId);
    return contentTypes.find(ct => ct.contentTypeId === contentTypeId) ?? null;
  }

  // ── Inventory Snapshot ───────────────────────────────────────────────────

  /**
   * Take an inventory snapshot for historical tracking.
   */
  async takeSnapshot(orgId: string): Promise<InventorySnapshot> {
    const contentTypes = await this.getInventoryStatus(orgId);

    const totalAssets = contentTypes.reduce((sum, ct) => sum + ct.currentCount, 0);
    const totalTarget = contentTypes.reduce((sum, ct) => sum + ct.targetCount, 0);
    const overallCoverage = totalTarget > 0 ? totalAssets / totalTarget : 0;

    // Determine overall health
    const healthCounts = { healthy: 0, low: 0, critical: 0, overstocked: 0 };
    for (const ct of contentTypes) {
      healthCounts[ct.health]++;
    }

    let overallHealth: InventoryHealth = 'healthy';
    if (healthCounts.critical > 0) overallHealth = 'critical';
    else if (healthCounts.low > healthCounts.healthy) overallHealth = 'low';

    return {
      id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      orgId,
      snapshotDate: new Date(),
      contentTypes,
      overallCoverage,
      overallHealth,
      totalAssets,
      totalTarget,
    };
  }

  // ── Freshness ────────────────────────────────────────────────────────────

  /**
   * Calculate freshness score for content of a specific type.
   */
  async calculateFreshness(orgId: string, contentTypeId: string): Promise<number> {
    const now = new Date();

    const contents = await db
      .select({
        createdAt: mediaAssetSchema.createdAt,
      })
      .from(mediaAssetSchema)
      .where(
        and(
          eq(mediaAssetSchema.orgId, orgId),
          eq(mediaAssetSchema.assetType, contentTypeId),
          eq(mediaAssetSchema.status, 'validated'),
        ),
      );

    if (contents.length === 0) return 0;

    // Calculate average age in days
    let totalAgeDays = 0;
    for (const content of contents) {
      const ageMs = now.getTime() - content.createdAt.getTime();
      totalAgeDays += ageMs / (1000 * 60 * 60 * 24);
    }

    const averageAgeDays = totalAgeDays / contents.length;

    // Get decay rate for this content type
    const decayRate = this.getDecayRate(contentTypeId);

    // Freshness = exponential decay based on half-life
    const freshness = Math.exp(-0.693 * averageAgeDays / decayRate.halfLifeDays);

    return Math.max(0, Math.min(1, freshness));
  }

  /**
   * Get freshness scores for all contents.
   */
  async getContentFreshness(
    orgId: string,
    contentTypeId?: string,
  ): Promise<FreshnessScore[]> {
    const whereConditions = [
      eq(mediaAssetSchema.orgId, orgId),
      eq(mediaAssetSchema.status, 'validated'),
    ];

    if (contentTypeId) {
      whereConditions.push(eq(mediaAssetSchema.assetType, contentTypeId));
    }

    const contents = await db
      .select({
        id: mediaAssetSchema.id,
        createdAt: mediaAssetSchema.createdAt,
      })
      .from(mediaAssetSchema)
      .where(and(...whereConditions));

    const now = new Date();
    const decayRate = this.getDecayRate(contentTypeId ?? 'default');

    return contents.map(content => {
      const ageMs = now.getTime() - content.createdAt.getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      const freshness = Math.exp(-0.693 * ageDays / decayRate.halfLifeDays);

      return {
        contentId: content.id,
        ageDays: Math.round(ageDays),
        freshness: Math.max(0, Math.min(1, freshness)),
        category: this.categorizeFreshness(ageDays),
        regenerationRecommended: ageDays > decayRate.refreshFrequencyDays,
      };
    });
  }

  // ── Coverage ─────────────────────────────────────────────────────────────

  /**
   * Calculate coverage across all content types.
   */
  async calculateCoverage(orgId: string): Promise<number> {
    const statuses = await this.getInventoryStatus(orgId);
    if (statuses.length === 0) return 0;

    const totalCoverage = statuses.reduce((sum, ct) => sum + ct.coverage, 0);
    return totalCoverage / statuses.length;
  }

  /**
   * Get content types that need more content.
   */
  async getDeficits(orgId: string): Promise<Array<{
    contentTypeId: string;
    deficit: number;
    priority: 'critical' | 'high' | 'medium' | 'low';
  }>> {
    const statuses = await this.getInventoryStatus(orgId);
    const deficits: Array<{
      contentTypeId: string;
      deficit: number;
      priority: 'critical' | 'high' | 'medium' | 'low';
    }> = [];

    for (const ct of statuses) {
      const deficit = ct.targetCount - ct.currentCount;
      if (deficit > 0) {
        deficits.push({
          contentTypeId: ct.contentTypeId,
          deficit,
          priority: this.deficitToPriority(ct.coverage),
        });
      }
    }

    // Sort by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    deficits.sort((a, b) => (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4));

    return deficits;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Determine inventory health from coverage.
   */
  private determineHealth(coverage: number): InventoryHealth {
    if (coverage >= this.config.healthyThreshold) return 'healthy';
    if (coverage >= this.config.lowThreshold) return 'low';
    if (coverage <= 0) return 'critical';
    return 'critical';
  }

  /**
   * Convert coverage to priority.
   */
  private deficitToPriority(coverage: number): 'critical' | 'high' | 'medium' | 'low' {
    if (coverage < 0.3) return 'critical';
    if (coverage < 0.5) return 'high';
    if (coverage < 0.8) return 'medium';
    return 'low';
  }

  /**
   * Categorize freshness based on age.
   */
  private categorizeFreshness(ageDays: number): FreshnessCategory {
    if (ageDays < 30) return 'fresh';
    if (ageDays < 90) return 'mature';
    if (ageDays < 180) return 'aging';
    if (ageDays < 365) return 'stale';
    return 'expired';
  }

  /**
   * Get decay rate for a content type.
   */
  private getDecayRate(contentTypeId: string): DecayRate {
    // Try to find industry-specific decay rate
    const industryRate = this.decayRates.find(
      r => r.industry.toLowerCase() === contentTypeId.toLowerCase(),
    );

    if (industryRate) return industryRate;

    // Default decay rate
    return {
      industry: 'default',
      halfLifeDays: this.config.freshnessDecayDays,
      refreshFrequencyDays: this.config.freshnessDecayDays,
    };
  }

  /**
   * Get age statistics for content.
   */
  private async getAgeStats(
    orgId: string,
    contentTypeId: string,
  ): Promise<{
    lastGenerated: Date | null;
    oldestAge: number;
    newestAge: number;
    averageAge: number;
  }> {
    const now = new Date();

    const contents = await db
      .select({
        createdAt: mediaAssetSchema.createdAt,
      })
      .from(mediaAssetSchema)
      .where(
        and(
          eq(mediaAssetSchema.orgId, orgId),
          eq(mediaAssetSchema.assetType, contentTypeId),
          eq(mediaAssetSchema.status, 'validated'),
        ),
      )
      .orderBy(sql`${mediaAssetSchema.createdAt} DESC`);

    if (contents.length === 0) {
      return {
        lastGenerated: null,
        oldestAge: 0,
        newestAge: 0,
        averageAge: 0,
      };
    }

    let totalAgeDays = 0;
    let oldestAgeDays = 0;
    let newestAgeDays = Infinity;

    for (const content of contents) {
      const ageMs = now.getTime() - content.createdAt.getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      totalAgeDays += ageDays;
      oldestAgeDays = Math.max(oldestAgeDays, ageDays);
      newestAgeDays = Math.min(newestAgeDays, ageDays);
    }

    return {
      lastGenerated: contents[0]?.createdAt ?? null,
      oldestAge: Math.round(oldestAgeDays),
      newestAge: Math.round(newestAgeDays),
      averageAge: Math.round(totalAgeDays / contents.length),
    };
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: InventoryEngine | null = null;

export function getInventoryEngine(
  config?: Partial<InventoryConfig>,
): InventoryEngine {
  if (!_instance) {
    _instance = new InventoryEngine(config);
  }
  return _instance;
}
