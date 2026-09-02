// Content Intelligence Engine — Construction Engine
// Phase 6: Transforms qualified MediaAssets into LibraryContent

import { db } from '@/lib/db';
import {
  mediaAssetSchema,
  contentTypeSchema,
  contentCompositionSchema,
  assetUsageSchema,
  tagSchema,
} from '@/models/Schema';
import { eq, inArray } from 'drizzle-orm';
import type {
  QualificationRules,
  ConstructionRules,
  SlotSchema,
  PopulatedSlots,
  ConstructionPlan,
  ContentComposition,
  ConstructionEngineConfig,
} from './types';
import { ContentQualificationEngine, getContentQualificationEngine } from './qualification-engine';
import { SlideshowMatcher, getSlideshowMatcher } from './slideshow-matcher';
import { TextGenerator, getTextGenerator } from './text-generator';
import { AudioSelector, getAudioSelector } from './audio-selector';
import {
  CompositionQualityEvaluator,
  getCompositionQualityEvaluator,
} from './composition-quality';

// ─── Construction Engine ─────────────────────────────────────────────────────

/**
 * ConstructionEngine — orchestrates the transformation of qualified
 * MediaAssets into LibraryContent.
 *
 * Pipeline:
 *   MEDIA ASSETS → QUALIFICATION → CONSTRUCTION → QUALITY → LIBRARY CONTENT
 *
 * This is the core engine that defines what NativPost manages.
 * The UI is downstream.
 */
export class ConstructionEngine {
  private config: ConstructionEngineConfig;
  private qualificationEngine: ContentQualificationEngine;
  private slideshowMatcher: SlideshowMatcher;
  private textGenerator: TextGenerator;
  private audioSelector: AudioSelector;
  private qualityEvaluator: CompositionQualityEvaluator;

  constructor(config: Partial<ConstructionEngineConfig> = {}) {
    this.config = {
      qualificationVersion: '1.0.0',
      constructionVersion: '1.0.0',
      qualityVersion: '1.0.0',
      defaultMaxAssets: 5,
      slideshowCompatibilityThreshold: 0.6,
      minSlideshowTagOverlap: 1,
      maxSlideshowVisualSimilarity: 0.85,
      deterministicByDefault: true,
      ...config,
    };

    this.qualificationEngine = getContentQualificationEngine(
      this.config.qualificationVersion,
    );
    this.slideshowMatcher = getSlideshowMatcher({
      compatibilityThreshold: this.config.slideshowCompatibilityThreshold,
      minTagOverlap: this.config.minSlideshowTagOverlap,
      maxVisualSimilarity: this.config.maxSlideshowVisualSimilarity,
    });
    this.textGenerator = getTextGenerator(this.config.constructionVersion);
    this.audioSelector = getAudioSelector(this.config.constructionVersion);
    this.qualityEvaluator = getCompositionQualityEvaluator(
      this.config.qualityVersion,
    );
  }

  // ── Main Entry Points ────────────────────────────────────────────────────

  /**
   * Construct content from eligible assets.
   *
   * @param assetIds - Qualified asset IDs
   * @param contentTypeId - Target content type
   * @param orgId - Organization ID
   * @param name - Optional composition name
   * @returns ContentComposition or null if construction fails
   */
  async construct(
    assetIds: string[],
    contentTypeId: string,
    orgId: string,
    name?: string,
  ): Promise<ContentComposition | null> {
    // 1. Fetch content type config
    const contentType = await this.getContentType(contentTypeId);
    if (!contentType) {
      return null;
    }

    // 2. Qualify assets
    const qualifications = await this.qualificationEngine.qualifyBatch(
      assetIds,
      contentTypeId,
      contentType.qualificationRules,
      contentType.slotSchema,
    );

    const eligibleAssets = assetIds.filter(id => {
      const result = qualifications.get(id);
      return result?.eligible === true;
    });

    if (eligibleAssets.length === 0) {
      return null;
    }

    // 3. Build construction plan
    const plan = await this.buildPlan(
      eligibleAssets,
      contentType,
      orgId,
    );

    if (!plan) {
      return null;
    }

    // 4. Create composition
    const composition = await this.createComposition(plan, orgId, name);

    // 5. Evaluate quality
    const qualityResult = this.qualityEvaluator.evaluate(composition);

    // 6. Update composition with quality score
    composition.qualityScore = qualityResult.score;
    composition.isComplete = qualityResult.passed;

    // 7. Store in database
    await this.storeComposition(composition);

    // 8. Track asset usage
    for (const assetId of eligibleAssets) {
      await this.trackAssetUsage(assetId, composition.id, orgId);
    }

    return composition;
  }

