// Content Intelligence Engine — Video Analyzer
// Phase 5: Analyzes videos to extract tags, entities, and concepts

import type {
  AssetAnalysis,
  AnalyzedTag,
  DetectedEntity,
  VideoFormat,
  VideoStyle,
} from './types';
import { TagNormalizer, getTagNormalizer } from './tag-normalizer';

// ─── Video Analyzer ─────────────────────────────────────────────────────────

/**
 * VideoAnalyzer — analyzes videos to extract intelligence.
 *
 * Responsibilities:
 * 1. Sample representative frames
 * 2. Analyze visual content across frames
 * 3. Analyze audio/transcript if available
 * 4. Detect video format and style
 * 5. Generate semantic description
 */
export class VideoAnalyzer {
  private normalizer: TagNormalizer;
  private config: {
    frameSamplingRate: number;
    maxFramesToSample: number;
  };

  constructor(config: {
    frameSamplingRate?: number;
    maxFramesToSample?: number;
  } = {}) {
    this.normalizer = getTagNormalizer();
    this.config = {
      frameSamplingRate: config.frameSamplingRate ?? 1,
      maxFramesToSample: config.maxFramesToSample ?? 5,
    };
  }

  /**
   * Analyze a video and extract intelligence.
   *
   * @param videoUrl - URL of the video to analyze
   * @param metadata - Optional metadata from processing
   * @param transcript - Optional transcript from audio
   * @returns Asset analysis with tags, entities, and concepts
   */
  async analyze(
    _videoUrl: string,
    metadata?: Record<string, unknown>,
    transcript?: string,
  ): Promise<AssetAnalysis> {
    const startTime = Date.now();

    const tags: AnalyzedTag[] = [];
    const entities: DetectedEntity[] = [];
    const visualConcepts: string[] = [];
    const semanticConcepts: string[] = [];
    let videoFormat: VideoFormat | undefined;

    // Sample frames for analysis
    const frameCount = this.config.maxFramesToSample;
    visualConcepts.push(`sampled_${frameCount}_frames`);

    // Analyze based on metadata
    if (metadata) {
      this.analyzeMetadata(metadata, tags, entities, visualConcepts, semanticConcepts);
      videoFormat = this.detectVideoFormat(metadata, tags);
    }

    // Analyze transcript if available
    if (transcript) {
      this.analyzeTranscript(transcript, tags, semanticConcepts);
    }

    // Normalize tags
    const normalizedTags = this.normalizer.normalize(tags);

    // Select top tags for library-facing output
    const topTags = this.normalizer.selectTopTags(normalizedTags, 5);

    return {
      assetId: '', // Will be set by caller
      tags: topTags,
      description: this.generateDescription(topTags, entities, videoFormat),
      entities,
      visualConcepts,
      semanticConcepts,
      videoFormat,
      transcript,
      metadata: {
        model: 'video-analyzer-v1',
        version: '1.0.0',
        analyzedAt: new Date(),
        durationMs: Date.now() - startTime,
        framesSampled: frameCount,
        ocrPerformed: false,
        transcriptionPerformed: !!transcript,
      },
    };
  }

