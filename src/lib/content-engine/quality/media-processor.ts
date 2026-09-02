// Content Intelligence Engine — Media Processor
// Phase 4: Core media processing abstraction

import type {
  MediaType,
  MediaProcessingResult,
  MediaProcessorConfig,
  NormalizedMetadata,
  AudioMetadata,
  VideoValidation,
  ImageValidation,
  QualityScores,
  QualityAssessment,
  ProcessingMetadata,
  QualityGateResult,
  FailureCode,
} from './types';
import { DEFAULT_PROCESSOR_CONFIG } from './types';
import { AudioValidator, getAudioValidator } from './audio-validator';
import { VideoValidator, getVideoValidator } from './video-validator';
import { ImageValidator, getImageValidator } from './image-validator';
import { QualityGate, getQualityGate } from './quality-gate';

// ─── MediaProcessor ─────────────────────────────────────────────────────────

/**
 * MediaProcessor — orchestrates media processing and validation.
 *
 * Responsibilities:
 * 1. Download/acquire media from storage
 * 2. Run FFprobe for metadata extraction
 * 3. Validate media based on type
 * 4. Compute quality scores
 * 5. Run quality gate
 * 6. Return structured result
 *
 * Does NOT:
 * - Make acceptance decisions (that's the caller)
 * - Perform quality scoring beyond technical validation
 * - Tag or embed media
 */
export class MediaProcessor {
  private config: MediaProcessorConfig;
  private audioValidator: AudioValidator;
  private videoValidator: VideoValidator;
  private imageValidator: ImageValidator;
  private qualityGate: QualityGate;

  constructor(config: Partial<MediaProcessorConfig> = {}) {
    this.config = { ...DEFAULT_PROCESSOR_CONFIG, ...config };
    this.audioValidator = getAudioValidator(this.config.audio);
    this.videoValidator = getVideoValidator(this.config.video);
    this.imageValidator = getImageValidator(this.config.image);
    this.qualityGate = getQualityGate(this.config.gateVersion);
  }

  /**
   * Process and validate media.
   *
   * @param mediaType - Type of media
   * @param url - URL to download media from
   * @returns Complete processing result
   */
  async process(
    mediaType: MediaType,
    url: string,
  ): Promise<MediaProcessingResult> {
    const startTime = Date.now();
    const steps: string[] = [];

    try {
      // Step 1: Download/acquire media
      steps.push('download');
      const mediaData = await this.downloadMedia(url);

      // Step 2: Extract metadata via FFprobe
      steps.push('probe');
      const probeData = await this.probeMedia(mediaData.buffer, mediaType) as Record<string, unknown>;

      // Step 3: Normalize metadata
      steps.push('normalize');
      const normalized = this.normalizeMetadata(probeData);

      // Step 4: Validate based on type
      steps.push('validate');
      let audio: AudioMetadata | undefined;
      let video: VideoValidation | undefined;
      let image: ImageValidation | undefined;

      const streams = (probeData.streams ?? []) as Array<Record<string, unknown>>;
      const format = (probeData.format ?? {}) as Record<string, unknown>;

      if (mediaType === 'video') {
        video = this.videoValidator.validate(
          format,
          streams.filter(s => s.codec_type === 'video'),
          streams.filter(s => s.codec_type === 'audio'),
        );
        audio = video.audio;
      } else if (mediaType === 'image') {
        image = this.imageValidator.validate(probeData);
      } else if (mediaType === 'audio') {
        audio = this.audioValidator.validate(
          streams.filter(s => s.codec_type === 'audio'),
        );
      }

      // Step 5: Compute quality scores
      steps.push('score');
      const scores = this.computeScores(mediaType, video, image, audio);
      const assessment = this.buildAssessment(scores);

      // Step 6: Run quality gate
      steps.push('gate');
      const processingMetadata: ProcessingMetadata = {
        durationMs: Date.now() - startTime,
        processorVersion: this.config.processorVersion,
        steps,
        rawMetadata: probeData,
      };

      const result: MediaProcessingResult = {
        mediaType,
        metadata: normalized,
        audio,
        video,
        image,
        quality: assessment,
        gate: {
          passed: false, // Will be set by gate evaluation
          failures: [],
          warnings: [],
          assessment,
          processing: processingMetadata,
          gateVersion: this.config.gateVersion,
          evaluatedAt: new Date(),
        },
        processing: processingMetadata,
      };

      // Evaluate gate
      result.gate = this.qualityGate.evaluate(result);

      return result;
    } catch (error) {
      // Processing failed
      const processingMetadata: ProcessingMetadata = {
        durationMs: Date.now() - startTime,
        processorVersion: this.config.processorVersion,
        steps,
      };

      return this.buildFailureResult(mediaType, error, processingMetadata);
    }
  }

