// Content Intelligence Engine — Quality Types & Failure Taxonomy
// Phase 4: Core types for media processing and quality validation

// ─── Media Types ────────────────────────────────────────────────────────────

/**
 * Supported media types for processing.
 */
export type MediaType = 'image' | 'video' | 'audio';

/**
 * Media processing status.
 */
export type MediaProcessingStatus =
  | 'pending'        // Not yet processed
  | 'processing'     // Currently being processed
  | 'validated'      // Processing complete, passed validation
  | 'quarantined'    // Processing complete, failed validation
  | 'rejected'       // Permanently rejected
  | 'reprocessing';  // Being reprocessed

// ─── Failure Taxonomy ───────────────────────────────────────────────────────

/**
 * Failure codes for media processing.
 * These are structured, machine-readable reasons for rejection.
 */
export type FailureCode =
  // Video-specific failures
  | 'NO_AUDIO'
  | 'SILENT_AUDIO'
  | 'INVALID_AUDIO'
  | 'CORRUPT_AUDIO'
  | 'TRUNCATED_AUDIO'
  | 'AUDIO_DURATION_MISMATCH'
  | 'VIDEO_CORRUPTED'
  | 'VIDEO_UNDECODABLE'
  | 'INVALID_VIDEO_CONTAINER'
  | 'UNSUPPORTED_VIDEO_CODEC'
  | 'INVALID_FPS'
  | 'ZERO_FRAMES'
  // Image-specific failures
  | 'IMAGE_CORRUPTED'
  | 'IMAGE_UNDECODABLE'
  | 'INVALID_IMAGE_MIME'
  | 'IMAGE_BLANK'
  // Common failures
  | 'INVALID_DIMENSIONS'
  | 'INVALID_DURATION'
  | 'INVALID_FILE_SIZE'
  | 'INVALID_MIME_TYPE'
  | 'METADATA_MISSING'
  // Processing failures
  | 'PROCESSING_FAILED'
  | 'STORAGE_FAILED'
  | 'DOWNLOAD_FAILED'
  | 'TIMEOUT'
  // Safety failures
  | 'SAFETY_VIOLATION'
  | 'NSFW_CONTENT'
  | 'HATEFUL_CONTENT'
  | 'VIOLENT_CONTENT';

/**
 * Check if a failure code is a hard failure (asset cannot proceed).
 */
export function isHardFailure(code: FailureCode): boolean {
  const hardFailures: FailureCode[] = [
    // Video audio failures — HARD REQUIREMENT
    'NO_AUDIO',
    'SILENT_AUDIO',
    'INVALID_AUDIO',
    'CORRUPT_AUDIO',
    'TRUNCATED_AUDIO',
    'AUDIO_DURATION_MISMATCH',
    // Video failures
    'VIDEO_CORRUPTED',
    'VIDEO_UNDECODABLE',
    'INVALID_VIDEO_CONTAINER',
    'UNSUPPORTED_VIDEO_CODEC',
    'INVALID_FPS',
    'ZERO_FRAMES',
    // Image failures
    'IMAGE_CORRUPTED',
    'IMAGE_UNDECODABLE',
    'INVALID_IMAGE_MIME',
    // Common failures
    'INVALID_DIMENSIONS',
    'INVALID_DURATION',
    'INVALID_FILE_SIZE',
    'INVALID_MIME_TYPE',
    'METADATA_MISSING',
    // Processing failures
    'PROCESSING_FAILED',
    'STORAGE_FAILED',
    'DOWNLOAD_FAILED',
    // Safety failures
    'SAFETY_VIOLATION',
    'NSFW_CONTENT',
    'HATEFUL_CONTENT',
    'VIOLENT_CONTENT',
  ];
  return hardFailures.includes(code);
}

/**
 * Check if a failure code is retryable (processing may succeed on retry).
 */
export function isRetryableFailure(code: FailureCode): boolean {
  const retryableFailures: FailureCode[] = [
    'PROCESSING_FAILED',
    'STORAGE_FAILED',
    'DOWNLOAD_FAILED',
    'TIMEOUT',
  ];
  return retryableFailures.includes(code);
}

// ─── Audio Validation ───────────────────────────────────────────────────────

/**
 * Audio validation result status.
 */
export type AudioValidationStatus =
  | 'valid'           // Audio is present and usable
  | 'no_audio'        // No audio stream found
  | 'silent_audio'    // Audio stream exists but is silent
  | 'invalid_audio'   // Audio stream exists but is corrupt/unusable
  | 'truncated_audio' // Audio appears truncated
  | 'unknown';        // Cannot determine audio status

/**
 * Detailed audio metadata from processing.
 */
export interface AudioMetadata {
  /** Whether audio stream exists. */
  hasStream: boolean;

  /** Audio codec (e.g., 'aac', 'mp3', 'opus'). */
  codec?: string;

  /** Sample rate in Hz. */
  sampleRate?: number;

  /** Number of channels. */
  channels?: number;

  /** Audio duration in seconds. */
  durationSeconds?: number;

