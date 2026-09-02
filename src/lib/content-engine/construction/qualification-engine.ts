// Content Intelligence Engine — Qualification Engine
// Phase 6: Determines whether assets qualify for content types

import { db } from '@/lib/db';
import { mediaAssetSchema, assetTagSchema, tagSchema } from '@/models/Schema';
import { eq } from 'drizzle-orm';
import type {
  QualificationRules,
  QualificationResult,
  SlotSchema,
} from './types';

// ─── Qualification Engine ────────────────────────────────────────────────────

/**
 * ContentQualificationEngine — determines whether an asset qualifies
 * for a specific content type.
 *
 * This is NOT the same as "asset has tags."
 * A talking-head video may have person + fitness tags but not actually
 * be a talking-head video. Qualification examines the underlying media.
 */
export class ContentQualificationEngine {
  private qualificationVersion: string;

  constructor(qualificationVersion = '1.0.0') {
    this.qualificationVersion = qualificationVersion;
  }

  /**
   * Qualify a single asset against a content type.
   *
   * @param assetId - The media asset to qualify
   * @param contentTypeId - The target content type
   * @param rules - The qualification rules from content_type.qualification_rules
   * @param slotSchema - The slot schema from content_type.slot_schema
   * @returns QualificationResult
   */
  async qualify(
    assetId: string,
    contentTypeId: string,
    rules: QualificationRules,
    slotSchema: SlotSchema,
  ): Promise<QualificationResult> {
    const hardFailures: string[] = [];
    const warnings: string[] = [];
    const matchedRules: string[] = [];
    const missingRequirements: string[] = [];
    const reasoning: string[] = [];

    // 1. Fetch asset with tags
    const asset = await this.fetchAssetWithTags(assetId);
    if (!asset) {
      return this.failResult(
        contentTypeId,
        [`Asset ${assetId} not found`],
        'Asset does not exist in the database',
      );
    }

    // 2. Check hard requirements based on content type
    const slotChecks = this.checkSlotRequirements(asset, slotSchema, contentTypeId);
    if (slotChecks.hardFailures.length > 0) {
      hardFailures.push(...slotChecks.hardFailures);
      reasoning.push(...slotChecks.reasoning);
    } else {
      matchedRules.push(...slotChecks.matched);
      reasoning.push(...slotChecks.reasoning);
    }

    // 3. Check quality score
    if (rules.minQualityScore !== undefined) {
      const qualityScore = asset.qualityScore ?? 0;
      if (qualityScore < rules.minQualityScore) {
        hardFailures.push(
          `Quality score ${qualityScore.toFixed(3)} below minimum ${rules.minQualityScore}`,
        );
      } else {
        matchedRules.push(`quality_score >= ${rules.minQualityScore}`);
      }
    }

    // 4. Check duration
    if (rules.minDuration !== undefined || rules.maxDuration !== undefined) {
      const duration = asset.durationSeconds ?? 0;
      if (rules.minDuration !== undefined && duration < rules.minDuration) {
        hardFailures.push(
          `Duration ${duration}s below minimum ${rules.minDuration}s`,
        );
      } else if (rules.maxDuration !== undefined && duration > rules.maxDuration) {
        hardFailures.push(
          `Duration ${duration}s above maximum ${rules.maxDuration}s`,
        );
      } else {
        matchedRules.push(`duration in range [${rules.minDuration ?? 0}, ${rules.maxDuration ?? '∞'}]`);
      }
    }

    // 5. Check audio requirements
    if (rules.requireAudio) {
      if (!asset.hasAudio) {
        hardFailures.push('Asset has no audio track');
      } else {
        matchedRules.push('has_audio = true');
      }
    }

    if (rules.requireNonSilentAudio) {
      if (asset.audioStatus === 'silent' || asset.audioStatus === 'no_audio') {
        hardFailures.push(`Audio status is '${asset.audioStatus}' — non-silent audio required`);
      } else if (asset.audioStatus === 'valid') {
        matchedRules.push('audio_status = valid (non-silent)');
      } else {
        warnings.push(`Audio status is '${asset.audioStatus}' — may not meet non-silent requirement`);
      }
    }

    // 6. Check face requirement
    if (rules.requireFace) {
      const hasFace = asset.tags.some(
        t => t.tag.name.toLowerCase().includes('face') ||
             t.tag.name.toLowerCase().includes('person') ||
             t.tag.name.toLowerCase().includes('talking_head'),
      );
      if (!hasFace) {
        hardFailures.push('No face/person detected — required for this content type');
      } else {
        matchedRules.push('face/person detected in tags');
      }
    }

    // 7. Check aspect ratio
    if (rules.requiredAspectRatios && rules.requiredAspectRatios.length > 0) {
      const aspect = asset.aspectRatio;
      if (aspect && !rules.requiredAspectRatios.includes(aspect)) {
        hardFailures.push(
          `Aspect ratio '${aspect}' not in allowed: ${rules.requiredAspectRatios.join(', ')}`,
        );
      } else if (aspect) {
        matchedRules.push(`aspect_ratio = ${aspect}`);
      } else {
        warnings.push('Aspect ratio unknown');
      }
    }

    // 8. Check required tags
    if (rules.requiredTags && rules.requiredTags.length > 0) {
      const assetTagNames = asset.tags.map(t => t.tag.name.toLowerCase());
      for (const required of rules.requiredTags) {
        if (!assetTagNames.includes(required.toLowerCase())) {
          missingRequirements.push(`Missing required tag: ${required}`);
        } else {
          matchedRules.push(`has required tag: ${required}`);
        }
      }
    }

    // 9. Check excluded tags
    if (rules.excludedTags && rules.excludedTags.length > 0) {
      const assetTagNames = asset.tags.map(t => t.tag.name.toLowerCase());
      for (const excluded of rules.excludedTags) {
        if (assetTagNames.includes(excluded.toLowerCase())) {
          hardFailures.push(`Excluded tag present: ${excluded}`);
        }
      }
    }

    // 10. Check file size
    if (rules.maxFileSize !== undefined) {
      const fileSize = asset.fileSize ?? 0;
      if (fileSize > rules.maxFileSize) {
        warnings.push(`File size ${fileSize} exceeds recommended max ${rules.maxFileSize}`);
      }
    }

    // Calculate score
    const totalChecks = matchedRules.length + hardFailures.length + warnings.length;
    const score = totalChecks > 0
      ? matchedRules.length / totalChecks
      : hardFailures.length > 0 ? 0 : 0.5;

    const eligible = hardFailures.length === 0;

    return {
      eligible,
      score,
      hardFailures,
      warnings,
      matchedRules,
      missingRequirements,
      reasoning: reasoning.join('; '),
      qualificationVersion: this.qualificationVersion,
    };
  }

