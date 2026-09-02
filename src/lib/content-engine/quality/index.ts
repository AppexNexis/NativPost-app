// Content Intelligence Engine — Quality Module
// Phase 4: Barrel exports for media processing and quality validation

// ─── Types ──────────────────────────────────────────────────────────────────
export type {
  MediaType,
  MediaProcessingStatus,
  FailureCode,
  AudioValidationStatus,
  AudioMetadata,
  AudioValidationConfig,
  VideoValidation,
  VideoValidationConfig,
  ImageValidation,
  ImageValidationConfig,
  QualityScores,
  QualityAssessment,
  QualityGateResult,
  ProcessingMetadata,
  MediaProcessingResult,
  NormalizedMetadata,
  MediaProcessorConfig,
} from './types';

export {
  DEFAULT_AUDIO_CONFIG,
  DEFAULT_VIDEO_CONFIG,
  DEFAULT_IMAGE_CONFIG,
  DEFAULT_PROCESSOR_CONFIG,
  isHardFailure,
  isRetryableFailure,
} from './types';

// ─── Validators ─────────────────────────────────────────────────────────────
export {
  AudioValidator,
  getAudioValidator,
  resetAudioValidator,
} from './audio-validator';

export {
  VideoValidator,
  getVideoValidator,
  resetVideoValidator,
} from './video-validator';

export {
  ImageValidator,
  getImageValidator,
  resetImageValidator,
} from './image-validator';

// ─── Quality Gate ───────────────────────────────────────────────────────────
export {
  QualityGate,
  getQualityGate,
  resetQualityGate,
} from './quality-gate';

// ─── Media Processor ────────────────────────────────────────────────────────
export {
  MediaProcessor,
  getMediaProcessor,
  resetMediaProcessor,
} from './media-processor';
