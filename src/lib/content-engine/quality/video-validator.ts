// Content Intelligence Engine — Video Validator
// Phase 4: Technical video validation

import type {
  VideoValidation,
  VideoValidationConfig,
  FailureCode,
} from './types';
import { DEFAULT_VIDEO_CONFIG } from './types';
import { AudioValidator, getAudioValidator } from './audio-validator';

// ─── VideoValidator ─────────────────────────────────────────────────────────

/**
 * VideoValidator — performs technical video validation.
 *
 * Responsibilities:
 * 1. Validate container format
 * 2. Validate video codec
 * 3. Validate dimensions, FPS, duration
 * 4. Validate audio stream (delegates to AudioValidator)
 * 5. Detect corruption
 *
 * Does NOT:
 * - Determine visual quality (that's scoring)
 * - Determine content appropriateness (that's qualification)
 */
export class VideoValidator {
  private config: VideoValidationConfig;
  private audioValidator: AudioValidator;

  constructor(config: Partial<VideoValidationConfig> = {}) {
    this.config = { ...DEFAULT_VIDEO_CONFIG, ...config };
    this.audioValidator = getAudioValidator(this.config.audio);
  }

  /**
   * Validate video from FFprobe metadata.
   *
   * @param metadata - FFprobe format metadata
   * @param videoStreams - Video streams from FFprobe
   * @param audioStreams - Audio streams from FFprobe
   * @returns Video validation result
   */
  validate(
    metadata: Record<string, unknown>,
    videoStreams: Array<Record<string, unknown>>,
    audioStreams: Array<Record<string, unknown>>,
  ): VideoValidation {
    const failures: FailureCode[] = [];
    const warnings: string[] = [];

    // Get primary video stream
    const videoStream = videoStreams?.[0];

    // Validate video stream exists
    if (!videoStream) {
      failures.push('VIDEO_UNDECODABLE');
      return this.buildResult(metadata, null, failures, warnings);
    }

    // Extract container format
    const container = (metadata.format_name as string)?.split(',')[0] ?? undefined;

    // Extract codec
    const codec = (videoStream.codec_name as string) ?? undefined;

    // Validate codec
    const supportedCodecs = ['h264', 'h265', 'hevc', 'vp8', 'vp9', 'av1'];
    if (codec && !supportedCodecs.includes(codec)) {
      failures.push('UNSUPPORTED_VIDEO_CODEC');
    }

    // Extract dimensions
    const width = videoStream.width ? Number(videoStream.width) : undefined;
    const height = videoStream.height ? Number(videoStream.height) : undefined;

    // Validate dimensions
    if (width !== undefined && height !== undefined) {
      if (width < this.config.minWidth || height < this.config.minHeight) {
        failures.push('INVALID_DIMENSIONS');
      }
    } else {
      failures.push('INVALID_DIMENSIONS');
    }

    // Extract FPS
    const fps = this.extractFps(videoStream);

    // Validate FPS
    if (fps !== undefined) {
      if (fps < this.config.minFps || fps > this.config.maxFps) {
        failures.push('INVALID_FPS');
      }
    }

    // Extract duration
    const durationSeconds = this.extractDuration(metadata, videoStream);

    // Validate duration
    if (durationSeconds !== undefined) {
      if (durationSeconds < this.config.minDurationSeconds) {
        failures.push('INVALID_DURATION');
      }
      if (durationSeconds > this.config.maxDurationSeconds) {
        warnings.push('EXCESSIVE_DURATION');
      }
    } else {
      failures.push('INVALID_DURATION');
    }

    // Extract file size
    const fileSize = metadata.size ? Number(metadata.size) : undefined;

    // Validate file size
    if (fileSize !== undefined) {
      if (fileSize > this.config.maxFileSizeBytes) {
        warnings.push('EXCESSIVE_FILE_SIZE');
      }
      if (fileSize === 0) {
        failures.push('VIDEO_CORRUPTED');
      }
    }

    // Extract bitrate
    const bitrate = metadata.bit_rate ? Number(metadata.bit_rate) : undefined;

    // Extract frame count
    const frameCount = videoStream.nb_frames ? Number(videoStream.nb_frames) : undefined;

    // Validate frame count
    if (frameCount !== undefined && frameCount === 0) {
      failures.push('ZERO_FRAMES');
    }

    // Validate audio
    const audio = this.audioValidator.validate(audioStreams, durationSeconds);

    // Check for audio failures
    if (audio.failures.includes('NO_AUDIO')) {
      failures.push('NO_AUDIO');
    }
    if (audio.failures.includes('SILENT_AUDIO')) {
      failures.push('SILENT_AUDIO');
    }
    if (audio.failures.includes('INVALID_AUDIO')) {
      failures.push('INVALID_AUDIO');
    }
    if (audio.failures.includes('CORRUPT_AUDIO')) {
      failures.push('CORRUPT_AUDIO');
    }
    if (audio.failures.includes('TRUNCATED_AUDIO')) {
      failures.push('TRUNCATED_AUDIO');
    }
    if (audio.failures.includes('AUDIO_DURATION_MISMATCH')) {
      failures.push('AUDIO_DURATION_MISMATCH');
    }

    // Check for corruption indicators
    if (this.detectCorruption(metadata, videoStream)) {
      failures.push('VIDEO_CORRUPTED');
    }

    const isValid = failures.length === 0;

    return {
      isValid,
      codec,
      container,
      width,
      height,
      fps,
      durationSeconds,
      bitrate,
      frameCount,
      fileSize,
      audio,
      failures,
      warnings,
    };
  }