  /**
   * Create a ContentComposition from a ConstructionPlan.
   */
  private async createComposition(
    plan: ConstructionPlan,
    _orgId: string,
    name?: string,
  ): Promise<ContentComposition> {
    return {
      id: '', // Will be set by DB
      contentTypeId: plan.contentTypeId,
      orgId: plan.orgId,
      name: name ?? `Composition ${new Date().toISOString()}`,
      version: 1,
      slots: plan.slots,
      metadata: {
        constructionVersion: plan.constructionVersion,
        constructedAt: new Date(),
        assetCount: plan.metadata.assetCount,
        assetIds: plan.metadata.assetIds,
        qualificationScores: plan.metadata.qualificationScores,
      },
      qualityScore: null,
      isComplete: false,
    };
  }

  /**
   * Construct slideshow content specifically.
   */
  async constructSlideshow(
    candidateAssetIds: string[],
    orgId: string,
    name?: string,
  ): Promise<ContentComposition | null> {
    // 1. Fetch candidate assets with tags
    const candidates = await this.fetchSlideshowCandidates(candidateAssetIds);

    // 2. Find compatible set
    const slideshowPlan = await this.slideshowMatcher.findCompatibleSet(
      candidates,
      3, // Minimum for slideshow
    );

    if (!slideshowPlan) {
      return null;
    }

    // 3. Fetch content type
    const contentType = await this.getContentType('slideshow');
    if (!contentType) return null;

    // 4. Generate text for slides
    const slideTexts = this.textGenerator.generateSlideshowText(
      slideshowPlan.assets.map(a => ({
        assetTags: a.tags,
        assetDescription: a.tags.join(', '),
        slideRole: slideshowPlan.ordering.find(o => o.assetId === a.assetId)?.role ?? 'context',
      })),
    );

    // 5. Select audio
    const audio = await this.audioSelector.selectAudio(
      orgId,
      'slideshow',
      slideTexts.length * 3, // 3 seconds per slide
      slideshowPlan.assets.flatMap(a => a.tags),
    );

    // 6. Build slots
    const slots: PopulatedSlots = {};
    for (const order of slideshowPlan.ordering) {
      const asset = slideshowPlan.assets.find(a => a.assetId === order.assetId);
      if (asset) {
        slots[order.slotName] = {
          type: 'image',
          assetId: asset.assetId,
          url: asset.url,
        };
      }
    }

    if (audio) {
      slots.background_music = {
        type: 'audio',
        assetId: audio.assetId,
        url: audio.url,
        metadata: {
          volume: audio.volume,
          loop: audio.loop,
        },
      };
    }

    // 7. Create composition
    const composition: ContentComposition = {
      id: '', // Will be set by DB
      contentTypeId: 'slideshow',
      orgId,
      name: name ?? `Slideshow ${new Date().toISOString()}`,
      version: 1,
      slots,
      metadata: {
        constructionVersion: this.config.constructionVersion,
        constructedAt: new Date(),
        assetCount: slideshowPlan.assets.length,
        assetIds: slideshowPlan.assets.map(a => a.assetId),
        qualificationScores: {},
        compatibilityScore: slideshowPlan.compatibilityScore,
        sequencingMethod: slideshowPlan.sequencingMethod,
      },
      qualityScore: null,
      isComplete: false,
    };

    // 8. Evaluate quality
    const qualityResult = this.qualityEvaluator.evaluate(composition);
    composition.qualityScore = qualityResult.score;
    composition.isComplete = qualityResult.passed;

    // 9. Store
    await this.storeComposition(composition);

    return composition;
  }