  /**
   * Process media from a buffer (for already-downloaded content).
   */
  processBuffer(
    mediaType: MediaType,
    buffer: Buffer,
  ): MediaProcessingResult {
    const startTime = Date.now();
    const steps: string[] = ['probe'];

    try {
      // Extract metadata from buffer
      const probeData = this.probeBuffer(buffer, mediaType) as Record<string, unknown>;

      // Normalize metadata
      steps.push('normalize');
      const normalized = this.normalizeMetadata(probeData);

      // Validate based on type
      steps.push('validate');
      let audio: AudioMetadata | undefined;
      let video: VideoValidation | undefined;
      let image: ImageValidation | undefined;

      const streams = (probeData.streams ?? []) as Array<Record<string, unknown>>;
      const format = (probeData.format ?? {}) as Record<string, unknown>;

      if (mediaType === 'video') {
        video = this.videoValidator.validate(
          format,
          streams.filter(s => s.codec_type === 'video'),
          streams.filter(s => s.codec_type === 'audio'),
        );
        audio = video.audio;
      } else if (mediaType === 'image') {
        image = this.imageValidator.validate(probeData);
      } else if (mediaType === 'audio') {
        audio = this.audioValidator.validate(
          streams.filter(s => s.codec_type === 'audio'),
        );
      }

      // Compute quality scores
      steps.push('score');
      const scores = this.computeScores(mediaType, video, image, audio);
      const assessment = this.buildAssessment(scores);

      // Run quality gate
      steps.push('gate');
      const processingMetadata: ProcessingMetadata = {
        durationMs: Date.now() - startTime,
        processorVersion: this.config.processorVersion,
        steps,
        rawMetadata: probeData,
      };

      const result: MediaProcessingResult = {
        mediaType,
        metadata: normalized,
        audio,
        video,
        image,
        quality: assessment,
        gate: {
          passed: false,
          failures: [],
          warnings: [],
          assessment,
          processing: processingMetadata,
          gateVersion: this.config.gateVersion,
          evaluatedAt: new Date(),
        },
        processing: processingMetadata,
      };

      result.gate = this.qualityGate.evaluate(result);

      return result;
    } catch (error) {
      const processingMetadata: ProcessingMetadata = {
        durationMs: Date.now() - startTime,
        processorVersion: this.config.processorVersion,
        steps,
      };

      return this.buildFailureResult(mediaType, error, processingMetadata);
    }
  }

  /**
   * Quick validation without full processing.
   */
  validateQuick(
    mediaType: MediaType,
    url: string,
    metadata?: Record<string, unknown>,
  ): QualityGateResult {
    if (mediaType === 'video') {
      const video = this.videoValidator.validateQuick(url, metadata);
      const audio: AudioMetadata = {
        hasStream: false,
        isSilent: true,
        isTruncated: false,
        status: 'unknown',
        failures: [],
      };
      return this.qualityGate.evaluateVideoQuick(video, audio);
    }

    if (mediaType === 'image') {
      const image = this.imageValidator.validate(metadata ?? {});
      return this.qualityGate.evaluateImageQuick(image);
    }

    // Audio-only validation not supported in quick mode
    return {
      passed: false,
      failures: ['PROCESSING_FAILED'],
      warnings: [],
      assessment: {
        scores: {
          technical: null,
          audio: null,
          visual: null,
          safety: null,
          composition: null,
          semantic: null,
        },
        overall: null,
        flags: [],
        gateVersion: this.config.gateVersion,
        assessedAt: new Date(),
      },
      processing: {
        durationMs: 0,
        processorVersion: this.config.processorVersion,
        steps: ['quick_validation_unsupported'],
      },
      gateVersion: this.config.gateVersion,
      evaluatedAt: new Date(),
    };
  }

  // ─── Private Methods ───────────────────────────────────────────────────

