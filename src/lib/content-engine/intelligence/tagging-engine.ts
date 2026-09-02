// Content Intelligence Engine — Tagging Engine
// Phase 5: Core orchestration for content intelligence

import { db } from '@/lib/db';
import { tagSchema, assetTagSchema, mediaAssetSchema } from '@/models/Schema';
import { eq, and } from 'drizzle-orm';
import type {
  AssetAnalysis,
  AnalyzedTag,
  AssetSearchCriteria,
  AssetSearchResult,
  SimilaritySearchCriteria,
  TagCategory,
  TagSource,
} from './types';
import { DEFAULT_TAGGING_CONFIG } from './types';
import type { TaggingEngineConfig } from './types';
import { ImageAnalyzer, getImageAnalyzer } from './image-analyzer';
import { VideoAnalyzer, getVideoAnalyzer } from './video-analyzer';
import { EmbeddingService, getEmbeddingService } from './embedding-service';

// ─── Tagging Engine ─────────────────────────────────────────────────────────

/**
 * TaggingEngine — orchestrates content intelligence for assets.
 *
 * Responsibilities:
 * 1. Analyze media (image/video)
 * 2. Extract and normalize tags
 * 3. Store tags in database
 * 4. Generate embeddings
 * 5. Provide search primitives
 *
 * Does NOT:
 * - Make content construction decisions (Phase 6/7)
 * - Determine content type qualification (Phase 6)
 * - Assemble content (Phase 7)
 */
export class TaggingEngine {
  private config: TaggingEngineConfig;
  private imageAnalyzer: ImageAnalyzer;
  private videoAnalyzer: VideoAnalyzer;
  private embeddingService: EmbeddingService;

  constructor(config: Partial<TaggingEngineConfig> = {}) {
    this.config = { ...DEFAULT_TAGGING_CONFIG, ...config };
    this.imageAnalyzer = getImageAnalyzer();
    this.videoAnalyzer = getVideoAnalyzer({
      frameSamplingRate: this.config.frameSamplingRate,
      maxFramesToSample: this.config.maxFramesToSample,
    });
    this.embeddingService = getEmbeddingService({
      embeddingModel: this.config.embeddingModel,
      embeddingDimensions: this.config.embeddingDimensions,
      embeddingVersion: this.config.taggingVersion,
    });
  }

  /**
   * Analyze an asset and store its intelligence.
   *
   * @param assetId - The asset ID to analyze
   * @param assetUrl - URL of the media
   * @param mediaType - Type of media (image/video)
   * @param metadata - Optional processing metadata
   * @returns Analysis result
   */
  async analyzeAndStore(
    assetId: string,
    assetUrl: string,
    mediaType: 'image' | 'video',
    metadata?: Record<string, unknown>,
  ): Promise<AssetAnalysis> {
    // 1. Analyze media
    let analysis: AssetAnalysis;
    if (mediaType === 'image') {
      analysis = await this.imageAnalyzer.analyze(assetUrl, metadata);
    } else {
      analysis = await this.videoAnalyzer.analyze(assetUrl, metadata);
    }
    analysis.assetId = assetId;

    // 2. Store tags in database
    await this.storeTags(assetId, analysis.tags);

    // 3. Generate and store embeddings
    await this.generateAndStoreEmbeddings(assetId, analysis, mediaType);

    // 4. Update asset metadata
    await this.updateAssetMetadata(assetId, analysis);

    return analysis;
  }

  /**
   * Store tags for an asset.
   */
  private async storeTags(
    assetId: string,
    tags: AnalyzedTag[],
  ): Promise<void> {
    // Get or create tags, then create asset-tag relationships
    for (const tag of tags) {
      // Find or create tag
      const tagId = await this.findOrCreateTag(tag);

      // Create asset-tag relationship
      await db
        .insert(assetTagSchema)
        .values({
          assetId,
          tagId,
          confidence: tag.confidence,
          source: tag.source,
          version: 1,
        })
        .onConflictDoUpdate({
          target: [assetTagSchema.assetId, assetTagSchema.tagId],
          set: {
            confidence: tag.confidence,
            source: tag.source,
          },
        });
    }
  }

  /**
   * Find or create a tag.
   */
  private async findOrCreateTag(tag: AnalyzedTag): Promise<string> {
    const slug = tag.name.toLowerCase().replace(/\s+/g, '-');

    // Try to find existing tag
    const existing = await db
      .select()
      .from(tagSchema)
      .where(eq(tagSchema.slug, slug))
      .limit(1);

    if (existing.length > 0 && existing[0]) {
      // Increment usage count
      await db
        .update(tagSchema)
        .set({
          usageCount: existing[0].usageCount + 1,
        })
        .where(eq(tagSchema.id, existing[0].id));

      return existing[0].id;
    }

    // Create new tag
    const newTag = await db
      .insert(tagSchema)
      .values({
        name: tag.name,
        slug,
        type: tag.category,
        isSystem: false,
        isActive: true,
        usageCount: 1,
      })
      .returning({ id: tagSchema.id });

    if (!newTag[0]) {
      throw new Error('Failed to create tag');
    }

    return newTag[0].id;
  }