  /**
   * Qualify multiple assets for a content type.
   * Returns per-asset results.
   */
  async qualifyBatch(
    assetIds: string[],
    contentTypeId: string,
    rules: QualificationRules,
    slotSchema: SlotSchema,
  ): Promise<Map<string, QualificationResult>> {
    const results = new Map<string, QualificationResult>();

    for (const assetId of assetIds) {
      results.set(assetId, await this.qualify(assetId, contentTypeId, rules, slotSchema));
    }

    return results;
  }

  /**
   * Check slot-specific requirements for an asset.
   */
  private checkSlotRequirements(
    asset: AssetWithTags,
    slotSchema: SlotSchema,
    contentTypeId: string,
  ): {
    hardFailures: string[];
    matched: string[];
    reasoning: string[];
  } {
    const hardFailures: string[] = [];
    const matched: string[] = [];
    const reasoning: string[] = [];

    const assetType = asset.assetType;

    // Determine which slot types this asset could fill
    const compatibleSlots = Object.entries(slotSchema).filter(([_slotName, def]) => {
      return def.type === assetType;
    });

    if (compatibleSlots.length === 0) {
      hardFailures.push(
        `Asset type '${assetType}' does not match any slot in ${contentTypeId}`,
      );
      reasoning.push(
        `Slot schema has no '${assetType}' slots: ${Object.values(slotSchema).map(s => s.type).join(', ')}`,
      );
    } else {
      matched.push(`asset type '${assetType}' matches slot(s): ${compatibleSlots.map(([n]) => n).join(', ')}`);
      reasoning.push(`Asset can fill slot(s): ${compatibleSlots.map(([n]) => n).join(', ')}`);
    }

    return { hardFailures, matched, reasoning };
  }

  /**
   * Fetch an asset with its tags for qualification.
   */
  private async fetchAssetWithTags(assetId: string): Promise<AssetWithTags | null> {
    const result = await db
      .select({
        id: mediaAssetSchema.id,
        orgId: mediaAssetSchema.orgId,
        assetType: mediaAssetSchema.assetType,
        url: mediaAssetSchema.url,
        status: mediaAssetSchema.status,
        qualityScore: mediaAssetSchema.qualityScore,
        durationSeconds: mediaAssetSchema.durationSeconds,
        hasAudio: mediaAssetSchema.hasAudio,
        audioStatus: mediaAssetSchema.audioStatus,
        aspectRatio: mediaAssetSchema.aspectRatio,
        fileSize: mediaAssetSchema.fileSize,
        width: mediaAssetSchema.width,
        height: mediaAssetSchema.height,
        embeddingModel: mediaAssetSchema.embeddingModel,
      })
      .from(mediaAssetSchema)
      .where(eq(mediaAssetSchema.id, assetId))
      .limit(1);

    if (result.length === 0 || !result[0]) {
      return null;
    }

    const row = result[0];

    // Fetch tags
    const tags = await db
      .select({
        tagId: assetTagSchema.tagId,
        confidence: assetTagSchema.confidence,
        source: assetTagSchema.source,
        tag: {
          id: tagSchema.id,
          name: tagSchema.name,
          slug: tagSchema.slug,
          type: tagSchema.type,
        },
      })
      .from(assetTagSchema)
      .innerJoin(tagSchema, eq(assetTagSchema.tagId, tagSchema.id))
      .where(eq(assetTagSchema.assetId, assetId));

    return {
      ...row,
      tags: tags.map(t => ({
        tagId: t.tagId,
        confidence: t.confidence,
        source: t.source,
        tag: t.tag,
      })),
    };
  }

  /**
   * Create a failure result.
   */
  private failResult(
    _contentTypeId: string,
    hardFailures: string[],
    reasoning: string,
  ): QualificationResult {
    return {
      eligible: false,
      score: 0,
      hardFailures,
      warnings: [],
      matchedRules: [],
      missingRequirements: [],
      reasoning,
      qualificationVersion: this.qualificationVersion,
    };
  }
}

// ─── Internal Types ──────────────────────────────────────────────────────────

interface AssetWithTags {
  id: string;
  orgId: string;
  assetType: string;
  url: string;
  status: string;
  qualityScore: number | null;
  durationSeconds: number | null;
  hasAudio: boolean;
  audioStatus: string;
  aspectRatio: string | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  embeddingModel: string | null;
  tags: Array<{
    tagId: string;
    confidence: number;
    source: string;
    tag: {
      id: string;
      name: string;
      slug: string;
      type: string;
    };
  }>;
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: ContentQualificationEngine | null = null;

export function getContentQualificationEngine(
  version?: string,
): ContentQualificationEngine {
  if (!_instance) {
    _instance = new ContentQualificationEngine(version);
  }
  return _instance;
}