  /** Audio duration in milliseconds. */
  durationMs?: number;

  /** Loudness in LUFS (if measurable). */
  loudnessLufs?: number;

  /** Peak amplitude in dB. */
  peakDb?: number;

  /** Silence ratio (0.0 = no silence, 1.0 = fully silent). */
  silenceRatio?: number;

  /** Whether audio is effectively silent. */
  isSilent: boolean;

  /** Whether audio appears truncated. */
  isTruncated: boolean;

  /** Validation status. */
  status: AudioValidationStatus;

  /** Failure codes if validation failed. */
  failures: FailureCode[];
}

/**
 * Audio validation configuration thresholds.
 */
export interface AudioValidationConfig {
  /** Minimum loudness in LUFS to consider non-silent. Default: -60. */
  minLoudnessLufs: number;

  /** Maximum silence ratio to consider valid. Default: 0.95. */
  maxSilenceRatio: number;

  /** Minimum audio duration in seconds. Default: 0.1. */
  minDurationSeconds: number;

  /** Maximum duration mismatch ratio (audio/video). Default: 0.1. */
  maxDurationMismatchRatio: number;

  /** Minimum sample rate in Hz. Default: 8000. */
  minSampleRate: number;
}

/** Default audio validation config. */
export const DEFAULT_AUDIO_CONFIG: AudioValidationConfig = {
  minLoudnessLufs: -60,
  maxSilenceRatio: 0.95,
  minDurationSeconds: 0.1,
  maxDurationMismatchRatio: 0.1,
  minSampleRate: 8000,
};

// ─── Video Validation ───────────────────────────────────────────────────────

/**
 * Video validation result.
 */
export interface VideoValidation {
  /** Whether the video is technically valid. */
  isValid: boolean;

  /** Video codec (e.g., 'h264', 'h265', 'vp9'). */
  codec?: string;

  /** Container format (e.g., 'mp4', 'webm', 'mov'). */
  container?: string;

  /** Width in pixels. */
  width?: number;

  /** Height in pixels. */
  height?: number;

  /** Frames per second. */
  fps?: number;

  /** Duration in seconds. */
  durationSeconds?: number;

  /** Bitrate in bits per second. */
  bitrate?: number;

  /** Number of frames. */
  frameCount?: number;

  /** File size in bytes. */
  fileSize?: number;

  /** Audio metadata. */
  audio: AudioMetadata;

  /** Failure codes if validation failed. */
  failures: FailureCode[];

  /** Warning codes. */
  warnings: string[];
}

/**
 * Video validation configuration.
 */
export interface VideoValidationConfig {
  /** Minimum duration in seconds. Default: 0.5. */
  minDurationSeconds: number;

  /** Maximum duration in seconds. Default: 300. */
  maxDurationSeconds: number;

  /** Minimum width in pixels. Default: 256. */
  minWidth: number;

  /** Minimum height in pixels. Default: 256. */
  minHeight: number;

  /** Maximum file size in bytes (default: 500MB). */
  maxFileSizeBytes: number;

  /** Minimum FPS. Default: 1. */
  minFps: number;

  /** Maximum FPS. Default: 120. */
  maxFps: number;

  /** Audio validation config. */
  audio: AudioValidationConfig;
}

/** Default video validation config. */
export const DEFAULT_VIDEO_CONFIG: VideoValidationConfig = {
  minDurationSeconds: 0.5,
  maxDurationSeconds: 300,
  minWidth: 256,
  minHeight: 256,
  maxFileSizeBytes: 500 * 1024 * 1024, // 500MB
  minFps: 1,
  maxFps: 120,
  audio: DEFAULT_AUDIO_CONFIG,
};

// ─── Image Validation ───────────────────────────────────────────────────────

/**
 * Image validation result.
 */
export interface ImageValidation {
  /** Whether the image is technically valid. */
  isValid: boolean;

  /** Image format (e.g., 'jpeg', 'png', 'webp'). */
  format?: string;

  /** Width in pixels. */
  width?: number;

  /** Height in pixels. */
  height?: number;

  /** Color depth in bits. */
  colorDepth?: number;

  /** Whether image has alpha channel. */
  hasAlpha?: boolean;

  /** File size in bytes. */
  fileSize?: number;

  /** Whether image is effectively blank. */
  isBlank: boolean;

  /** Failure codes if validation failed. */
  failures: FailureCode[];

  /** Warning codes. */
  warnings: string[];
}

/**
 * Image validation configuration.
 */
export interface ImageValidationConfig {
  /** Minimum width in pixels. Default: 64. */
  minWidth: number;

  /** Minimum height in pixels. Default: 64. */
  minHeight: number;

  /** Maximum file size in bytes (default: 50MB). */
  maxFileSizeBytes: number;

  /** Maximum blank pixel ratio (0-1). Default: 0.99. */
  maxBlankRatio: number;
}

