// Content Intelligence Engine — Deduplication Engine
// Phase 7: Detects and groups duplicate content across multiple dimensions

import { createHash } from 'crypto';
import type {
  DuplicateGroup,
  DeduplicationResult,
  CompositionSignature,
  InventoryEngineConfig,
} from './types';

// ─── Deduplication Engine ────────────────────────────────────────────────────

/**
 * DeduplicationEngine — detects and groups duplicate content.
 *
 * Without deduplication:
 *   1000 assets → looks like 120 unique assets
 *
 * Types of duplicates:
 *   - Exact: same hash/file
 *   - Visual: similar visual embeddings (0.95+ cosine similarity)
 *   - Semantic: similar meaning, different visuals
 *   - Composition: same assets in different order
 */
export class DeduplicationEngine {
  private config: InventoryEngineConfig['deduplication'];

  constructor(config: Partial<InventoryEngineConfig['deduplication']> = {}) {
    this.config = {
      exactThreshold: 1.0,
      visualThreshold: 0.95,
      semanticThreshold: 0.90,
      compositionThreshold: 0.95,
      maxGroupSize: 10,
      ...config,
    };
  }

  // ── Exact Deduplication ──────────────────────────────────────────────────

  /**
   * Generate an exact hash for content.
   * Uses sha256 of file content or perceptual hash.
   */
  generateExactHash(content: {
    url?: string;
    fileHash?: string;
    perceptualHash?: string;
    metadata?: Record<string, unknown>;
  }): string {
    // Prefer perceptual hash if available
    if (content.perceptualHash) {
      return content.perceptualHash;
    }

    // Fall back to file hash
    if (content.fileHash) {
      return content.fileHash;
    }

    // Generate from URL + metadata
    const input = JSON.stringify({
      url: content.url,
      metadata: content.metadata,
    });

    return createHash('sha256').update(input).digest('hex');
  }

  /**
   * Check if two contents are exact duplicates.
   */
  checkExact(content1: ContentInput, content2: ContentInput): DeduplicationResult {
    const hash1 = this.generateExactHash(content1);
    const hash2 = this.generateExactHash(content2);

    if (hash1 === hash2) {
      return {
        isDuplicate: true,
        duplicateType: 'exact',
        similarity: 1.0,
        canonicalContentId: this.selectCanonical(content1, content2),
        groupId: null,
        reasoning: [`Exact hash match: ${hash1}`],
      };
    }

    return {
      isDuplicate: false,
      duplicateType: null,
      similarity: 0,
      canonicalContentId: null,
      groupId: null,
      reasoning: ['Hashes do not match'],
    };
  }

  // ── Visual Deduplication ─────────────────────────────────────────────────

  /**
   * Check if two contents are visual duplicates.
   * Uses cosine similarity of visual embeddings.
   */
  checkVisual(
    content1: ContentInput,
    content2: ContentInput,
    embedding1: number[],
    embedding2: number[],
  ): DeduplicationResult {
    const similarity = this.cosineSimilarity(embedding1, embedding2);

    if (similarity >= this.config.visualThreshold) {
      return {
        isDuplicate: true,
        duplicateType: 'visual',
        similarity,
        canonicalContentId: this.selectCanonical(content1, content2),
        groupId: null,
        reasoning: [
          `Visual similarity ${similarity.toFixed(3)} exceeds threshold ${this.config.visualThreshold}`,
        ],
      };
    }

    return {
      isDuplicate: false,
      duplicateType: null,
      similarity,
      canonicalContentId: null,
      groupId: null,
      reasoning: [`Visual similarity ${similarity.toFixed(3)} below threshold`],
    };
  }

  // ── Semantic Deduplication ───────────────────────────────────────────────

  /**
   * Check if two contents are semantic duplicates.
   * Uses cosine similarity of semantic embeddings.
   */
  checkSemantic(
    content1: ContentInput,
    content2: ContentInput,
    embedding1: number[],
    embedding2: number[],
  ): DeduplicationResult {
    const similarity = this.cosineSimilarity(embedding1, embedding2);

    if (similarity >= this.config.semanticThreshold) {
      return {
        isDuplicate: true,
        duplicateType: 'semantic',
        similarity,
        canonicalContentId: this.selectCanonical(content1, content2),
        groupId: null,
        reasoning: [
          `Semantic similarity ${similarity.toFixed(3)} exceeds threshold ${this.config.semanticThreshold}`,
        ],
      };
    }

    return {
      isDuplicate: false,
      duplicateType: null,
      similarity,
      canonicalContentId: null,
      groupId: null,
      reasoning: [`Semantic similarity ${similarity.toFixed(3)} below threshold`],
    };
  }

  // ── Composition Deduplication ────────────────────────────────────────────

  /**
   * Generate a composition signature for deduplication.
   */
  generateCompositionSignature(composition: {
    assetIds: string[];
    assetOrder: string[];
    text: string[];
    contentTypeId: string;
  }): CompositionSignature {
    const normalizedAssetOrder = [...composition.assetOrder].sort();
    const textHash = createHash('sha256')
      .update(composition.text.join('||'))
      .digest('hex');

    const signatureInput = JSON.stringify({
      assetIds: composition.assetIds.sort(),
      assetOrder: normalizedAssetOrder,
      textHash,
      contentTypeId: composition.contentTypeId,
    });

    const signature = createHash('sha256')
      .update(signatureInput)
      .digest('hex');

    return {
      assetIds: composition.assetIds,
      assetOrder: composition.assetOrder,
      textHash,
      contentTypeId: composition.contentTypeId,
      signature,
    };
  }

