// Content Intelligence Engine — Generation Factory Types
// Phase 3: Core types for the generation orchestration layer

// ─── Job State Machine ──────────────────────────────────────────────────────

/**
 * Generation job status state machine.
 *
 * Valid transitions:
 *
 *   PLANNED → QUEUED → SUBMITTING → SUBMITTED → PROCESSING → COMPLETED → READY
 *                             ↓            ↓           ↓
 *                          FAILED       FAILED      FAILED
 *                             ↓            ↓           ↓
 *                          (retry)      (retry)     (retry)
 *                             ↓            ↓           ↓
 *                          SUBMITTING  SUBMITTING  SUBMITTING
 *
 *   Any state → CANCELLED
 *   Any state → REJECTED (content policy)
 */
export type GenerationJobStatus =
  | 'planned'      // Initial state, not yet queued
  | 'queued'       // Queued for processing
  | 'submitting'   // Being submitted to provider
  | 'submitted'    // Submitted, awaiting provider response
  | 'processing'   // Provider is generating
  | 'completed'    // Provider reports success
  | 'ready'        // Result persisted, media asset created
  | 'failed'       // Non-retryable failure
  | 'cancelled'    // User/system cancelled
  | 'rejected';    // Content policy rejection

/** Valid state transitions. */
const VALID_TRANSITIONS: Record<GenerationJobStatus, GenerationJobStatus[]> = {
  planned:     ['queued', 'cancelled'],
  queued:      ['submitting', 'cancelled', 'failed'],
  submitting:  ['submitted', 'failed', 'cancelled'],
  submitted:   ['processing', 'failed', 'cancelled'],
  processing:  ['completed', 'failed', 'cancelled', 'rejected'],
  completed:   ['ready', 'failed'],
  ready:       [],  // Terminal state
  failed:      ['queued', 'cancelled'],  // Can retry by re-queuing
  cancelled:   [],  // Terminal state
  rejected:    ['queued', 'cancelled'],  // Can retry with different input
};

/**
 * Check if a state transition is valid.
 */