  // ── Plan Building ────────────────────────────────────────────────────────

  /**
   * Build a construction plan for assets.
   */
  private async buildPlan(
    assetIds: string[],
    contentType: ContentTypeConfig,
    orgId: string,
  ): Promise<ConstructionPlan | null> {
    const assets = await this.fetchAssetsForConstruction(assetIds);

    if (assets.length === 0) return null;

    // Build slots based on content type
    const slots = this.populateSlots(assets, contentType.slotSchema);

    // Generate text
    const text = this.textGenerator.generateSlideshowText(
      assets.map(a => ({
        assetTags: a.tags,
        assetDescription: a.description,
        slideRole: 'context' as const,
      })),
    );

    // Select audio
    const audio = await this.audioSelector.selectAudio(
      orgId,
      contentType.id,
      assets.reduce((sum, a) => sum + (a.durationSeconds ?? 0), 0),
      assets.flatMap(a => a.tags),
    );

    return {
      contentTypeId: contentType.id,
      orgId,
      slots,
      text,
      audio,
      metadata: {
        constructionVersion: this.config.constructionVersion,
        constructedAt: new Date(),
        assetCount: assets.length,
        assetIds,
        qualificationScores: {},
      },
      constructionVersion: this.config.constructionVersion,
      deterministic: this.config.deterministicByDefault,
    };
  }

  /**
   * Populate slots based on asset types and slot schema.
   */
  private populateSlots(
    assets: AssetForConstruction[],
    slotSchema: SlotSchema,
  ): PopulatedSlots {
    const slots: PopulatedSlots = {};
    const usedAssets = new Set<string>();

    // Match assets to slots by type
    for (const [slotName, slotDef] of Object.entries(slotSchema)) {
      const compatibleAsset = assets.find(
        a => a.assetType === slotDef.type && !usedAssets.has(a.id),
      );

      if (compatibleAsset) {
        slots[slotName] = {
          type: compatibleAsset.assetType as 'image' | 'video' | 'audio' | 'text',
          assetId: compatibleAsset.id,
          url: compatibleAsset.url,
          duration: compatibleAsset.durationSeconds ?? undefined,
        };
        usedAssets.add(compatibleAsset.id);
      } else if (slotDef.type === 'text') {
        slots[slotName] = {
          type: 'text',
          text: '', // Will be filled by text generator
        };
      }
    }

    return slots;
  }

  // ── Composition Storage ──────────────────────────────────────────────────

  /**
   * Store a composition in the database.
   */
  private async storeComposition(composition: ContentComposition): Promise<void> {
    const result = await db
      .insert(contentCompositionSchema)
      .values({
        contentTypeId: composition.contentTypeId,
        orgId: composition.orgId,
        name: composition.name,
        version: composition.version,
        slots: composition.slots as any,
        metadata: composition.metadata as any,
        qualityScore: composition.qualityScore,
        isComplete: composition.isComplete,
      })
      .returning({ id: contentCompositionSchema.id });

    if (result[0]) {
      composition.id = result[0].id;
    }
  }

  /**
   * Track asset usage in a composition.
   */
  private async trackAssetUsage(
    assetId: string,
    compositionId: string,
    orgId: string,
  ): Promise<void> {
    await db.insert(assetUsageSchema).values({
      assetId,
      orgId,
      compositionId,
      usageType: 'composition',
    });
  }

  // ── Data Fetching ────────────────────────────────────────────────────────

