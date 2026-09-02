// Content Intelligence Engine — Image Analyzer
// Phase 5: Analyzes images to extract tags, entities, and concepts

import type {
  AssetAnalysis,
  AnalyzedTag,
  DetectedEntity,
} from './types';
import { TagNormalizer, getTagNormalizer } from './tag-normalizer';

// ─── Image Analyzer ─────────────────────────────────────────────────────────

/**
 * ImageAnalyzer — analyzes images to extract intelligence.
 *
 * Responsibilities:
 * 1. Detect people, objects, settings
 * 2. Identify visual style and composition
 * 3. Extract text (OCR) if present
 * 4. Determine content intent and business context
 * 5. Generate semantic description
 */
export class ImageAnalyzer {
  private normalizer: TagNormalizer;

  constructor() {
    this.normalizer = getTagNormalizer();
  }

  /**
   * Analyze an image and extract intelligence.
   *
   * @param _imageUrl - URL of the image to analyze
   * @param metadata - Optional metadata from processing
   * @returns Asset analysis with tags, entities, and concepts
   */
  async analyze(
    _imageUrl: string,
    metadata?: Record<string, unknown>,
  ): Promise<AssetAnalysis> {
    const startTime = Date.now();

    // In production, this would call a vision model (GPT-4V, Claude, etc.)
    // For now, we return a structured analysis based on available metadata

    const tags: AnalyzedTag[] = [];
    const entities: DetectedEntity[] = [];
    const visualConcepts: string[] = [];
    const semanticConcepts: string[] = [];

    // Analyze based on metadata if available
    if (metadata) {
      this.analyzeMetadata(metadata, tags, entities, visualConcepts, semanticConcepts);
    }

    // Normalize tags
    const normalizedTags = this.normalizer.normalize(tags);

    // Select top tags for library-facing output
    const topTags = this.normalizer.selectTopTags(normalizedTags, 5);

    return {
      assetId: '', // Will be set by caller
      tags: topTags,
      description: this.generateDescription(topTags, entities),
      entities,
      visualConcepts,
      semanticConcepts,
      metadata: {
        model: 'image-analyzer-v1',
        version: '1.0.0',
        analyzedAt: new Date(),
        durationMs: Date.now() - startTime,
        ocrPerformed: false,
        transcriptionPerformed: false,
      },
    };
  }

  /**
   * Analyze image metadata to extract tags and concepts.
   */
  private analyzeMetadata(
    metadata: Record<string, unknown>,
    tags: AnalyzedTag[],
    _entities: DetectedEntity[],
    visualConcepts: string[],
    _semanticConcepts: string[],
  ): void {
    // Extract dimensions
    const width = metadata.width as number | undefined;
    const height = metadata.height as number | undefined;

    if (width && height) {
      // Determine aspect ratio
      const ratio = width / height;
      if (ratio > 1.5) {
        tags.push({
          category: 'aspect_ratio_tag',
          name: 'Landscape',
          confidence: 0.95,
          source: 'metadata',
        });
      } else if (ratio < 0.67) {
        tags.push({
          category: 'aspect_ratio_tag',
          name: 'Portrait',
          confidence: 0.95,
          source: 'metadata',
        });
      } else {
        tags.push({
          category: 'aspect_ratio_tag',
          name: 'Square',
          confidence: 0.95,
          source: 'metadata',
        });
      }

      // Determine resolution
      if (width >= 3840 || height >= 3840) {
        tags.push({
          category: 'resolution',
          name: '4K',
          confidence: 0.99,
          source: 'metadata',
        });
      } else if (width >= 1920 || height >= 1920) {
        tags.push({
          category: 'resolution',
          name: 'HD',
          confidence: 0.99,
          source: 'metadata',
        });
      } else {
        tags.push({
          category: 'resolution',
          name: 'Standard',
          confidence: 0.99,
          source: 'metadata',
        });
      }
    }

    // Extract format
    const format = metadata.format_name as string | undefined;
    if (format) {
      if (format === 'jpeg') {
        tags.push({
          category: 'quality_level',
          name: 'Compressed',
          confidence: 0.8,
          source: 'metadata',
        });
      } else if (format === 'png') {
        tags.push({
          category: 'quality_level',
          name: 'Lossless',
          confidence: 0.9,
          source: 'metadata',
        });
      }
    }

    // Extract file size for quality inference
    const fileSize = metadata.size as number | undefined;
    if (fileSize) {
      if (fileSize > 5 * 1024 * 1024) { // > 5MB
        visualConcepts.push('high_detail');
      } else if (fileSize < 100 * 1024) { // < 100KB
        visualConcepts.push('low_detail');
      }
    }
  }

  /**
   * Generate a semantic description from tags and entities.
   */
  private generateDescription(
    tags: AnalyzedTag[],
    entities: DetectedEntity[],
  ): string {
    const parts: string[] = [];

    // Add people
    const people = entities.filter(e => e.type === 'person');
    if (people.length > 0) {
      const personNames = people.map(p => p.name).join(' and ');
      parts.push(`${personNames} in the image`);
    }

    // Add setting
    const settingTags = tags.filter(t => t.category === 'setting');
    if (settingTags.length > 0 && settingTags[0]) {
      parts.push(`in a ${settingTags[0].name.toLowerCase()} setting`);
    }

    // Add activity
    const activityTags = tags.filter(t => t.category === 'activity');
    if (activityTags.length > 0 && activityTags[0]) {
      parts.push(`${activityTags[0].name.toLowerCase()}`);
    }

    // Add visual style
    const styleTags = tags.filter(t => t.category === 'visual_style');
    if (styleTags.length > 0 && styleTags[0]) {
      parts.push(`with ${styleTags[0].name.toLowerCase()} style`);
    }

    if (parts.length === 0) {
      return 'An image with visual content';
    }

    return parts.join(' ');
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let instance: ImageAnalyzer | null = null;

/**
 * Get the singleton ImageAnalyzer instance.
 */
export function getImageAnalyzer(): ImageAnalyzer {
  if (!instance) {
    instance = new ImageAnalyzer();
  }
  return instance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetImageAnalyzer(): void {
  instance = null;
}
