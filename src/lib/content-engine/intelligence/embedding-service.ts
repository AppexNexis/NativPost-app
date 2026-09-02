// Content Intelligence Engine — Embedding Service
// Phase 5: Embedding generation and storage using pgvector

import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import type {
  EmbeddingMetadata,
  EmbeddingType,
} from './types';

// ─── Embedding Service ──────────────────────────────────────────────────────

/**
 * EmbeddingService — generates and manages embeddings.
 *
 * Responsibilities:
 * 1. Generate text embeddings (semantic)
 * 2. Generate visual embeddings (from image/video features)
 * 3. Store embeddings in pgvector
 * 4. Query similar assets
 * 5. Version embeddings for re-generation
 */
export class EmbeddingService {
  private config: {
    embeddingModel: string;
    embeddingDimensions: number;
    embeddingVersion: string;
  };

  constructor(config: {
    embeddingModel?: string;
    embeddingDimensions?: number;
    embeddingVersion?: string;
  } = {}) {
    this.config = {
      embeddingModel: config.embeddingModel ?? 'text-embedding-3-small',
      embeddingDimensions: config.embeddingDimensions ?? 1536,
      embeddingVersion: config.embeddingVersion ?? '1.0.0',
    };
  }

  /**
   * Generate a text embedding for semantic search.
   */
  async generateTextEmbedding(_text: string): Promise<{
    vector: number[];
    metadata: EmbeddingMetadata;
  }> {
    // In production, call OpenAI/other embedding API
    // For now, return a placeholder
    const vector = this.generatePlaceholderVector(this.config.embeddingDimensions);

    return {
      vector,
      metadata: {
        model: this.config.embeddingModel,
        version: this.config.embeddingVersion,
        dimensions: this.config.embeddingDimensions,
        generatedAt: new Date(),
      },
    };
  }

  /**
   * Generate a visual embedding from image features.
   */
  async generateVisualEmbedding(
    _imageUrl: string,
  ): Promise<{
    vector: number[];
    metadata: EmbeddingMetadata;
  }> {
    // In production, use a vision model to extract features
    // For now, return a placeholder
    const vector = this.generatePlaceholderVector(this.config.embeddingDimensions);

    return {
      vector,
      metadata: {
        model: `visual-${this.config.embeddingModel}`,
        version: this.config.embeddingVersion,
        dimensions: this.config.embeddingDimensions,
        generatedAt: new Date(),
      },
    };
  }

  /**
   * Store an embedding for an asset.
   */
  async storeEmbedding(
    assetId: string,
    type: EmbeddingType,
    vector: number[],
    metadata: EmbeddingMetadata,
  ): Promise<void> {
    // Use raw SQL for pgvector operations
    const vectorStr = `[${vector.join(',')}]`;

    await db.execute(sql`
      INSERT INTO media_asset (
        id,
        ${sql.raw(type === 'semantic' ? 'embedding' : 'visual_embedding')},
        embedding_model,
        embedding_version,
        embedded_at
      ) VALUES (
        ${assetId},
        ${vectorStr}::vector,
        ${metadata.model},
        ${metadata.version},
        ${metadata.generatedAt}
      )
      ON CONFLICT (id) DO UPDATE SET
        ${sql.raw(type === 'semantic' ? 'embedding' : 'visual_embedding')} = ${vectorStr}::vector,
        embedding_model = ${metadata.model},
        embedding_version = ${metadata.version},
        embedded_at = ${metadata.generatedAt}
    `);
  }

