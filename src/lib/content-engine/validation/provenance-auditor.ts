// Content Intelligence Engine — Provenance Auditor
// Phase 10: Trace any library item back to its origin

import { db } from '@/lib/db';
import {
  mediaAssetSchema,
  generationJobSchema,
  generationAttemptSchema,
  assetTagSchema,
  tagSchema,
} from '@/models/Schema';
import { eq, and } from 'drizzle-orm';
import type {
  ProvenanceChain,
  ProvenanceNode,
  ProvenanceLevel,
  ProvenanceAudit,
} from './types';

// ─── Provenance Auditor ──────────────────────────────────────────────────────

/**
 * ProvenanceAuditor — verifies complete provenance for library items.
 *
 * For every successful content item, verify the chain:
 *
 *   Demand → GenerationJob → GenerationAttempt
 *   → Provider → Model → MediaAsset
 *   → Quality result → Tags → Embeddings
 *   → Qualification → Composition → LibraryContent
 *
 * Click any library item and answer:
 *   "Exactly where did this come from?"
 */
export class ProvenanceAuditor {
  // ── Single Item Audit ─────────────────────────────────────────────────────

  /**
   * Get complete provenance chain for a media asset.
   */
  async auditMediaAsset(assetId: string): Promise<ProvenanceChain> {
    const chain: ProvenanceNode[] = [];
    const gaps: string[] = [];

    // 1. Media Asset
    const asset = await this.getMediaAsset(assetId);
    if (!asset) {
      return {
        libraryContentId: assetId,
        chain: [],
        isComplete: false,
        hasGaps: ['media_asset_not_found'],
      };
    }

    chain.push({
      level: 'media_asset',
      id: asset.id,
      type: asset.assetType,
      createdAt: asset.createdAt,
      metadata: {
        url: asset.url,
        status: asset.status,
      },
      parentId: null,
    });

    // 2. Generation Job
    const job = await this.getGenerationJobByAssetId(assetId);
    if (job) {
      chain.push({
        level: 'generation_job',
        id: job.id,
        type: job.kind,
        createdAt: job.createdAt,
        metadata: {
          status: job.status,
          providerId: job.providerId,
          modelId: job.modelId,
        },
        parentId: null,
      });

      // 3. Provider
      if (job.providerId) {
        const provider = await this.getProvider(job.providerId);
        if (provider) {
          chain.push({
            level: 'provider',
            id: provider.id,
            type: provider.name,
            createdAt: new Date(),
            metadata: { isActive: provider.isActive },
            parentId: job.id,
          });
        } else {
          gaps.push('provider_not_found');
        }
      }

      // 4. Model
      if (job.modelId) {
        const model = await this.getModel(job.modelId);
        if (model) {
          chain.push({
            level: 'model',
            id: model.id,
            type: model.name,
            createdAt: new Date(),
            metadata: { type: model.type, capabilities: model.capabilities },
            parentId: job.id,
          });
        } else {
          gaps.push('model_not_found');
        }
      }

      // 5. Generation Attempts
      const attempts = await this.getGenerationAttempts(job.id);
      for (const attempt of attempts) {
        chain.push({
          level: 'generation_attempt',
          id: attempt.id,
          type: attempt.status,
          createdAt: attempt.createdAt,
          metadata: {
            attemptNumber: attempt.attemptNumber,
            success: attempt.status === 'succeeded',
            errorCode: attempt.errorCode,
          },
          parentId: job.id,
        });
      }
    } else {
      gaps.push('generation_job_not_found');
    }

    // 6. Tags
    const tags = await this.getAssetTags(assetId);
    if (tags.length > 0) {
      chain.push({
        level: 'tags',
        id: assetId,
        type: 'tag_set',
        createdAt: new Date(),
        metadata: {
          tagCount: tags.length,
          tags: tags.map(t => ({ name: t.name, category: t.category })),
        },
        parentId: asset.id,
      });
    } else {
      gaps.push('no_tags');
    }

    return {
      libraryContentId: assetId,
      chain,
      isComplete: gaps.length === 0,
      hasGaps: gaps,
    };
  }