  /**
   * Fetch a content type configuration.
   */
  private async getContentType(
    contentTypeId: string,
  ): Promise<ContentTypeConfig | null> {
    const result = await db
      .select()
      .from(contentTypeSchema)
      .where(eq(contentTypeSchema.id, contentTypeId))
      .limit(1);

    if (result.length === 0 || !result[0]) return null;

    const row = result[0];
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description ?? undefined,
      minAssets: row.minAssets,
      maxAssets: row.maxAssets,
      requiresVideo: row.requiresVideo,
      requiresAudio: row.requiresAudio,
      requiresTextOverlay: row.requiresTextOverlay,
      requiresCaption: row.requiresCaption,
      slotSchema: row.slotSchema as SlotSchema,
      qualificationRules: row.qualificationRules as QualificationRules,
      constructionRules: row.constructionRules as ConstructionRules,
      renderConfig: row.renderConfig as Record<string, unknown>,
      isActive: row.isActive,
    };
  }

  /**
   * Fetch assets for construction.
   */
  private async fetchAssetsForConstruction(
    assetIds: string[],
  ): Promise<AssetForConstruction[]> {
    if (assetIds.length === 0) return [];

    const results = await db
      .select({
        id: mediaAssetSchema.id,
        url: mediaAssetSchema.url,
        assetType: mediaAssetSchema.assetType,
        durationSeconds: mediaAssetSchema.durationSeconds,
        qualityScore: mediaAssetSchema.qualityScore,
      })
      .from(mediaAssetSchema)
      .where(inArray(mediaAssetSchema.id, assetIds));

    return results.map(r => ({
      id: r.id,
      url: r.url,
      assetType: r.assetType,
      durationSeconds: r.durationSeconds,
      qualityScore: r.qualityScore,
      description: '',
      tags: [],
    }));
  }

  /**
   * Fetch slideshow candidates with tags.
   */
  private async fetchSlideshowCandidates(
    assetIds: string[],
  ): Promise<SlideshowCandidate[]> {
    if (assetIds.length === 0) return [];

    const assets = await this.fetchAssetsForConstruction(assetIds);

    // Fetch tags for each asset
    const candidates: SlideshowCandidate[] = [];
    for (const asset of assets) {
      const tags = await this.fetchAssetTags(asset.id);
      candidates.push({
        assetId: asset.id,
        url: asset.url,
        assetType: asset.assetType,
        tags,
        visualQualityScore: asset.qualityScore,
        aspectRatio: null,
        durationSeconds: asset.durationSeconds,
      });
    }

    return candidates;
  }

  /**
   * Fetch tags for an asset.
   */
  private async fetchAssetTags(assetId: string): Promise<string[]> {
    const results = await db
      .select({ name: tagSchema.name })
      .from(assetUsageSchema)
      .innerJoin(tagSchema, eq(assetUsageSchema.assetId, tagSchema.id))
      .where(eq(assetUsageSchema.assetId, assetId));

    return results.map(r => r.name);
  }
}

// ─── Internal Types ──────────────────────────────────────────────────────────

interface ContentTypeConfig {
  id: string;
  slug: string;
  name: string;
  description?: string;
  minAssets: number;
  maxAssets: number;
  requiresVideo: boolean;
  requiresAudio: boolean;
  requiresTextOverlay: boolean;
  requiresCaption: boolean;
  slotSchema: SlotSchema;
  qualificationRules: QualificationRules;
  constructionRules: ConstructionRules;
  renderConfig: Record<string, unknown>;
  isActive: boolean;
}

interface AssetForConstruction {
  id: string;
  url: string;
  assetType: string;
  durationSeconds: number | null;
  qualityScore: number | null;
  description: string;
  tags: string[];
}

interface SlideshowCandidate {
  assetId: string;
  url: string;
  assetType: string;
  tags: string[];
  semanticEmbedding?: number[];
  visualQualityScore: number | null;
  aspectRatio: string | null;
  durationSeconds: number | null;
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: ConstructionEngine | null = null;

export function getConstructionEngine(
  config?: Partial<ConstructionEngineConfig>,
): ConstructionEngine {
  if (!_instance) {
    _instance = new ConstructionEngine(config);
  }
  return _instance;
}