  /**
   * Validate video from raw metadata (without FFprobe).
   * Used for quick validation when detailed analysis isn't available.
   */
  validateQuick(
    url: string,
    metadata?: Record<string, unknown>,
  ): VideoValidation {
    const failures: FailureCode[] = [];
    const warnings: string[] = [];

    // Basic URL validation
    if (!url) {
      failures.push('VIDEO_CORRUPTED');
      return this.buildResult({}, null, failures, warnings);
    }

    // If metadata provided, do basic validation
    if (metadata) {
      const duration = metadata.duration || metadata.durationSeconds;
      if (typeof duration === 'number' && duration <= 0) {
        failures.push('INVALID_DURATION');
      }

      const width = metadata.width;
      const height = metadata.height;
      if (typeof width === 'number' && typeof height === 'number') {
        if (width < this.config.minWidth || height < this.config.minHeight) {
          failures.push('INVALID_DIMENSIONS');
        }
      }
    }

    // Without full metadata, we can only do limited validation
    return {
      isValid: failures.length === 0,
      failures,
      warnings,
      audio: {
        hasStream: false,
        isSilent: true,
        isTruncated: false,
        status: 'unknown',
        failures: [],
      },
    };
  }

  /**
   * Extract FPS from video stream.
   */
  private extractFps(stream: Record<string, unknown>): number | undefined {
    // Try r_frame_rate first (most accurate)
    const rFrameRate = stream.r_frame_rate;
    if (typeof rFrameRate === 'string') {
      const match = rFrameRate.match(/(\d+)\/(\d+)/);
      if (match && match[1] && match[2]) {
        const num = parseInt(match[1], 10);
        const den = parseInt(match[2], 10);
        if (den > 0) {
          return num / den;
        }
      }
    }

    // Try avg_frame_rate
    const avgFrameRate = stream.avg_frame_rate;
    if (typeof avgFrameRate === 'string') {
      const match = avgFrameRate.match(/(\d+)\/(\d+)/);
      if (match && match[1] && match[2]) {
        const num = parseInt(match[1], 10);
        const den = parseInt(match[2], 10);
        if (den > 0) {
          return num / den;
        }
      }
    }

    return undefined;
  }

  /**
   * Extract duration from metadata or stream.
   */
  private extractDuration(
    metadata: Record<string, unknown>,
    stream: Record<string, unknown>,
  ): number | undefined {
    // Try format duration first
    if (metadata.duration) {
      const duration = parseFloat(String(metadata.duration));
      if (Number.isFinite(duration) && duration > 0) {
        return duration;
      }
    }

    // Try stream duration
    if (stream.duration) {
      const duration = parseFloat(String(stream.duration));
      if (Number.isFinite(duration) && duration > 0) {
        return duration;
      }
    }

    // Calculate from frames and time_base
    if (stream.nb_frames && stream.time_base) {
      const frames = parseInt(String(stream.nb_frames), 10);
      const timeBase = String(stream.time_base);
      const match = timeBase.match(/(\d+)\/(\d+)/);
      if (match && match[1] && match[2] && frames > 0) {
        const num = parseInt(match[1], 10);
        const den = parseInt(match[2], 10);
        if (den > 0) {
          return (frames * num) / den;
        }
      }
    }

    return undefined;
  }

  /**
   * Detect video corruption from metadata.
   */
  private detectCorruption(
    metadata: Record<string, unknown>,
    stream: Record<string, unknown>,
  ): boolean {
    // Check for zero duration
    const duration = this.extractDuration(metadata, stream);
    if (duration !== undefined && duration <= 0) {
      return true;
    }

    // Check for zero-size file
    const size = metadata.size ? Number(metadata.size) : 0;
    if (size === 0) {
      return true;
    }

    // Check for missing codec
    if (!stream.codec_name) {
      return true;
    }

    // Check for missing dimensions
    if (!stream.width || !stream.height) {
      return true;
    }

    return false;
  }

  /**
   * Build a partial result (used when validation fails early).
   */
  private buildResult(
    metadata: Record<string, unknown>,
    videoStream: Record<string, unknown> | null,
    failures: FailureCode[],
    warnings: string[],
  ): VideoValidation {
    return {
      isValid: failures.length === 0,
      codec: videoStream?.codec_name as string | undefined,
      container: metadata.format_name as string | undefined,
      width: videoStream?.width ? Number(videoStream.width) : undefined,
      height: videoStream?.height ? Number(videoStream.height) : undefined,
      fps: videoStream ? this.extractFps(videoStream) : undefined,
      durationSeconds: metadata.duration ? parseFloat(String(metadata.duration)) : undefined,
      bitrate: metadata.bit_rate ? Number(metadata.bit_rate) : undefined,
      fileSize: metadata.size ? Number(metadata.size) : undefined,
      audio: {
        hasStream: false,
        isSilent: true,
        isTruncated: false,
        status: 'unknown',
        failures: [],
      },
      failures,
      warnings,
    };
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let instance: VideoValidator | null = null;

/**
 * Get the singleton VideoValidator instance.
 */
export function getVideoValidator(
  config?: Partial<VideoValidationConfig>,
): VideoValidator {
  if (!instance) {
    instance = new VideoValidator(config);
  }
  return instance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetVideoValidator(): void {
  instance = null;
}