  /**
   * Find similar assets using cosine similarity.
   */
  async findSimilar(
    vector: number[],
    orgId: string,
    options: {
      type?: EmbeddingType;
      limit?: number;
      minScore?: number;
      excludeAssetIds?: string[];
    } = {},
  ): Promise<Array<{
    assetId: string;
    score: number;
  }>> {
    const {
      type = 'semantic',
      limit = 10,
      minScore = 0.7,
      excludeAssetIds = [],
    } = options;

    const vectorStr = `[${vector.join(',')}]`;
    const embeddingCol = type === 'semantic' ? 'embedding' : 'visual_embedding';
    const excludeClause = excludeAssetIds.length > 0
      ? `AND id NOT IN (${excludeAssetIds.map(id => `'${id}'`).join(',')})`
      : '';

    // Use cosine similarity with pgvector
    const results = await db.execute(sql.raw(`
      SELECT
        id as asset_id,
        1 - (${embeddingCol} <=> '${vectorStr}'::vector) as score
      FROM media_asset
      WHERE
        org_id = '${orgId}'
        AND ${embeddingCol} IS NOT NULL
        AND deleted_at IS NULL
        ${excludeClause}
      HAVING 1 - (${embeddingCol} <=> '${vectorStr}'::vector) >= ${minScore}
      ORDER BY score DESC
      LIMIT ${limit}
    `));

    return (results as unknown as any[]).map(row => ({
      assetId: row.asset_id,
      score: parseFloat(row.score),
    }));
  }

  /**
   * Find assets matching a text query semantically.
   */
  async semanticSearch(
    query: string,
    orgId: string,
    options: {
      limit?: number;
      minScore?: number;
    } = {},
  ): Promise<Array<{
    assetId: string;
    score: number;
  }>> {
    const { limit = 10, minScore = 0.7 } = options;

    // Generate embedding for query
    const { vector } = await this.generateTextEmbedding(query);

    return this.findSimilar(vector, orgId, {
      type: 'semantic',
      limit,
      minScore,
    });
  }

  /**
   * Delete embeddings for an asset.
   */
  async deleteEmbeddings(assetId: string): Promise<void> {
    await db.execute(sql`
      UPDATE media_asset
      SET
        embedding = NULL,
        visual_embedding = NULL,
        embedding_model = NULL,
        embedding_version = NULL,
        embedded_at = NULL
      WHERE id = ${assetId}
    `);
  }

  /**
   * Check if an asset has embeddings.
   */
  async hasEmbeddings(assetId: string): Promise<{
    semantic: boolean;
    visual: boolean;
  }> {
    const result = await db.execute(sql.raw(`
      SELECT
        embedding IS NOT NULL as has_semantic,
        visual_embedding IS NOT NULL as has_visual
      FROM media_asset
      WHERE id = '${assetId}'
      LIMIT 1
    `));

    const row = (result as unknown as any[])[0];
    return {
      semantic: row?.has_semantic ?? false,
      visual: row?.has_visual ?? false,
    };
  }

  /**
   * Get embedding metadata for an asset.
   */
  async getEmbeddingMetadata(assetId: string): Promise<{
    semantic: EmbeddingMetadata | null;
    visual: EmbeddingMetadata | null;
  }> {
    const result = await db.execute(sql.raw(`
      SELECT
        embedding_model,
        embedding_version,
        embedded_at
      FROM media_asset
      WHERE id = '${assetId}'
      LIMIT 1
    `));

    const row = (result as unknown as any[])[0];
    if (!row) {
      return { semantic: null, visual: null };
    }

    const metadata: EmbeddingMetadata = {
      model: row.embedding_model ?? 'unknown',
      version: row.embedding_version ?? 'unknown',
      dimensions: this.config.embeddingDimensions,
      generatedAt: row.embedded_at ?? new Date(),
    };

    return {
      semantic: row.embedding_model ? metadata : null,
      visual: row.embedding_model ? metadata : null,
    };
  }

  /**
   * Generate a placeholder vector for development/testing.
   * In production, this would be replaced with actual embedding generation.
   */
  private generatePlaceholderVector(dimensions: number): number[] {
    // Generate a pseudo-random vector for testing
    // In production, call actual embedding API
    const vector: number[] = [];
    for (let i = 0; i < dimensions; i++) {
      vector.push(Math.random() * 2 - 1); // Random between -1 and 1
    }
    // Normalize to unit vector
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return vector.map(val => val / magnitude);
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let instance: EmbeddingService | null = null;

/**
 * Get the singleton EmbeddingService instance.
 */
export function getEmbeddingService(config?: {
  embeddingModel?: string;
  embeddingDimensions?: number;
  embeddingVersion?: string;
}): EmbeddingService {
  if (!instance) {
    instance = new EmbeddingService(config);
  }
  return instance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetEmbeddingService(): void {
  instance = null;
}