  /**
   * Check if two compositions are duplicates.
   */
  checkComposition(
    sig1: CompositionSignature,
    sig2: CompositionSignature,
  ): DeduplicationResult {
    // Same content type required
    if (sig1.contentTypeId !== sig2.contentTypeId) {
      return {
        isDuplicate: false,
        duplicateType: null,
        similarity: 0,
        canonicalContentId: null,
        groupId: null,
        reasoning: ['Different content types'],
      };
    }

    // Check signature match
    if (sig1.signature === sig2.signature) {
      return {
        isDuplicate: true,
        duplicateType: 'composition',
        similarity: 1.0,
        canonicalContentId: null, // Caller must determine
        groupId: null,
        reasoning: [`Composition signature match: ${sig1.signature}`],
      };
    }

    // Check asset overlap
    const overlap = this.calculateAssetOverlap(sig1.assetIds, sig2.assetIds);
    if (overlap >= this.config.compositionThreshold) {
      return {
        isDuplicate: true,
        duplicateType: 'composition',
        similarity: overlap,
        canonicalContentId: null,
        groupId: null,
        reasoning: [
          `Asset overlap ${overlap.toFixed(3)} exceeds threshold ${this.config.compositionThreshold}`,
        ],
      };
    }

    return {
      isDuplicate: false,
      duplicateType: null,
      similarity: overlap,
      canonicalContentId: null,
      groupId: null,
      reasoning: [`Asset overlap ${overlap.toFixed(3)} below threshold`],
    };
  }

  // ── Batch Deduplication ──────────────────────────────────────────────────

  /**
   * Find all duplicates in a batch of contents.
   * Returns groups of duplicates.
   */
  findDuplicateGroups(contents: ContentWithEmbeddings[]): DuplicateGroup[] {
    const groups: DuplicateGroup[] = [];
    const processed = new Set<string>();

    for (let i = 0; i < contents.length; i++) {
      const content1 = contents[i];
      if (!content1 || processed.has(content1.id)) continue;

      const duplicates: string[] = [];

      for (let j = i + 1; j < contents.length; j++) {
        const content2 = contents[j];
        if (!content2 || processed.has(content2.id)) continue;

        // Check visual similarity
        if (content1.visualEmbedding && content2.visualEmbedding) {
          const visualResult = this.checkVisual(
            content1,
            content2,
            content1.visualEmbedding,
            content2.visualEmbedding,
          );

          if (visualResult.isDuplicate) {
            duplicates.push(content2.id);
            processed.add(content2.id);
            continue;
          }
        }

        // Check semantic similarity
        if (content1.semanticEmbedding && content2.semanticEmbedding) {
          const semanticResult = this.checkSemantic(
            content1,
            content2,
            content1.semanticEmbedding,
            content2.semanticEmbedding,
          );

          if (semanticResult.isDuplicate) {
            duplicates.push(content2.id);
            processed.add(content2.id);
          }
        }
      }

      if (duplicates.length > 0) {
        const group: DuplicateGroup = {
          id: `dg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          canonicalContentId: content1.id,
          duplicateContentIds: duplicates,
          duplicateType: 'visual', // Primary type
          similarity: 0, // Will be calculated
          reason: `${duplicates.length + 1} visually/semantically similar contents`,
          detectedAt: new Date(),
          resolvedAt: null,
          resolution: null,
        };

        groups.push(group);
        processed.add(content1.id);
      }
    }

    return groups;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Calculate cosine similarity between two vectors.
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const ai = a[i] ?? 0;
      const bi = b[i] ?? 0;
      dotProduct += ai * bi;
      normA += ai * ai;
      normB += bi * bi;
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  /**
   * Calculate asset overlap between two sets.
   */
  private calculateAssetOverlap(assets1: string[], assets2: string[]): number {
    const set1 = new Set(assets1);
    const set2 = new Set(assets2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Select the canonical content (higher quality wins).
   */
  private selectCanonical(c1: ContentInput, c2: ContentInput): string {
    const q1 = c1.qualityScore ?? 0;
    const q2 = c2.qualityScore ?? 0;

    if (q1 >= q2) return c1.id;
    return c2.id;
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ContentInput {
  id: string;
  url?: string;
  fileHash?: string;
  perceptualHash?: string;
  qualityScore?: number;
  metadata?: Record<string, unknown>;
}

interface ContentWithEmbeddings extends ContentInput {
  semanticEmbedding?: number[];
  visualEmbedding?: number[];
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: DeduplicationEngine | null = null;

export function getDeduplicationEngine(
  config?: Partial<InventoryEngineConfig['deduplication']>,
): DeduplicationEngine {
  if (!_instance) {
    _instance = new DeduplicationEngine(config);
  }
  return _instance;
}
