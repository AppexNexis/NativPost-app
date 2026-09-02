// Content Intelligence Engine — Composition Quality
// Phase 6: Post-construction quality evaluation

import type {
  ContentComposition,
  SlideText,
  AudioPlan,
} from './types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CompositionQualityResult {
  passed: boolean;
  score: number;         // 0-1
  dimensions: QualityDimensions;
  flags: string[];
  reasoning: string[];
  qualityVersion: string;
}

export interface QualityDimensions {
  visualCoherence: number | null;
  textPlacement: number | null;
  textReadability: number | null;
  assetCompatibility: number | null;
  audioQuality: number | null;
  durationFit: number | null;
  aspectRatioFit: number | null;
  contentCompleteness: number | null;
}

export interface QualityConfig {
  minScore: number;
  minDimensions: number;  // Minimum number of evaluated dimensions
  requiredDimensions: string[];
}

// ─── Composition Quality Evaluator ───────────────────────────────────────────

/**
 * CompositionQuality — evaluates the quality of a constructed composition.
 *
 * Successful construction ≠ good content.
 * This gate ensures compositions meet quality standards before
 * being marked as ready for the library.
 */
export class CompositionQualityEvaluator {
  private version: string;
  private config: QualityConfig;

  constructor(
    version = '1.0.0',
    config: Partial<QualityConfig> = {},
  ) {
    this.version = version;
    this.config = {
      minScore: 0.6,
      minDimensions: 3,
      requiredDimensions: ['visualCoherence', 'contentCompleteness'],
      ...config,
    };
  }

  /**
   * Evaluate a composition's quality.
   */
  evaluate(composition: ContentComposition): CompositionQualityResult {
    const flags: string[] = [];
    const reasoning: string[] = [];

    // 1. Evaluate visual coherence
    const visualCoherence = this.evaluateVisualCoherence(composition);
    if (visualCoherence !== null) {
      reasoning.push(`Visual coherence: ${visualCoherence.toFixed(3)}`);
      if (visualCoherence < 0.5) {
        flags.push('low_visual_coherence');
      }
    }

    // 2. Evaluate text placement
    const textPlacement = this.evaluateTextPlacement(composition);
    if (textPlacement !== null) {
      reasoning.push(`Text placement: ${textPlacement.toFixed(3)}`);
      if (textPlacement < 0.5) {
        flags.push('poor_text_placement');
      }
    }

    // 3. Evaluate text readability
    const textReadability = this.evaluateTextReadability(composition);
    if (textReadability !== null) {
      reasoning.push(`Text readability: ${textReadability.toFixed(3)}`);
      if (textReadability < 0.5) {
        flags.push('poor_text_readability');
      }
    }

    // 4. Evaluate asset compatibility (for slideshows)
    const assetCompatibility = this.evaluateAssetCompatibility(composition);
    if (assetCompatibility !== null) {
      reasoning.push(`Asset compatibility: ${assetCompatibility.toFixed(3)}`);
      if (assetCompatibility < 0.5) {
        flags.push('low_asset_compatibility');
      }
    }

    // 5. Evaluate audio quality
    const audioQuality = this.evaluateAudioQuality(composition);
    if (audioQuality !== null) {
      reasoning.push(`Audio quality: ${audioQuality.toFixed(3)}`);
      if (audioQuality < 0.5) {
        flags.push('low_audio_quality');
      }
    }

    // 6. Evaluate duration fit
    const durationFit = this.evaluateDurationFit(composition);
    if (durationFit !== null) {
      reasoning.push(`Duration fit: ${durationFit.toFixed(3)}`);
    }

    // 7. Evaluate aspect ratio fit
    const aspectRatioFit = this.evaluateAspectRatioFit(composition);
    if (aspectRatioFit !== null) {
      reasoning.push(`Aspect ratio fit: ${aspectRatioFit.toFixed(3)}`);
    }

    // 8. Evaluate content completeness
    const contentCompleteness = this.evaluateContentCompleteness(composition);
    reasoning.push(`Content completeness: ${contentCompleteness.toFixed(3)}`);

    // Calculate overall score
    const dimensions: QualityDimensions = {
      visualCoherence,
      textPlacement,
      textReadability,
      assetCompatibility,
      audioQuality,
      durationFit,
      aspectRatioFit,
      contentCompleteness,
    };

    const evaluatedDimensions = Object.values(dimensions).filter(
      (v): v is number => v !== null,
    );

    const score = evaluatedDimensions.length > 0
      ? evaluatedDimensions.reduce((a, b) => a + b, 0) / evaluatedDimensions.length
      : 0;

    // Check pass/fail
    const passed = score >= this.config.minScore &&
      evaluatedDimensions.length >= this.config.minDimensions;

    return {
      passed,
      score,
      dimensions,
      flags,
      reasoning,
      qualityVersion: this.version,
    };
  }