  /**
   * Generate and store embeddings for an asset.
   */
  private async generateAndStoreEmbeddings(
    assetId: string,
    analysis: AssetAnalysis,
    mediaType: 'image' | 'video',
  ): Promise<void> {
    // Generate semantic embedding from description and tags
    const textForEmbedding = [
      analysis.description,
      ...analysis.tags.map(t => t.name),
      ...analysis.semanticConcepts,
    ].join(' ');

    const { vector: semanticVector, metadata: semanticMeta } =
      await this.embeddingService.generateTextEmbedding(textForEmbedding);

    await this.embeddingService.storeEmbedding(
      assetId,
      'semantic',
      semanticVector,
      semanticMeta,
    );

    // Generate visual embedding for images
    if (mediaType === 'image') {
      const { vector: visualVector, metadata: visualMeta } =
        await this.embeddingService.generateVisualEmbedding('');

      await this.embeddingService.storeEmbedding(
        assetId,
        'visual',
        visualVector,
        visualMeta,
      );
    }
  }

  /**
   * Update asset metadata with analysis results.
   */
  private async updateAssetMetadata(
    assetId: string,
    analysis: AssetAnalysis,
  ): Promise<void> {
    await db
      .update(mediaAssetSchema)
      .set({
        metadata: {
          taggingVersion: this.config.taggingVersion,
          tagsCount: analysis.tags.length,
          conceptsCount: analysis.semanticConcepts.length,
          description: analysis.description,
          lastTaggedAt: new Date().toISOString(),
        } as any,
      })
      .where(eq(mediaAssetSchema.id, assetId));
  }

  /**
   * Find assets by tags and criteria.
   */
  async findByTags(
    criteria: AssetSearchCriteria,
  ): Promise<AssetSearchResult[]> {
    const {
      orgId,
      tagIds,
      minConfidence = 0.6,
      limit = 20,
      offset = 0,
    } = criteria;

    // Build where conditions
    const conditions = [
      eq(mediaAssetSchema.orgId, orgId),
      eq(mediaAssetSchema.status, 'validated'),
    ];

    if (tagIds && tagIds.length > 0 && tagIds[0]) {
      conditions.push(eq(assetTagSchema.tagId, tagIds[0]));
    }

    if (minConfidence) {
      conditions.push(eq(assetTagSchema.confidence, minConfidence));
    }

    // Execute query
    const results = await db
      .select({
        assetId: assetTagSchema.assetId,
        score: assetTagSchema.confidence,
        tagName: tagSchema.name,
        tagCategory: tagSchema.type,
        assetDescription: mediaAssetSchema.metadata,
      })
      .from(assetTagSchema)
      .innerJoin(tagSchema, eq(assetTagSchema.tagId, tagSchema.id))
      .innerJoin(mediaAssetSchema, eq(assetTagSchema.assetId, mediaAssetSchema.id))
      .where(and(...conditions))
      .limit(limit)
      .offset(offset);

    // Group by asset
    const assetMap = new Map<string, AssetSearchResult>();
    for (const row of results) {
      if (!assetMap.has(row.assetId)) {
        assetMap.set(row.assetId, {
          assetId: row.assetId,
          score: row.score,
          tags: [],
          description: (row.assetDescription as any)?.description ?? '',
        });
      }
      assetMap.get(row.assetId)!.tags.push({
        name: row.tagName,
        category: row.tagCategory as TagCategory,
        confidence: row.score,
      });
    }

    return Array.from(assetMap.values());
  }

  /**
   * Find similar assets using embeddings.
   */
  async findSimilar(
    criteria: SimilaritySearchCriteria,
  ): Promise<Array<{
    assetId: string;
    score: number;
  }>> {
    const {
      orgId,
      query,
      assetId,
      embeddingType: _embeddingType = 'semantic',
      limit = 10,
      minScore = 0.7,
    } = criteria;

    if (query) {
      // Text-based similarity search
      return this.embeddingService.semanticSearch(query, orgId, {
        limit,
        minScore,
      });
    }

    if (assetId) {
      // Asset-based similarity search
      // Get the asset's embedding
      const { semantic, visual } = await this.embeddingService.getEmbeddingMetadata(assetId);
      if (!semantic && !visual) {
        return [];
      }

      // Find similar (placeholder - would need to fetch actual vector)
      return [];
    }

    return [];
  }

  /**
   * Get all tags for an asset.
   */
  async getAssetTags(
    assetId: string,
    options: {
      minConfidence?: number;
      categories?: TagCategory[];
      sources?: TagSource[];
    } = {},
  ): Promise<AnalyzedTag[]> {
    const { minConfidence = 0, categories, sources } = options;

    const results = await db
      .select({
        tagName: tagSchema.name,
        tagCategory: tagSchema.type,
        confidence: assetTagSchema.confidence,
        source: assetTagSchema.source,
      })
      .from(assetTagSchema)
      .innerJoin(tagSchema, eq(assetTagSchema.tagId, tagSchema.id))
      .where(eq(assetTagSchema.assetId, assetId));

    let tags: AnalyzedTag[] = results.map(row => ({
      category: row.tagCategory as TagCategory,
      name: row.tagName,
      confidence: row.confidence,
      source: row.source as TagSource,
    }));

    // Apply filters
    if (minConfidence > 0) {
      tags = tags.filter(t => t.confidence >= minConfidence);
    }
    if (categories && categories.length > 0) {
      tags = tags.filter(t => categories.includes(t.category));
    }
    if (sources && sources.length > 0) {
      tags = tags.filter(t => sources.includes(t.source));
    }

    return tags;
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let instance: TaggingEngine | null = null;

/**
 * Get the singleton TaggingEngine instance.
 */
export function getTaggingEngine(
  config?: Partial<TaggingEngineConfig>,
): TaggingEngine {
  if (!instance) {
    instance = new TaggingEngine(config);
  }
  return instance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetTaggingEngine(): void {
  instance = null;
}