  /**
   * Download media from URL.
   */
  private async downloadMedia(url: string): Promise<{ buffer: Buffer; contentType?: string }> {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.config.processingTimeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Failed to download media: ${response.status} ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') ?? undefined;

    return { buffer, contentType };
  }

  /**
   * Probe media with FFprobe.
   * Returns parsed metadata.
   */
  private async probeMedia(
    buffer: Buffer,
    mediaType: MediaType,
  ): Promise<Record<string, unknown>> {
    // In production, this would use FFprobe
    // For now, we'll use a simplified approach based on file signatures
    return this.probeBuffer(buffer, mediaType);
  }

  /**
   * Probe a buffer for metadata.
   */
  private probeBuffer(
    buffer: Buffer,
    mediaType: MediaType,
  ): Record<string, unknown> {
    // Simplified metadata extraction
    // In production, use FFprobe or similar
    const metadata: Record<string, unknown> = {
      size: buffer.length,
      format_name: this.detectFormat(buffer, mediaType),
    };

    // Extract basic info based on format
    if (mediaType === 'video') {
      // MP4 container detection
      if (buffer.includes(Buffer.from('ftyp'))) {
        metadata.format_name = 'mp4';
      }
    } else if (mediaType === 'image') {
      // Image format detection
      if (buffer[0] === 0xff && buffer[1] === 0xd8) {
        metadata.format_name = 'jpeg';
        metadata.mime_type = 'image/jpeg';
      } else if (buffer[0] === 0x89 && buffer[1] === 0x50) {
        metadata.format_name = 'png';
        metadata.mime_type = 'image/png';
      }
    }

    return metadata;
  }

  /**
   * Detect media format from buffer.
   */
  private detectFormat(buffer: Buffer, mediaType: MediaType): string {
    if (mediaType === 'video') {
      if (buffer.includes(Buffer.from('ftyp'))) return 'mp4';
      if (buffer.includes(Buffer.from('webm'))) return 'webm';
      if (buffer.includes(Buffer.from('mdat'))) return 'mov';
    } else if (mediaType === 'image') {
      if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'jpeg';
      if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'png';
      if (buffer[0] === 0x47 && buffer[1] === 0x49) return 'gif';
    } else if (mediaType === 'audio') {
      if (buffer[0] === 0x49 && buffer[1] === 0x44) return 'mp3';
      if (buffer[0] === 0x4f && buffer[1] === 0x67) return 'ogg';
    }
    return 'unknown';
  }

  /**
   * Normalize metadata to standard format.
   */
  private normalizeMetadata(
    probeData: Record<string, unknown>,
  ): NormalizedMetadata {
    const width = probeData.width ? Number(probeData.width) : undefined;
    const height = probeData.height ? Number(probeData.height) : undefined;

    let aspectRatio: string | undefined;
    if (width && height) {
      const gcd = this.gcd(width, height);
      aspectRatio = `${width / gcd}:${height / gcd}`;
    }

    return {
      width,
      height,
      aspectRatio,
      durationSeconds: probeData.duration ? parseFloat(String(probeData.duration)) : undefined,
      fps: probeData.r_frame_rate ? this.parseFps(String(probeData.r_frame_rate)) : undefined,
      codec: probeData.codec_name as string | undefined,
      mimeType: probeData.mime_type as string | undefined,
      fileSize: probeData.size ? Number(probeData.size) : undefined,
      bitrate: probeData.bit_rate ? Number(probeData.bit_rate) : undefined,
      container: probeData.format_name as string | undefined,
      hasAudio: this.detectAudio(probeData),
      audioStatus: 'unknown',
    };
  }