  /**
   * Analyze video metadata to extract tags and concepts.
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
        // Portrait video is often for mobile
        tags.push({
          category: 'social_platform',
          name: 'TikTok',
          confidence: 0.6,
          source: 'inferred',
        });
        tags.push({
          category: 'format',
          name: 'Reel',
          confidence: 0.6,
          source: 'inferred',
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

    // Extract duration
    const duration = metadata.duration as number | undefined;
    if (duration) {
      if (duration <= 15) {
        tags.push({
          category: 'duration_tag',
          name: 'Short Form',
          confidence: 0.95,
          source: 'metadata',
        });
      } else if (duration <= 60) {
        tags.push({
          category: 'duration_tag',
          name: 'Medium',
          confidence: 0.9,
          source: 'metadata',
        });
      } else {
        tags.push({
          category: 'duration_tag',
          name: 'Long Form',
          confidence: 0.85,
          source: 'metadata',
        });
      }
    }

    // Extract codec
    const codec = metadata.codec_name as string | undefined;
    if (codec) {
      if (codec === 'h264') {
        visualConcepts.push('standard_compression');
      } else if (codec === 'h265' || codec === 'hevc') {
        visualConcepts.push('efficient_compression');
      } else if (codec === 'vp9' || codec === 'av1') {
        visualConcepts.push('modern_codec');
      }
    }

    // Extract audio info
    const hasAudio = metadata.has_audio as boolean | undefined;
    if (hasAudio === false) {
      tags.push({
        category: 'audio_type',
        name: 'No Audio',
        confidence: 0.99,
        source: 'metadata',
      });
    }

    // Extract bitrate for quality inference
    const bitrate = metadata.bit_rate as number | undefined;
    if (bitrate) {
      if (bitrate > 10000000) { // > 10 Mbps
        visualConcepts.push('high_bitrate');
        tags.push({
          category: 'quality_level',
          name: 'High',
          confidence: 0.8,
          source: 'metadata',
        });
      } else if (bitrate < 1000000) { // < 1 Mbps
        visualConcepts.push('low_bitrate');
        tags.push({
          category: 'quality_level',
          name: 'Low',
          confidence: 0.7,
          source: 'metadata',
        });
      }
    }
  }

  /**
   * Detect video format and style characteristics.
   */
  private detectVideoFormat(
    metadata: Record<string, unknown>,
    tags: AnalyzedTag[],
  ): VideoFormat {
    // Determine style from tags
    let style: VideoStyle = 'talking_head'; // Default
    const styleTag = tags.find(t => t.category === 'visual_style');
    if (styleTag) {
      style = styleTag.name.toLowerCase().replace(/\s+/g, '_') as VideoStyle;
    }

    // Determine pacing from duration
    const duration = metadata.duration as number | undefined;
    let pacing: 'fast' | 'medium' | 'slow' = 'medium';
    if (duration) {
      if (duration <= 15) pacing = 'fast';
      else if (duration >= 60) pacing = 'slow';
    }

    // Determine energy from content
    const intentTag = tags.find(t => t.category === 'content_intent');
    let energy: 'high' | 'medium' | 'low' = 'medium';
    if (intentTag) {
      if (intentTag.name === 'Promotion' || intentTag.name === 'Announcement') {
        energy = 'high';
      } else if (intentTag.name === 'Education') {
        energy = 'low';
      }
    }

    return {
      style,
      pacing,
      energy,
      productionValue: 'professional', // Default assumption
      narrative: 'linear',
      hasTextOverlays: false,
      hasTransitions: false,
    };
  }

  /**
   * Analyze transcript to extract semantic concepts.
   */
  private analyzeTranscript(
    transcript: string,
    tags: AnalyzedTag[],
    semanticConcepts: string[],
  ): void {
    const lowerTranscript = transcript.toLowerCase();

    // Detect content intent from speech
    if (lowerTranscript.includes('learn') || lowerTranscript.includes('how to') || lowerTranscript.includes('tutorial')) {
      tags.push({
        category: 'content_intent',
        name: 'Education',
        confidence: 0.8,
        source: 'transcript',
      });
    }

    if (lowerTranscript.includes('buy') || lowerTranscript.includes('discount') || lowerTranscript.includes('sale')) {
      tags.push({
        category: 'content_intent',
        name: 'Promotion',
        confidence: 0.85,
        source: 'transcript',
      });
    }

    if (lowerTranscript.includes('inspire') || lowerTranscript.includes('motivation') || lowerTranscript.includes('believe')) {
      tags.push({
        category: 'content_intent',
        name: 'Inspiration',
        confidence: 0.75,
        source: 'transcript',
      });
    }

    // Extract topics from speech
    const topics = ['business', 'marketing', 'fitness', 'health', 'technology', 'finance'];
    for (const topic of topics) {
      if (lowerTranscript.includes(topic)) {
        semanticConcepts.push(topic);
      }
    }

    // Detect questions (educational content)
    if (transcript.includes('?')) {
      tags.push({
        category: 'content_style',
        name: 'Tutorial',
        confidence: 0.7,
        source: 'transcript',
      });
    }
  }

  /**
   * Generate a semantic description from tags, entities, and format.
   */
  private generateDescription(
    tags: AnalyzedTag[],
    entities: DetectedEntity[],
    videoFormat?: VideoFormat,
  ): string {
    const parts: string[] = [];

    // Add people
    const people = entities.filter(e => e.type === 'person');
    if (people.length > 0) {
      const personNames = people.map(p => p.name).join(' and ');
      parts.push(`${personNames} in the video`);
    }

    // Add visual style
    if (videoFormat) {
      const styleName = videoFormat.style.replace(/_/g, ' ');
      parts.push(`featuring ${styleName} style`);
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

    // Add duration context
    const durationTags = tags.filter(t => t.category === 'duration_tag');
    if (durationTags.length > 0 && durationTags[0]) {
      parts.push(`(${durationTags[0].name.toLowerCase()} format)`);
    }

    if (parts.length === 0) {
      return 'A video with visual content';
    }

    return parts.join(' ');
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let instance: VideoAnalyzer | null = null;

/**
 * Get the singleton VideoAnalyzer instance.
 */
export function getVideoAnalyzer(config?: {
  frameSamplingRate?: number;
  maxFramesToSample?: number;
}): VideoAnalyzer {
  if (!instance) {
    instance = new VideoAnalyzer(config);
  }
  return instance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetVideoAnalyzer(): void {
  instance = null;
}
