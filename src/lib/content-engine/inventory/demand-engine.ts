// Content Intelligence Engine — Demand Engine
// Phase 7: Creates generation tasks based on inventory gaps

import { db } from '@/lib/db';
import { contentTypeSchema } from '@/models/Schema';
import { eq } from 'drizzle-orm';
import type {
  GenerationDemand,
  GenerationBrief,
  BriefRequirement,
  DemandPriority,
  DemandMetadata,
  InventoryEngineConfig,
} from './types';
import { getInventoryEngine } from './inventory-engine';
import { getDiversityEngine } from './diversity-engine';

// ─── Demand Engine ───────────────────────────────────────────────────────────

/**
 * DemandEngine — creates generation tasks based on inventory gaps.
 *
 * This is where autonomy begins.
 *
 * The system creates generation tasks:
 *   "Need 400 B2B UGC, 200 Fitness slideshows, 300 female talking heads"
 *
 * Then creates a generation queue:
 *   Task 1: Generate 50 Female SaaS UGC
 *   Task 2: Generate 40 Fitness talking heads
 */
export class DemandEngine {
  private config: InventoryEngineConfig['demand'];
  private inventoryConfig: InventoryEngineConfig['inventory'];

  constructor(config: Partial<InventoryEngineConfig> = {}) {
    this.config = {
      batchSize: 50,
      maxConcurrentTasks: 5,
      priorityThresholds: {
        critical: 0.3,
        high: 0.5,
        medium: 0.8,
      },
      ...config.demand,
    };

    this.inventoryConfig = {
      healthyThreshold: 0.8,
      lowThreshold: 0.5,
      overstockedThreshold: 1.2,
      freshnessDecayDays: 90,
      criticalDecayDays: 180,
      defaultTargetPerType: 1000,
      ...config.inventory,
    };
  }

  // ── Demand Generation ────────────────────────────────────────────────────