  /**
   * Evaluate visual coherence of the composition.
   */
  private evaluateVisualCoherence(composition: ContentComposition): number {
    const slots = composition.slots;
    const slotValues = Object.values(slots);

    if (slotValues.length === 0) return 0;

    // Check that slots have content
    let filledSlots = 0;
    for (const slot of slotValues) {
      if (Array.isArray(slot)) {
        if (slot.length > 0) filledSlots++;
      } else if (slot) {
        filledSlots++;
      }
    }

    return filledSlots / Math.max(1, slotValues.length);
  }

  /**
   * Evaluate text placement quality.
   */
  private evaluateTextPlacement(composition: ContentComposition): number | null {
    const metadata = composition.metadata as unknown as Record<string, unknown>;
    const text = metadata.text as SlideText[] | undefined;

    if (!text || text.length === 0) return null;

    // Check that text positions are reasonable
    let validPositions = 0;
    for (const t of text) {
      if (t.position && t.position.x >= 0 && t.position.x <= 1 &&
          t.position.y >= 0 && t.position.y <= 1) {
        validPositions++;
      }
    }

    return validPositions / text.length;
  }

  /**
   * Evaluate text readability.
   */
  private evaluateTextReadability(composition: ContentComposition): number | null {
    const metadata = composition.metadata as unknown as Record<string, unknown>;
    const text = metadata.text as SlideText[] | undefined;

    if (!text || text.length === 0) return null;

    let readableCount = 0;
    for (const t of text) {
      // Check font size is reasonable
      const fontSize = t.style?.fontSize ?? 0;
      if (fontSize >= 16 && fontSize <= 72) {
        readableCount++;
      }
    }

    return readableCount / text.length;
  }

  /**
   * Evaluate asset compatibility (for slideshows).
   */
  private evaluateAssetCompatibility(composition: ContentComposition): number | null {
    const metadata = composition.metadata as unknown as Record<string, unknown>;
    const compatibilityScore = metadata.compatibilityScore as number | undefined;

    if (compatibilityScore !== undefined) {
      return compatibilityScore;
    }

    return null;
  }

  /**
   * Evaluate audio quality.
   */
  private evaluateAudioQuality(composition: ContentComposition): number | null {
    const metadata = composition.metadata as unknown as Record<string, unknown>;
    const audio = metadata.audio as AudioPlan | undefined;

    if (!audio || audio.source === 'none') return null;

    // Audio exists and is from library
    if (audio.source === 'library') return 0.8;
    if (audio.source === 'generated') return 0.7;

    return 0.5;
  }

  /**
   * Evaluate duration fit.
   */
  private evaluateDurationFit(composition: ContentComposition): number | null {
    const slots = composition.slots;
    const slotValues = Object.values(slots);

    // Calculate total duration from video/audio slots
    let totalDuration = 0;
    for (const slot of slotValues) {
      if (Array.isArray(slot)) {
        for (const item of slot) {
          if (item && typeof item === 'object' && 'duration' in item) {
            totalDuration += (item as { duration?: number }).duration ?? 0;
          }
        }
      } else if (slot && typeof slot === 'object' && 'duration' in slot) {
        totalDuration += (slot as { duration?: number }).duration ?? 0;
      }
    }

    if (totalDuration === 0) return null;

    // Reasonable duration range: 3-60 seconds
    if (totalDuration < 3) return 0.3;
    if (totalDuration > 60) return 0.4;
    return 0.8;
  }

  /**
   * Evaluate aspect ratio fit.
   */
  private evaluateAspectRatioFit(composition: ContentComposition): number | null {
    const metadata = composition.metadata as unknown as Record<string, unknown>;
    const aspectRatio = metadata.aspectRatio as string | undefined;

    if (!aspectRatio) return null;

    // 9:16 is preferred for social
    if (aspectRatio === '9:16') return 1.0;
    if (aspectRatio === '1:1') return 0.8;
    if (aspectRatio === '4:5') return 0.9;
    if (aspectRatio === '16:9') return 0.6;

    return 0.5;
  }

  /**
   * Evaluate content completeness.
   */
  private evaluateContentCompleteness(composition: ContentComposition): number {
    let score = 0;
    let checks = 0;

    // Check composition has content type
    if (composition.contentTypeId) score++;
    checks++;

    // Check composition has slots
    const slotCount = Object.keys(composition.slots).length;
    if (slotCount > 0) score++;
    checks++;

    // Check composition has metadata
    const metadata = composition.metadata as unknown as Record<string, unknown>;
    if (metadata && Object.keys(metadata).length > 0) score++;
    checks++;

    // Check is_complete flag
    if (composition.isComplete) score++;
    checks++;

    return checks > 0 ? score / checks : 0;
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: CompositionQualityEvaluator | null = null;

export function getCompositionQualityEvaluator(
  version?: string,
  config?: Partial<QualityConfig>,
): CompositionQualityEvaluator {
  if (!_instance) {
    _instance = new CompositionQualityEvaluator(version, config);
  }
  return _instance;
}