/** Default image validation config. */
export const DEFAULT_IMAGE_CONFIG: ImageValidationConfig = {
  minWidth: 64,
  minHeight: 64,
  maxFileSizeBytes: 50 * 1024 * 1024, // 50MB
  maxBlankRatio: 0.99,
};

// ─── Quality Scores ─────────────────────────────────────────────────────────

/**
 * Quality dimensions scored during processing.
 * NULL means "not evaluated" — NOT zero.
 */
export interface QualityScores {
  /** Technical quality (codec, resolution, bitrate, integrity). */
  technical: number | null;

  /** Audio quality (loudness, codec, silence). */
  audio: number | null;

  /** Visual quality (artifacts, blurriness, distortion). */
  visual: number | null;

  /** Safety quality (moderation, policy compliance). */
  safety: number | null;

  /** Composition quality (framing, balance). NULL for raw assets. */
  composition: number | null;

  /** Semantic quality (meaning, relevance). NULL if not evaluated. */
  semantic: number | null;
}

/**
 * Overall quality assessment.
 */
export interface QualityAssessment {
  /** Individual quality scores. */
  scores: QualityScores;

  /** Overall quality score (weighted average of non-null scores). */
  overall: number | null;

  /** Quality flags (e.g., 'low_bitrate', 'high_compression'). */
  flags: string[];

  /** Quality gate version used for evaluation. */
  gateVersion: string;

  /** When the assessment was performed. */
  assessedAt: Date;
}

// ─── Quality Gate ───────────────────────────────────────────────────────────

/**
 * Quality gate result.
 */
export interface QualityGateResult {
  /** Whether the asset passed the gate. */
  passed: boolean;

  /** Hard failure codes (asset cannot proceed). */
  failures: FailureCode[];

  /** Warning codes (asset can proceed with warnings). */
  warnings: string[];

  /** Quality assessment. */
  assessment: QualityAssessment;

  /** Processing metadata. */
  processing: ProcessingMetadata;

  /** Quality gate version. */
  gateVersion: string;

  /** When the gate was evaluated. */
  evaluatedAt: Date;
}

/**
 * Processing metadata.
 */
export interface ProcessingMetadata {
  /** Processing duration in milliseconds. */
  durationMs: number;

  /** Processor version. */
  processorVersion: string;

  /** FFmpeg version (if used). */
  ffmpegVersion?: string;

  /** Processing steps performed. */
  steps: string[];

  /** Raw metadata from processing. */
  rawMetadata?: Record<string, unknown>;
}

// ─── Media Processing Result ────────────────────────────────────────────────

/**
 * Complete result of media processing.
 */
export interface MediaProcessingResult {
  /** Media type. */
  mediaType: MediaType;

  /** Normalized metadata. */
  metadata: NormalizedMetadata;

  /** Audio metadata (for video/audio). */
  audio?: AudioMetadata;

  /** Video validation (for video). */
  video?: VideoValidation;

  /** Image validation (for image). */
  image?: ImageValidation;

  /** Quality assessment. */
  quality: QualityAssessment;

  /** Quality gate result. */
  gate: QualityGateResult;

  /** Processing metadata. */
  processing: ProcessingMetadata;
}

/**
 * Normalized metadata for database storage.
 */
export interface NormalizedMetadata {
  /** Width in pixels. */
  width?: number;

  /** Height in pixels. */
  height?: number;

  /** Aspect ratio (e.g., '9:16'). */
  aspectRatio?: string;

  /** Duration in seconds. */
  durationSeconds?: number;

  /** Frames per second. */
  fps?: number;

  /** Video/audio codec. */
  codec?: string;

  /** MIME type. */
  mimeType?: string;

  /** File size in bytes. */
  fileSize?: number;

  /** Bitrate in bits per second. */
  bitrate?: number;

  /** Container format. */
  container?: string;

  /** Whether media has audio. */
  hasAudio: boolean;

  /** Audio status. */
  audioStatus: AudioValidationStatus;
}

// ─── Processor Configuration ────────────────────────────────────────────────

/**
 * MediaProcessor configuration.
 */
export interface MediaProcessorConfig {
  /** Video validation config. */
  video: VideoValidationConfig;

  /** Image validation config. */
  image: ImageValidationConfig;

  /** Audio validation config. */
  audio: AudioValidationConfig;

  /** Quality gate version. */
  gateVersion: string;

  /** Processor version. */
  processorVersion: string;

  /** Temporary directory for processing. */
  tempDir: string;

  /** Maximum concurrent processing tasks. */
  maxConcurrency: number;

  /** Processing timeout in milliseconds. */
  processingTimeoutMs: number;
}

/** Default processor configuration. */
export const DEFAULT_PROCESSOR_CONFIG: MediaProcessorConfig = {
  video: DEFAULT_VIDEO_CONFIG,
  image: DEFAULT_IMAGE_CONFIG,
  audio: DEFAULT_AUDIO_CONFIG,
  gateVersion: '1.0.0',
  processorVersion: '1.0.0',
  tempDir: '/tmp/content-engine',
  maxConcurrency: 4,
  processingTimeoutMs: 300000, // 5 minutes
};