  /**
   * Compute quality scores based on validation results.
   */
  private computeScores(
    mediaType: MediaType,
    video?: VideoValidation,
    image?: ImageValidation,
    audio?: AudioMetadata,
  ): QualityScores {
    let technical: number | null = null;
    let audioScore: number | null = null;
    let visual: number | null = null;

    // Technical score
    if (mediaType === 'video' && video) {
      technical = video.isValid ? 0.8 : 0.2;
      if (video.bitrate && video.bitrate < 100000) {
        technical = Math.max(0.1, technical - 0.3);
      }
    } else if (mediaType === 'image' && image) {
      technical = image.isValid ? 0.8 : 0.2;
    }

    // Audio score
    if (audio) {
      if (audio.status === 'valid') {
        audioScore = 0.8;
        if (audio.loudnessLufs !== null && audio.loudnessLufs !== undefined) {
          // Prefer -14 to -24 LUFS (broadcast standard)
          if (audio.loudnessLufs >= -24 && audio.loudnessLufs <= -14) {
            audioScore = 0.9;
          }
        }
      } else if (audio.status === 'no_audio' || audio.status === 'silent_audio') {
        audioScore = 0.1;
      } else {
        audioScore = 0.3;
      }
    }

    // Visual score — NULL for now (requires AI analysis)
    visual = null;

    return {
      technical,
      audio: audioScore,
      visual,
      safety: null, // Not evaluated here
      composition: null, // Not for raw assets
      semantic: null, // Not evaluated here
    };
  }

  /**
   * Build quality assessment from scores.
   */
  private buildAssessment(scores: QualityScores): QualityAssessment {
    const nonNullScores = [
      scores.technical,
      scores.audio,
      scores.visual,
      scores.safety,
      scores.composition,
      scores.semantic,
    ].filter((s): s is number => s !== null);

    const overall = nonNullScores.length > 0
      ? nonNullScores.reduce((a, b) => a + b, 0) / nonNullScores.length
      : null;

    const flags: string[] = [];
    if (scores.technical !== null && scores.technical < 0.5) {
      flags.push('low_technical_quality');
    }
    if (scores.audio !== null && scores.audio < 0.5) {
      flags.push('low_audio_quality');
    }

    return {
      scores,
      overall,
      flags,
      gateVersion: this.config.gateVersion,
      assessedAt: new Date(),
    };
  }

  /**
   * Build a failure result when processing fails.
   */
  private buildFailureResult(
    mediaType: MediaType,
    error: unknown,
    processing: ProcessingMetadata,
  ): MediaProcessingResult {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Determine failure code
    let failureCode: FailureCode = 'PROCESSING_FAILED';
    if (errorMessage.includes('download') || errorMessage.includes('fetch')) {
      failureCode = 'DOWNLOAD_FAILED';
    } else if (errorMessage.includes('timeout')) {
      failureCode = 'TIMEOUT';
    } else if (errorMessage.includes('storage')) {
      failureCode = 'STORAGE_FAILED';
    }

    const scores: QualityScores = {
      technical: 0,
      audio: null,
      visual: null,
      safety: null,
      composition: null,
      semantic: null,
    };

    return {
      mediaType,
      metadata: {
        hasAudio: false,
        audioStatus: 'unknown',
      },
      quality: {
        scores,
        overall: 0,
        flags: ['processing_failed'],
        gateVersion: this.config.gateVersion,
        assessedAt: new Date(),
      },
      gate: {
        passed: false,
        failures: [failureCode],
        warnings: [],
        assessment: {
          scores,
          overall: 0,
          flags: ['processing_failed'],
          gateVersion: this.config.gateVersion,
          assessedAt: new Date(),
        },
        processing,
        gateVersion: this.config.gateVersion,
        evaluatedAt: new Date(),
      },
      processing,
    };
  }

  /**
   * GCD for aspect ratio calculation.
   */
  private gcd(a: number, b: number): number {
    return b === 0 ? a : this.gcd(b, a % b);
  }

  /**
   * Parse FPS from FFprobe format (e.g., "30/1").
   */
  private parseFps(fpsStr: string): number | undefined {
    const match = fpsStr.match(/(\d+)\/(\d+)/);
    if (match && match[1] && match[2]) {
      const num = parseInt(match[1], 10);
      const den = parseInt(match[2], 10);
      if (den > 0) {
        return num / den;
      }
    }
    return undefined;
  }

  /**
   * Detect if media has audio streams.
   */
  private detectAudio(probeData: Record<string, unknown>): boolean {
    const streams = probeData.streams as Array<Record<string, unknown>> | undefined;
    if (!streams) return false;
    return streams.some(s => s.codec_type === 'audio');
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let instance: MediaProcessor | null = null;

/**
 * Get the singleton MediaProcessor instance.
 */
export function getMediaProcessor(
  config?: Partial<MediaProcessorConfig>,
): MediaProcessor {
  if (!instance) {
    instance = new MediaProcessor(config);
  }
  return instance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetMediaProcessor(): void {
  instance = null;
}