export function isValidTransition(from: GenerationJobStatus, to: GenerationJobStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Attempt State Machine ──────────────────────────────────────────────────

/**
 * Generation attempt status.
 */
export type GenerationAttemptStatus =
  | 'pending'     // Attempt created, not yet submitted
  | 'submitting'  // Being submitted to provider
  | 'submitted'   // Submitted, awaiting response
  | 'processing'  // Provider is generating
  | 'completed'   // Success
  | 'failed'      // Failure
  | 'timed_out'   // Provider timed out
  | 'cancelled';  // Cancelled

// ─── Generation Request ─────────────────────────────────────────────────────

/**
 * A provider-agnostic generation request.
 */
export interface GenerationRequest {
  /** Organization making the request. */
  orgId: string;

  /** User making the request (optional). */
  userId?: string;

  /** The type of media to generate. */
  mediaType: 'image' | 'video' | 'audio' | 'text';

  /** The intent/purpose of the content. */
  intent?: string;

  /** Text prompt for generation. */
  prompt: string;

  /** Negative prompt (where supported). */
  negativePrompt?: string;

  /** Desired aspect ratio. */
  aspectRatio?: '1:1' | '9:16' | '16:9' | '4:5';

  /** Desired duration in seconds (for video). */
  duration?: number;

  /** Desired width in pixels. */
  width?: number;

  /** Desired height in pixels. */
  height?: number;

  /** Whether audio is required (for video). */
  requiresAudio?: boolean;

  /** Whether native audio from the provider is required. */
  requiresNativeAudio?: boolean;

  /** Reference image URL (for image-to-video, image edit). */
  imageUrl?: string;

  /** Reference image URLs (for style reference). */
  imageUrls?: string[];

  /** Audio URL (for lipsync). */
  audioUrl?: string;

  /** Random seed (where supported). */
  seed?: number;

  /** Style preset (where supported). */
  stylePreset?: string;

  /** Maximum acceptable cost in USD. */
  maxCost?: number;

  /** Preferred provider ID. */
  preferredProvider?: string;

  /** Required model capabilities. */
  requiredCapabilities?: string[];

  /** Provider-specific options (extensible). */
  providerOptions?: Record<string, unknown>;

  /** Webhook URL for async result notification. */
  webhookUrl?: string;

  /** Generation pipeline version. */
  generationVersion?: string;

  /** Additional metadata. */
  metadata?: Record<string, unknown>;
}

// ─── Generation Job ─────────────────────────────────────────────────────────

/**
 * A generation job tracks the lifecycle of a single generation request.
 */
export interface GenerationJobRecord {
  /** Unique job ID. */
  id: string;

  /** Organization ID. */
  orgId: string;

  /** Provider ID (set after routing). */
  providerId: string;

  /** Model ID (set after routing). */
  modelId: string;

  /** Generation kind (image, video, etc.). */
  kind: string;

  /** Current status. */
  status: GenerationJobStatus;

  /** The original request (serialized). */
  input: GenerationRequest;

  /** The result (set on completion). */
  output?: GenerationJobOutput;

  /** External provider job ID. */
  externalJobId?: string;

  /** External provider status. */
  externalStatus?: string;

  /** Credits reserved for this job. */
  creditsReserved: number;

  /** Credits actually charged. */
  creditsCharged: number;

  /** Estimated cost in USD. */
  estimatedCost?: number;

  /** Actual cost in USD. */
  actualCost?: number;

  /** Cost currency. */
  costCurrency: string;

  /** Error message (on failure). */
  errorMessage?: string;

  /** Error code (on failure). */
  errorCode?: string;

  /** Number of attempts made. */
  attempts: number;

  /** Maximum allowed attempts. */
  maxAttempts: number;

  /** When to next attempt (for retry backoff). */
  nextAttemptAt?: Date;

  /** Generation pipeline version. */
  processingVersion?: string;

  /** Media asset ID (set on completion). */
  mediaAssetId?: string;

  /** When the webhook was received. */
  webhookReceivedAt?: Date;

  /** When processing started. */
  startedAt?: Date;

  /** When processing completed. */
  completedAt?: Date;

  /** Duration in milliseconds. */
  durationMs?: number;

  /** Creation timestamp. */
  createdAt: Date;

  /** Last update timestamp. */
  updatedAt: Date;
}

/**
 * The output of a successful generation.
 */
export interface GenerationJobOutput {
  /** The output URL(s). */
  urls: string[];

  /** Asset type. */
  assetType: string;

  /** MIME type. */
  mimeType?: string;

  /** Width in pixels. */
  width?: number;

  /** Height in pixels. */
  height?: number;

  /** Duration in seconds. */
  durationSeconds?: number;

  /** File size in bytes. */
  fileSize?: number;

  /** Whether the output has audio. */
  hasAudio?: boolean;

  /** Audio metadata. */
  audio?: GenerationJobAudioOutput;

  /** Cloudinary public ID (if stored). */
  cloudinaryPublicId?: string;

  /** Provider-specific metadata. */
  providerMetadata?: Record<string, unknown>;
}

/**
 * Audio output metadata.
 */
export interface GenerationJobAudioOutput {
  /** Audio status. */
  status: 'unknown' | 'pending_validation' | 'valid' | 'invalid';

  /** Duration in milliseconds. */
  durationMs?: number;

  /** Audio codec. */
  codec?: string;

  /** Sample rate. */
  sampleRate?: number;

  /** Channels. */
  channels?: number;

  /** Loudness in LUFS. */
  loudnessLufs?: number;

  /** Audio source description. */
  source?: string;
}

// ─── Generation Attempt ─────────────────────────────────────────────────────

/**
 * A single attempt to generate media via a provider.
 */
export interface GenerationAttemptRecord {
  /** Unique attempt ID. */
  id: string;

  /** The job this attempt belongs to. */
  jobId: string;

  /** Attempt number (1, 2, 3, ...). */
  attemptNumber: number;

  /** Provider used for this attempt. */
  providerId: string;

  /** Model used for this attempt. */
  modelId: string;

  /** Current status. */
  status: GenerationAttemptStatus;

  /** The input sent to the provider. */
  input: Record<string, unknown>;

  /** The output received from the provider. */
  output?: Record<string, unknown>;

  /** Provider job ID. */
  externalJobId?: string;

  /** Error message (on failure). */
  errorMessage?: string;

  /** Error code (on failure). */
  errorCode?: string;

  /** Duration in milliseconds. */
  durationMs?: number;

  /** Credits charged for this attempt. */
  creditsCharged: number;

  /** Cost in USD for this attempt. */
  costUsd?: number;

  /** Creation timestamp. */
  createdAt: Date;

  /** Completion timestamp. */
  completedAt?: Date;
}

// ─── Webhook Events ─────────────────────────────────────────────────────────

/**
 * A webhook event from a provider.
 */
export interface WebhookEvent {
  /** Provider ID. */
  providerId: string;

  /** Provider job ID. */
  providerJobId: string;

  /** Event type. */
  eventType: 'status_change' | 'completed' | 'failed' | 'cancelled';

  /** Provider status string. */
  providerStatus?: string;

  /** Result payload (if completed). */
  payload?: Record<string, unknown>;

  /** Raw webhook body. */
  rawBody: string;

  /** Webhook signature. */
  signature?: string;

  /** Timestamp. */
  timestamp?: string;
}

// ─── Factory Options ────────────────────────────────────────────────────────

/**
 * Options for the GenerationFactory.
 */
export interface GenerationFactoryOptions {
  /** Default maximum attempts. */
  defaultMaxAttempts?: number;

  /** Default generation version. */
  defaultGenerationVersion?: string;

  /** Whether to enable retry. */
  enableRetry?: boolean;

  /** Retry backoff base in milliseconds. */
  retryBackoffBaseMs?: number;

  /** Retry backoff max in milliseconds. */
  retryBackoffMaxMs?: number;

  /** Polling interval for async jobs (ms). */
  pollingIntervalMs?: number;

  /** Maximum polling duration (ms). */
  maxPollingDurationMs?: number;
}

// ─── Error Types ────────────────────────────────────────────────────────────

/**
 * Generation error codes.
 */
export type GenerationErrorCode =
  | 'VALIDATION_ERROR'
  | 'ROUTING_FAILED'
  | 'PROVIDER_SUBMIT_FAILED'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_AUTH_ERROR'
  | 'PROVIDER_QUOTA_EXCEEDED'
  | 'CONTENT_POLICY_VIOLATION'
  | 'STORAGE_FAILED'
  | 'DATABASE_ERROR'
  | 'WEBHOOK_PROCESSING_FAILED'
  | 'RESULT_PROCESSING_FAILED'
  | 'MAX_ATTEMPTS_EXCEEDED'
  | 'CANCELLED'
  | 'UNKNOWN_ERROR';

/**
 * Check if an error code is retryable.
 */
export function isRetryableError(code: GenerationErrorCode): boolean {
  const retryableCodes: GenerationErrorCode[] = [
    'PROVIDER_TIMEOUT',
    'PROVIDER_RATE_LIMITED',
    'PROVIDER_SUBMIT_FAILED',
    'STORAGE_FAILED',
    'DATABASE_ERROR',
    'UNKNOWN_ERROR',
  ];
  return retryableCodes.includes(code);
}
