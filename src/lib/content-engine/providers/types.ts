// Content Intelligence Engine — Provider Abstraction Layer
// Phase 2: Provider/Model interfaces
//
// PRINCIPLE: NativPost should never build its Content Factory around a single provider.
// FAL is a provider. Seedance is a model. The system thinks in terms of
// CONTENT REQUEST -> MODEL REQUIREMENTS -> MODEL ROUTER -> PROVIDER ADAPTER.

// ─── Provider Types ─────────────────────────────────────────────────────────

/** Supported provider capability types. */
export type ProviderCapability = 'image' | 'video' | 'audio' | 'text' | 'video-lipsync';

/** Provider status. */
export type ProviderStatus = 'active' | 'inactive' | 'error';

/** A registered provider in the system. */
export interface Provider {
  /** Unique identifier (e.g., 'fal', 'elevenlabs', 'openai'). */
  readonly id: string;

  /** Human-readable name. */
  readonly name: string;

  /** What this provider can do. */
  readonly type: ProviderCapability;

  /** Provider-specific configuration (API keys, base URLs, etc.). */
  readonly config: ProviderConfig;

  /** Whether this provider is currently available. */
  readonly isActive: boolean;

  /** Priority for model routing (higher = preferred). */
  readonly priority: number;

  /** Submit a generation job to this provider. */
  submitJob(request: GenerationRequest): Promise<JobSubmission>;

  /** Check the status of a submitted job. */
  getJobStatus(jobId: string, providerModelId: string): Promise<JobStatus>;

  /** Get the result of a completed job. */
  getJobResult(jobId: string, providerModelId: string): Promise<JobResult>;

  /** Cancel a running job. */
  cancelJob(jobId: string, providerModelId: string): Promise<void>;

  /** Verify a webhook signature. */
  verifyWebhook?(signature: string, body: string, timestamp?: string): Promise<boolean>;
}

/** Provider-specific configuration. */
export interface ProviderConfig {
  /** Environment variable name for the API key. */
  envVar?: string;

  /** API key value (read from env). */
  apiKey?: string;

  /** Base URL for API calls. */
  baseUrl?: string;

  /** Additional provider-specific config. */
  [key: string]: unknown;
}

// ─── Model Types ────────────────────────────────────────────────────────────

/** Model type classification. */
export type ModelType = 'image' | 'image-edit' | 'video' | 'video-lipsync' | 'audio' | 'text';

/** Aspect ratio options. */
export type AspectRatio = '1:1' | '9:16' | '16:9' | '4:5';

/** A registered model in the system. */
export interface Model {
  /** Unique identifier (e.g., 'flux-dev', 'seedance-2-i2v'). */
  readonly id: string;

  /** Human-readable label. */
  readonly label: string;

  /** The provider that serves this model. */
  readonly providerId: string;

  /** Model type classification. */
  readonly type: ModelType;

  /** The provider's internal model identifier. */
  readonly providerModelId: string;

  /** Cost per call in USD (nullable for free models). */
  readonly costPerCall: number | null;

  /** Cost per second for video models (nullable). */
  readonly costPerSecond: number | null;

  /** Whether this model is currently available. */
  readonly isActive: boolean;

  /** Supported aspect ratios. */
  readonly aspects: AspectRatio[];

  /** Duration options for video models. */
  readonly durations?: number[];

  /** Whether the model requires a reference image URL. */
  readonly requiresImage: boolean;

  /** Whether the model requires an audio URL. */
  readonly requiresAudio: boolean;

  /** Capabilities and constraints of this model. */
  readonly capabilities: ModelCapabilities;
}

/** Model capabilities and constraints. */
export interface ModelCapabilities {
  /** Maximum output dimensions. */
  maxWidth?: number;
  maxHeight?: number;

  /** Maximum duration in seconds for video models. */
  maxDuration?: number;

  /** Whether the model produces native audio. */
  nativeAudio?: boolean;

  /** Whether the model supports lip-sync. */
  lipSync?: boolean;

  /** Supported input formats. */
  inputFormats?: string[];

  /** Supported output formats. */
  outputFormats?: string[];

  /** Additional provider-specific capabilities. */
  [key: string]: unknown;
}

// ─── Generation Request/Response ────────────────────────────────────────────

/** A request to generate content. */
export interface GenerationRequest {
  /** The model ID to use (from Model.id). */
  modelId: string;

  /** The organization ID making the request. */
  orgId: string;

  /** The generation kind. */
  kind: ModelType;

  /** Input parameters (model-specific). */
  input: GenerationInput;

  /** Webhook URL for async results. */
  webhookUrl?: string;
}

/** Input parameters for generation. */
export interface GenerationInput {
  /** Text prompt. */
  prompt?: string;

  /** Reference image URL (for image-to-video, image edit). */
  imageUrl?: string;

  /** Reference image URLs (for style reference). */
  imageUrls?: string[];

  /** Audio URL (for lipsync). */
  audioUrl?: string;

  /** Output aspect ratio. */
  aspectRatio?: AspectRatio;

  /** Duration in seconds (for video). */
  duration?: number;

  /** Output width. */
  width?: number;

  /** Output height. */
  height?: number;

  /** Additional model-specific parameters. */
  [key: string]: unknown;
}

/** Result of a job submission. */
export interface JobSubmission {
  /** The provider's job/request ID. */
  providerJobId: string;

  /** The current status. */
  status: JobStatusType;

  /** URL to check job status (for async providers). */
  statusUrl?: string;

  /** URL to get the result (for async providers). */
  resultUrl?: string;

  /** URL to cancel the job. */
  cancelUrl?: string;
}

/** Job status types. */
export type JobStatusType =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'unknown';

/** Detailed job status. */
export interface JobStatus {
  /** Current status. */
  status: JobStatusType;

  /** Provider-specific status string. */
  providerStatus?: string;

  /** Queue position (if queued). */
  queuePosition?: number;

  /** Progress logs. */
  logs?: Array<{ message: string; timestamp: string }>;

  /** Error message if failed. */
  error?: string;
}

/** Result of a completed job. */
export interface JobResult {
  /** The output URL(s). */
  urls: string[];

  /** Output metadata. */
  metadata: JobResultMetadata;

  /** Provider-specific raw output. */
  rawOutput?: unknown;
}

/** Metadata about a generated asset. */
export interface JobResultMetadata {
  /** Asset type (image, video, audio). */
  assetType: string;

  /** MIME type. */
  mimeType?: string;

  /** Width in pixels. */
  width?: number;

  /** Height in pixels. */
  height?: number;

  /** Duration in seconds (for video/audio). */
  durationSeconds?: number;

  /** File size in bytes. */
  fileSize?: number;

  /** Whether the output has audio. */
  hasAudio?: boolean;

  /** Audio status if applicable. */
  audioStatus?: 'unknown' | 'pending_validation' | 'valid' | 'invalid';

  /** Additional provider-specific metadata. */
  [key: string]: unknown;
}
