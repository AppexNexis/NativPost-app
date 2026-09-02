// Content Intelligence Engine — Audio Selector
// Phase 6: Selects background audio for content compositions

import { db } from '@/lib/db';
import { mediaAssetSchema } from '@/models/Schema';
import { eq, and } from 'drizzle-orm';
import type { AudioPlan } from './types';

// ─── Audio Selector ──────────────────────────────────────────────────────────

/**
 * AudioSelector — selects appropriate background audio for compositions.
 *
 * Audio should be reusable across compositions.
 * Do not generate music unnecessarily for every asset.
 */
export class AudioSelector {
  constructor(_version = '1.0.0') {
  }

  /**
   * Select audio for a composition.
   *
   * @param orgId - Organization ID
   * @param contentType - Content type (e.g., 'slideshow', 'single_image')
   * @param durationSeconds - Required duration in seconds
   * @param tags - Asset tags for mood matching
   * @returns AudioPlan or null if no audio needed
   */
  async selectAudio(
    orgId: string,
    contentType: string,
    durationSeconds: number,
    tags: string[],
  ): Promise<AudioPlan | null> {
    // 1. Determine if audio is required
    if (!this.requiresBackgroundAudio(contentType)) {
      return null;
    }

    // 2. Find suitable audio assets in library
    const audioAssets = await this.findAudioAssets(orgId, durationSeconds);

    if (audioAssets.length === 0) {
      // Fallback to generic audio
      return this.getGenericAudioPlan(contentType, durationSeconds);
    }

    // 3. Score and select best match
    const scored = audioAssets.map(asset => ({
      asset,
      score: this.scoreAudio(asset, tags, durationSeconds),
    }));

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];

    if (!best || best.score < 0.3) {
      return this.getGenericAudioPlan(contentType, durationSeconds);
    }

    return {
      assetId: best.asset.id,
      url: best.asset.url,
      source: 'library',
      volume: this.getVolumeForType(contentType),
      fadeIn: 0.5,
      fadeOut: 1.0,
      loop: best.asset.durationSeconds
        ? best.asset.durationSeconds < durationSeconds
        : true,
    };
  }

  /**
   * Check if a content type requires background audio.
   */
  private requiresBackgroundAudio(contentType: string): boolean {
    // All current content types require audio
    const audioRequiredTypes = [
      'single_image', 'slideshow', 'reel', 'ugc',
      'wall_of_text', 'talking_head', 'green_screen',
    ];
    return audioRequiredTypes.includes(contentType);
  }

  /**
   * Find audio assets in the library.
   */
  private async findAudioAssets(
    orgId: string,
    minDuration: number,
  ): Promise<AudioAsset[]> {
    const results = await db
      .select({
        id: mediaAssetSchema.id,
        url: mediaAssetSchema.url,
        durationSeconds: mediaAssetSchema.durationSeconds,
        fileSize: mediaAssetSchema.fileSize,
        mimeType: mediaAssetSchema.mimeType,
        qualityScore: mediaAssetSchema.qualityScore,
      })
      .from(mediaAssetSchema)
      .where(
        and(
          eq(mediaAssetSchema.orgId, orgId),
          eq(mediaAssetSchema.assetType, 'audio'),
          eq(mediaAssetSchema.status, 'validated'),
        ),
      );

    return results
      .filter(r => r.durationSeconds === null || r.durationSeconds >= minDuration)
      .map(r => ({
        id: r.id,
        url: r.url,
        durationSeconds: r.durationSeconds,
        fileSize: r.fileSize,
        mimeType: r.mimeType,
        qualityScore: r.qualityScore,
      }));
  }

  /**
   * Score an audio asset for suitability.
   */
  private scoreAudio(
    asset: AudioAsset,
    _tags: string[],
    targetDuration: number,
  ): number {
    let score = 0.5;

    // Prefer higher quality
    if (asset.qualityScore) {
      score += asset.qualityScore * 0.2;
    }

    // Prefer duration close to target
    if (asset.durationSeconds) {
      const durationDiff = Math.abs(asset.durationSeconds - targetDuration);
      const durationScore = Math.max(0, 1 - durationDiff / targetDuration);
      score += durationScore * 0.2;
    }

    // Prefer smaller files (likely cleaner audio)
    if (asset.fileSize) {
      const sizeScore = Math.max(0, 1 - asset.fileSize / (10 * 1024 * 1024)); // 10MB baseline
      score += sizeScore * 0.1;
    }

    return Math.min(1, score);
  }

  /**
   * Get volume level for content type.
   */
  private getVolumeForType(contentType: string): number {
    switch (contentType) {
      case 'talking_head':
      case 'ugc':
        return 0.2; // Low volume behind speech
      case 'reel':
        return 0.4;
      case 'slideshow':
      case 'single_image':
        return 0.6;
      default:
        return 0.5;
    }
  }

  /**
   * Get a generic audio plan when no library audio is available.
   */
  private getGenericAudioPlan(
    contentType: string,
    _durationSeconds: number,
  ): AudioPlan {
    return {
      source: 'none',
      volume: this.getVolumeForType(contentType),
      loop: true,
    };
  }
}

// ─── Internal Types ──────────────────────────────────────────────────────────

interface AudioAsset {
  id: string;
  url: string;
  durationSeconds: number | null;
  fileSize: number | null;
  mimeType: string | null;
  qualityScore: number | null;
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: AudioSelector | null = null;

export function getAudioSelector(version?: string): AudioSelector {
  if (!_instance) {
    _instance = new AudioSelector(version);
  }
  return _instance;
}