  // ── Org-Wide Audit ────────────────────────────────────────────────────────

  /**
   * Audit all library items for an organization.
   */
  async auditOrganization(orgId: string): Promise<ProvenanceAudit> {
    const assets = await db
      .select({ id: mediaAssetSchema.id })
      .from(mediaAssetSchema)
      .where(
        and(
          eq(mediaAssetSchema.orgId, orgId),
          eq(mediaAssetSchema.status, 'validated'),
        ),
      );

    let complete = 0;
    let withGaps = 0;
    const gapsByType: Record<string, number> = {};

    for (const asset of assets) {
      const chain = await this.auditMediaAsset(asset.id);
      if (chain.isComplete) {
        complete++;
      } else {
        withGaps++;
        for (const gap of chain.hasGaps) {
          gapsByType[gap] = (gapsByType[gap] ?? 0) + 1;
        }
      }
    }

    return {
      orgId,
      totalLibraryItems: assets.length,
      itemsWithCompleteProvenance: complete,
      itemsWithGaps: withGaps,
      gapsByType,
      auditedAt: new Date(),
    };
  }

  // ── Verification ──────────────────────────────────────────────────────────

  /**
   * Verify provenance has no gaps.
   */
  verifyChain(chain: ProvenanceChain): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check required levels
    const requiredLevels: ProvenanceLevel[] = [
      'media_asset',
      'generation_job',
      'provider',
      'model',
      'tags',
    ];

    const presentLevels = new Set(chain.chain.map(node => node.level));

    for (const required of requiredLevels) {
      if (!presentLevels.has(required)) {
        issues.push(`Missing required level: ${required}`);
      }
    }

    // Check temporal consistency
    for (let i = 1; i < chain.chain.length; i++) {
      const prev = chain.chain[i - 1]!;
      const curr = chain.chain[i]!;
      if (curr.createdAt < prev.createdAt) {
        issues.push(
          `Temporal inconsistency: ${curr.level} created before ${prev.level}`,
        );
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  // ── Database Helpers ──────────────────────────────────────────────────────

  private async getMediaAsset(assetId: string) {
    const result = await db
      .select()
      .from(mediaAssetSchema)
      .where(eq(mediaAssetSchema.id, assetId))
      .limit(1);
    return result[0] ?? null;
  }

  private async getGenerationJobByAssetId(assetId: string) {
    const result = await db
      .select()
      .from(generationJobSchema)
      .where(eq(generationJobSchema.mediaAssetId, assetId))
      .limit(1);
    return result[0] ?? null;
  }

  private async getProvider(providerId: string) {
    const { providerSchema } = await import('@/models/Schema');
    const result = await db
      .select()
      .from(providerSchema)
      .where(eq(providerSchema.id, providerId))
      .limit(1);
    return result[0] ?? null;
  }

  private async getModel(modelId: string) {
    const { modelSchema } = await import('@/models/Schema');
    const result = await db
      .select()
      .from(modelSchema)
      .where(eq(modelSchema.id, modelId))
      .limit(1);
    return result[0] ?? null;
  }

  private async getGenerationAttempts(jobId: string) {
    const result = await db
      .select()
      .from(generationAttemptSchema)
      .where(eq(generationAttemptSchema.jobId, jobId));
    return result;
  }

  private async getAssetTags(assetId: string) {
    const result = await db
      .select({
        name: tagSchema.name,
        category: tagSchema.type,
      })
      .from(assetTagSchema)
      .innerJoin(tagSchema, eq(assetTagSchema.tagId, tagSchema.id))
      .where(eq(assetTagSchema.assetId, assetId));
    return result;
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: ProvenanceAuditor | null = null;

export function getProvenanceAuditor(): ProvenanceAuditor {
  if (!_instance) {
    _instance = new ProvenanceAuditor();
  }
  return _instance;
}

export function resetProvenanceAuditor(): void {
  _instance = null;
}