  /**
   * Analyze inventory and generate demand.
   */
  async generateDemand(orgId: string): Promise<GenerationDemand[]> {
    const demands: GenerationDemand[] = [];

    // 1. Get inventory deficits
    const inventoryEngine = getInventoryEngine(this.inventoryConfig);
    const deficits = await inventoryEngine.getDeficits(orgId);

    // 2. Get diversity imbalances
    const diversityEngine = getDiversityEngine();
    const imbalances = await diversityEngine.detectImbalances(orgId);

    // 3. Generate demands from deficits
    for (const deficit of deficits) {
      const contentType = await this.getContentType(deficit.contentTypeId);
      if (!contentType) continue;

      // Create batches
      const batches = this.createBatches(deficit.deficit, this.config.batchSize);

      for (let i = 0; i < batches.length; i++) {
        const batchSize = batches[i] ?? 0;
        if (batchSize <= 0) continue;

        const demand = this.createDemandFromDeficit(
          orgId,
          deficit.contentTypeId,
          contentType.name,
          batchSize,
          deficit.priority,
          {
            inventoryStatus: `Deficit: ${deficit.deficit}`,
            deficitCount: deficit.deficit,
            triggeredBy: 'inventory_check',
          },
        );

        demands.push(demand);
      }
    }

    // 4. Generate demands from diversity gaps
    const diversityDemands = this.createDemandsFromDiversity(
      orgId,
      imbalances,
    );
    demands.push(...diversityDemands);

    // 5. Sort by priority
    demands.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4);
    });

    return demands;
  }

  /**
   * Generate demand for a specific content type.
   */
  async generateDemandForType(
    orgId: string,
    contentTypeId: string,
    count: number,
    priority: DemandPriority = 'medium',
    briefOverrides?: Partial<GenerationBrief>,
  ): Promise<GenerationDemand> {
    const contentType = await this.getContentType(contentTypeId);
    if (!contentType) {
      throw new Error(`Content type ${contentTypeId} not found`);
    }

    return this.createDemandFromDeficit(
      orgId,
      contentTypeId,
      contentType.name,
      count,
      priority,
      {
        inventoryStatus: `Manual request: ${count}`,
        deficitCount: count,
        triggeredBy: 'manual',
      },
      briefOverrides,
    );
  }

  // ── Brief Generation ─────────────────────────────────────────────────────

  /**
   * Create a generation brief from a demand.
   */
  createBrief(
    contentTypeId: string,
    count: number,
    overrides?: Partial<GenerationBrief>,
  ): GenerationBrief {
    const requirements: BriefRequirement[] = [];

    // Add content-type specific requirements
    switch (contentTypeId) {
      case 'talking_head':
        requirements.push(
          { type: 'face', value: 'visible', priority: 'required' },
          { type: 'audio', value: 'speech', priority: 'required' },
        );
        break;
      case 'ugc':
        requirements.push(
          { type: 'face', value: 'visible', priority: 'required' },
          { type: 'style', value: 'authentic', priority: 'required' },
          { type: 'audio', value: 'speech', priority: 'required' },
        );
        break;
      case 'reel':
        requirements.push(
          { type: 'duration', value: '3-60s', priority: 'required' },
          { type: 'audio', value: 'valid', priority: 'required' },
        );
        break;
      case 'slideshow':
        requirements.push(
          { type: 'assets', value: '3-5 images', priority: 'required' },
          { type: 'audio', value: 'background_music', priority: 'required' },
        );
        break;
      case 'green_screen':
        requirements.push(
          { type: 'face', value: 'visible', priority: 'required' },
          { type: 'background', value: 'removable', priority: 'required' },
        );
        break;
    }

    return {
      contentType: contentTypeId,
      count,
      requirements,
      metadata: {},
      ...overrides,
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Create a demand from an inventory deficit.
   */
  private createDemandFromDeficit(
    orgId: string,
    contentTypeId: string,
    contentTypeName: string,
    count: number,
    priority: DemandPriority,
    metadata: DemandMetadata,
    briefOverrides?: Partial<GenerationBrief>,
  ): GenerationDemand {
    const brief = this.createBrief(contentTypeId, count, briefOverrides);

    return {
      id: `demand_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      orgId,
      contentTypeId,
      contentType: contentTypeName,
      priority,
      count,
      brief,
      status: 'pending',
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      metadata,
    };
  }

  /**
   * Create demands from diversity imbalances.
   */
  private createDemandsFromDiversity(
    orgId: string,
    imbalances: Array<{
      dimension: string;
      category: string;
      deficit: number;
      severity: string;
    }>,
  ): GenerationDemand[] {
    const demands: GenerationDemand[] = [];

    // Group by dimension + category
    const grouped = new Map<string, number>();
    for (const imbalance of imbalances) {
      const key = `${imbalance.dimension}:${imbalance.category}`;
      grouped.set(key, (grouped.get(key) ?? 0) + imbalance.deficit);
    }

    // Create demands for significant gaps
    for (const [key, deficit] of grouped) {
      if (deficit < 10) continue; // Skip small gaps

      const [dimension, category] = key.split(':');
      const priority = deficit >= 100 ? 'high' : 'medium';

      // Create a brief for this diversity gap
      const brief = this.createBrief('diversity_gap', Math.min(deficit, this.config.batchSize), {
        audience: category,
        count: Math.min(deficit, this.config.batchSize),
        metadata: { dimension, category },
      });

      demands.push({
        id: `demand_div_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        orgId,
        contentTypeId: 'diversity_gap',
        contentType: `Diversity: ${category}`,
        priority: priority as DemandPriority,
        count: Math.min(deficit, this.config.batchSize),
        brief,
        status: 'pending',
        createdAt: new Date(),
        startedAt: null,
        completedAt: null,
        metadata: {
          inventoryStatus: `Diversity gap: ${deficit}`,
          deficitCount: deficit,
          triggeredBy: 'diversity_gap',
        },
      });
    }

    return demands;
  }

  /**
   * Create batches from a total count.
   */
  private createBatches(total: number, batchSize: number): number[] {
    const batches: number[] = [];
    let remaining = total;

    while (remaining > 0) {
      const batch = Math.min(remaining, batchSize);
      batches.push(batch);
      remaining -= batch;
    }

    return batches;
  }

  /**
   * Get a content type by ID.
   */
  private async getContentType(contentTypeId: string) {
    const results = await db
      .select()
      .from(contentTypeSchema)
      .where(eq(contentTypeSchema.id, contentTypeId))
      .limit(1);

    return results[0] ?? null;
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: DemandEngine | null = null;

export function getDemandEngine(
  config?: Partial<InventoryEngineConfig>,
): DemandEngine {
  if (!_instance) {
    _instance = new DemandEngine(config);
  }
  return _instance;
}
