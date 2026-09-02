// Content Intelligence Engine — Generation Factory
// Phase 3: Core orchestration layer for media generation

import { db } from '@/lib/db';
import {
  generationJobSchema,
  generationAttemptSchema,
  mediaAssetSchema,
} from '@/models/Schema';
import { eq, and, lte, asc } from 'drizzle-orm';
import { providerRegistry } from '../providers/registry';
import { modelRouter } from '../providers/router';
import type {
  GenerationRequest as ProviderGenerationRequest,
} from '../providers/types';
import type {
  GenerationRequest,
  GenerationJobRecord,
  GenerationJobStatus,
  GenerationAttemptRecord,
  GenerationJobOutput,
  GenerationJobAudioOutput,
  WebhookEvent,
  GenerationFactoryOptions,
  GenerationErrorCode,
} from './types';
import { isValidTransition, isRetryableError } from './types';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Current generation pipeline version. */
const GENERATION_VERSION = '1.0.0';

/** Default maximum attempts. */
const DEFAULT_MAX_ATTEMPTS = 3;

/** Default retry backoff base (ms). */
const DEFAULT_RETRY_BACKOFF_BASE_MS = 5000;

/** Default retry backoff max (ms). */
const DEFAULT_RETRY_BACKOFF_MAX_MS = 300000; // 5 minutes

// ─── GenerationFactory ──────────────────────────────────────────────────────

/**
 * GenerationFactory — the orchestration layer for media generation.
 *
 * Responsibilities:
 * 1. Validate generation requests
 * 2. Route to the appropriate model/provider
 * 3. Create and manage generation jobs
 * 4. Track attempts and retries
 * 5. Process results and create MediaAssets
 * 6. Handle webhooks and polling
 *
 * Does NOT:
 * - Decide if media is good (Phase 4)
 * - Perform quality validation (Phase 4)
 * - Tag or embed media (Phase 5)
 * - Build content compositions (Phase 7)
 */
export class GenerationFactory {
  private options: Required<GenerationFactoryOptions>;

  constructor(options: GenerationFactoryOptions = {}) {
    this.options = {
      defaultMaxAttempts: options.defaultMaxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      defaultGenerationVersion: options.defaultGenerationVersion ?? GENERATION_VERSION,
      enableRetry: options.enableRetry ?? true,
      retryBackoffBaseMs: options.retryBackoffBaseMs ?? DEFAULT_RETRY_BACKOFF_BASE_MS,
      retryBackoffMaxMs: options.retryBackoffMaxMs ?? DEFAULT_RETRY_BACKOFF_MAX_MS,
      pollingIntervalMs: options.pollingIntervalMs ?? 10000,
      maxPollingDurationMs: options.maxPollingDurationMs ?? 600000, // 10 minutes
    };
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  /**
   * Create a new generation job from a request.
   * This validates the request, routes to a model, and persists the job.
   */
  async createJob(request: GenerationRequest): Promise<GenerationJobRecord> {
    // 1. Validate request
    this.validateRequest(request);

    // 2. Route to model/provider
    const routing = modelRouter.findModel({
      type: request.mediaType as any,
      aspectRatio: request.aspectRatio,
      requiresAudio: request.requiresAudio,
      maxCost: request.maxCost,
      preferredProvider: request.preferredProvider,
    });

    if (!routing) {
      throw new GenerationError(
        'ROUTING_FAILED',
        `No model found for request: type=${request.mediaType}, aspect=${request.aspectRatio}, audio=${request.requiresAudio}`,
      );
    }

    // 3. Create job record
    const jobId = crypto.randomUUID();
    const now = new Date();

    const job: GenerationJobRecord = {
      id: jobId,
      orgId: request.orgId,
      providerId: routing.providerId,
      modelId: routing.model.id,
      kind: request.mediaType,
      status: 'planned',
      input: request,
      creditsReserved: 0,
      creditsCharged: 0,
      estimatedCost: undefined,
      actualCost: undefined,
      costCurrency: 'USD',
      attempts: 0,
      maxAttempts: this.options.defaultMaxAttempts,
      processingVersion: request.generationVersion ?? this.options.defaultGenerationVersion,
      createdAt: now,
      updatedAt: now,
    };

    // 4. Persist to database
    await db.insert(generationJobSchema).values({
      id: job.id,
      orgId: job.orgId,
      providerId: job.providerId,
      modelId: job.modelId,
      kind: job.kind,
      status: job.status,
      input: job.input as any,
      creditsReserved: job.creditsReserved,
      creditsCharged: job.creditsCharged,
      estimatedCost: job.estimatedCost,
      actualCost: job.actualCost,
      costCurrency: job.costCurrency,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      processingVersion: job.processingVersion,
      mediaAssetId: job.mediaAssetId,
      webhookReceivedAt: job.webhookReceivedAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      durationMs: job.durationMs,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });

    return job;
  }

  /**
   * Submit a job to the provider.
   * Transitions: planned/queued → submitting → submitted
   */
  async submitJob(jobId: string): Promise<GenerationJobRecord> {
    const job = await this.getJob(jobId);
    if (!job) throw new GenerationError('DATABASE_ERROR', `Job not found: ${jobId}`);

    // Validate state transition
    if (!isValidTransition(job.status, 'submitting')) {
      throw new GenerationError(
        'VALIDATION_ERROR',
        `Cannot submit job in status '${job.status}'`,
      );
    }

    // Update status to submitting
    await this.updateJobStatus(job.id, 'submitting');
    job.status = 'submitting';
    job.startedAt = new Date();
    job.attempts += 1;

    try {
      // Get provider adapter
      const provider = providerRegistry.getProvider(job.providerId);
      if (!provider) {
        throw new GenerationError(
          'ROUTING_FAILED',
          `Provider not found: ${job.providerId}`,
        );
      }

      // Create attempt record
      const attempt = await this.createAttempt(job);

      // Build provider-specific request
      const providerRequest = this.buildProviderRequest(job.input, job.modelId);

      // Submit to provider
      const submission = await provider.submitJob(providerRequest);

      // Update attempt with external job ID
      await this.updateAttempt(attempt.id, {
        status: 'submitted',
        externalJobId: submission.providerJobId,
      });

      // Update job
      await this.updateJob(job.id, {
        status: 'submitted',
        externalJobId: submission.providerJobId,
        externalStatus: submission.status,
      });

      job.status = 'submitted';
      job.externalJobId = submission.providerJobId;

      return job;
    } catch (error) {
      // Handle submission failure
      const errorCode = this.classifyError(error);
      await this.handleJobFailure(job, errorCode, error);
      throw error;
    }
  }

  /**
   * Process a completed job result.
   * Creates the MediaAsset and transitions to 'ready'.
   */
  async processResult(jobId: string, output: GenerationJobOutput): Promise<GenerationJobRecord> {
    const job = await this.getJob(jobId);
    if (!job) throw new GenerationError('DATABASE_ERROR', `Job not found: ${jobId}`);

    // Validate state
    if (!isValidTransition(job.status, 'completed')) {
      throw new GenerationError(
        'VALIDATION_ERROR',
        `Cannot process result for job in status '${job.status}'`,
      );
    }

    // Update job to completed
    await this.updateJob(job.id, {
      status: 'completed',
      output,
      completedAt: new Date(),
      durationMs: job.startedAt ? Date.now() - job.startedAt.getTime() : undefined,
    });

    // Create MediaAsset
    const mediaAssetId = await this.createMediaAsset(job, output);

    // Transition to ready
    await this.updateJob(job.id, {
      status: 'ready',
      mediaAssetId,
    });

    job.status = 'ready';
    job.output = output;
    job.mediaAssetId = mediaAssetId;

    return job;
  }

  /**
   * Handle a failed job. Determines if retry is possible.
   */
  async handleJobFailure(
    job: GenerationJobRecord,
    errorCode: GenerationErrorCode,
    error: unknown,
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Update job as failed
    await this.updateJob(job.id, {
      status: 'failed',
      errorMessage,
      errorCode,
      completedAt: new Date(),
      durationMs: job.startedAt ? Date.now() - job.startedAt.getTime() : undefined,
    });

    // Determine if we should retry
    if (
      this.options.enableRetry &&
      isRetryableError(errorCode) &&
      job.attempts < job.maxAttempts
    ) {
      // Calculate backoff
      const backoffMs = Math.min(
        this.options.retryBackoffBaseMs * Math.pow(2, job.attempts - 1),
        this.options.retryBackoffMaxMs,
      );

      // Re-queue for retry
      await this.updateJob(job.id, {
        status: 'queued',
        nextAttemptAt: new Date(Date.now() + backoffMs),
      });
    }
  }

  /**
   * Retry a failed job by re-queuing it.
   */
  async retryJob(jobId: string): Promise<GenerationJobRecord> {
    const job = await this.getJob(jobId);
    if (!job) throw new GenerationError('DATABASE_ERROR', `Job not found: ${jobId}`);

    if (!isValidTransition(job.status, 'queued')) {
      throw new GenerationError(
        'VALIDATION_ERROR',
        `Cannot retry job in status '${job.status}'`,
      );
    }

    await this.updateJob(job.id, {
      status: 'queued',
      nextAttemptAt: new Date(),
    });

    job.status = 'queued';
    return job;
  }

  /**
   * Cancel a generation job.
   */
  async cancelJob(jobId: string): Promise<GenerationJobRecord> {
    const job = await this.getJob(jobId);
    if (!job) throw new GenerationError('DATABASE_ERROR', `Job not found: ${jobId}`);

    if (!isValidTransition(job.status, 'cancelled')) {
      throw new GenerationError(
        'VALIDATION_ERROR',
        `Cannot cancel job in status '${job.status}'`,
      );
    }

    // Try to cancel with provider
    if (job.externalJobId) {
      try {
        const provider = providerRegistry.getProvider(job.providerId);
        if (provider) {
          await provider.cancelJob(job.externalJobId, job.modelId);
        }
      } catch {
        // Best effort — provider may not support cancellation
      }
    }

    await this.updateJob(job.id, { status: 'cancelled' });
    job.status = 'cancelled';

    return job;
  }

  /**
   * Get a generation job by ID.
   */
  async getJob(jobId: string): Promise<GenerationJobRecord | null> {
    const rows = await db
      .select()
      .from(generationJobSchema)
      .where(eq(generationJobSchema.id, jobId))
      .limit(1);

    if (rows.length === 0) return null;

    return this.mapJobRow(rows[0]);
  }

  /**
   * Get all jobs for an organization.
   */
  async getJobsByOrg(orgId: string, limit = 50): Promise<GenerationJobRecord[]> {
    const rows = await db
      .select()
      .from(generationJobSchema)
      .where(eq(generationJobSchema.orgId, orgId))
      .orderBy(generationJobSchema.createdAt)
      .limit(limit);

    return rows.map(this.mapJobRow);
  }

  /**
   * Get pending jobs that are ready to be processed.
   */
  async getPendingJobs(limit = 10): Promise<GenerationJobRecord[]> {
    const now = new Date();

    const rows = await db
      .select()
      .from(generationJobSchema)
      .where(
        and(
          eq(generationJobSchema.status, 'queued'),
          lte(generationJobSchema.nextAttemptAt, now),
        ),
      )
      .orderBy(asc(generationJobSchema.nextAttemptAt))
      .limit(limit);

    return rows.map(this.mapJobRow);
  }

  /**
   * Process a webhook event from a provider.
   */
  async processWebhook(event: WebhookEvent): Promise<GenerationJobRecord | null> {
    // Find the job by external job ID
    const rows = await db
      .select()
      .from(generationJobSchema)
      .where(eq(generationJobSchema.externalJobId, event.providerJobId))
      .limit(1);

    if (rows.length === 0) {
      return null; // Unknown job — may be stale webhook
    }

    const job = this.mapJobRow(rows[0]);

    // Deduplicate: if already completed, skip
    if (job.status === 'completed' || job.status === 'ready') {
      return job;
    }

    // Update webhook timestamp
    await this.updateJob(job.id, {
      webhookReceivedAt: new Date(),
    });

    // Handle based on event type
    switch (event.eventType) {
      case 'completed': {
        // Process the result
        const output = this.extractOutputFromPayload(event.payload ?? {});
        return this.processResult(job.id, output);
      }

      case 'failed': {
        const errorCode = this.classifyError(event.payload);
        await this.handleJobFailure(job, errorCode, event.payload);
        return this.getJob(job.id);
      }

      case 'cancelled': {
        await this.updateJob(job.id, { status: 'cancelled' });
        return this.getJob(job.id);
      }

      default:
        // Status change — update external status
        if (event.providerStatus) {
          await this.updateJob(job.id, {
            externalStatus: event.providerStatus,
          });
        }
        return job;
    }
  }

  /**
   * Poll for job status from the provider.
   */
  async pollJobStatus(jobId: string): Promise<GenerationJobRecord | null> {
    const job = await this.getJob(jobId);
    if (!job) return null;

    // Only poll jobs that are submitted or processing
    if (job.status !== 'submitted' && job.status !== 'processing') {
      return job;
    }

    if (!job.externalJobId) return job;

    try {
      const provider = providerRegistry.getProvider(job.providerId);
      if (!provider) return job;

      const status = await provider.getJobStatus(job.externalJobId, job.modelId);

      // Update external status
      await this.updateJob(job.id, {
        externalStatus: status.providerStatus,
      });

      // Handle status change
      if (status.status === 'completed') {
        // Get the result
        const result = await provider.getJobResult(job.externalJobId, job.modelId);
        const output = this.extractOutputFromResult(result);
        return this.processResult(job.id, output);
      }

      if (status.status === 'failed') {
        const errorCode = this.classifyError(status.error);
        await this.handleJobFailure(job, errorCode, status.error);
        return this.getJob(job.id);
      }

      return job;
    } catch (error) {
      // Polling failed — don't fail the job, just return current state
      return job;
    }
  }

  // ─── Private Methods ───────────────────────────────────────────────────

  /**
   * Validate a generation request.
   */
  private validateRequest(request: GenerationRequest): void {
    if (!request.orgId) {
      throw new GenerationError('VALIDATION_ERROR', 'orgId is required');
    }
    if (!request.mediaType) {
      throw new GenerationError('VALIDATION_ERROR', 'mediaType is required');
    }
    if (!request.prompt && !request.imageUrl) {
      throw new GenerationError('VALIDATION_ERROR', 'prompt or imageUrl is required');
    }

    // Validate media type
    const validTypes = ['image', 'video', 'audio', 'text'];
    if (!validTypes.includes(request.mediaType)) {
      throw new GenerationError(
        'VALIDATION_ERROR',
        `Invalid mediaType: ${request.mediaType}. Must be one of: ${validTypes.join(', ')}`,
      );
    }

    // Validate aspect ratio if provided
    if (request.aspectRatio) {
      const validRatios = ['1:1', '9:16', '16:9', '4:5'];
      if (!validRatios.includes(request.aspectRatio)) {
        throw new GenerationError(
          'VALIDATION_ERROR',
          `Invalid aspectRatio: ${request.aspectRatio}. Must be one of: ${validRatios.join(', ')}`,
        );
      }
    }

    // Validate duration for video
    if (request.mediaType === 'video' && request.duration !== undefined) {
      if (request.duration <= 0 || request.duration > 60) {
        throw new GenerationError(
          'VALIDATION_ERROR',
          `Invalid duration: ${request.duration}. Must be between 0 and 60 seconds.`,
        );
      }
    }
  }

  /**
   * Build a provider-specific request from a generic request.
   */
  private buildProviderRequest(
    request: GenerationRequest,
    modelId: string,
  ): ProviderGenerationRequest {
    return {
      orgId: request.orgId,
      modelId,
      kind: request.mediaType as any,
      input: {
        prompt: request.prompt,
        negativePrompt: request.negativePrompt,
        imageUrl: request.imageUrl,
        imageUrls: request.imageUrls,
        audioUrl: request.audioUrl,
        aspectRatio: request.aspectRatio,
        duration: request.duration,
        width: request.width,
        height: request.height,
        seed: request.seed,
        stylePreset: request.stylePreset,
        ...request.providerOptions,
      },
      webhookUrl: request.webhookUrl,
    };
  }

  /**
   * Create a generation attempt record.
   */
  private async createAttempt(
    job: GenerationJobRecord,
  ): Promise<GenerationAttemptRecord> {
    const attemptId = crypto.randomUUID();
    const now = new Date();

    const attempt: GenerationAttemptRecord = {
      id: attemptId,
      jobId: job.id,
      attemptNumber: job.attempts,
      providerId: job.providerId,
      modelId: job.modelId,
      status: 'pending',
      input: job.input as any,
      creditsCharged: 0,
      createdAt: now,
    };

    await db.insert(generationAttemptSchema).values({
      id: attempt.id,
      jobId: attempt.jobId,
      attemptNumber: attempt.attemptNumber,
      providerId: attempt.providerId,
      modelId: attempt.modelId,
      status: attempt.status,
      input: attempt.input as any,
      creditsCharged: attempt.creditsCharged,
      createdAt: attempt.createdAt,
    });

    return attempt;
  }

  /**
   * Update a generation attempt.
   */
  private async updateAttempt(
    attemptId: string,
    updates: Partial<GenerationAttemptRecord>,
  ): Promise<void> {
    await db
      .update(generationAttemptSchema)
      .set({
        ...updates,
        completedAt: updates.status === 'completed' || updates.status === 'failed'
          ? new Date()
          : undefined,
      })
      .where(eq(generationAttemptSchema.id, attemptId));
  }

  /**
   * Update a generation job.
   */
  private async updateJob(
    jobId: string,
    updates: Partial<GenerationJobRecord>,
  ): Promise<void> {
    await db
      .update(generationJobSchema)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(generationJobSchema.id, jobId));
  }

  /**
   * Update job status with transition validation.
   */
  private async updateJobStatus(
    jobId: string,
    newStatus: GenerationJobStatus,
  ): Promise<void> {
    const job = await this.getJob(jobId);
    if (!job) throw new GenerationError('DATABASE_ERROR', `Job not found: ${jobId}`);

    if (!isValidTransition(job.status, newStatus)) {
      throw new GenerationError(
        'VALIDATION_ERROR',
        `Invalid transition: ${job.status} → ${newStatus}`,
      );
    }

    await this.updateJob(jobId, { status: newStatus });
  }

  /**
   * Create a MediaAsset from a generation result.
   */
  private async createMediaAsset(
    job: GenerationJobRecord,
    output: GenerationJobOutput,
  ): Promise<string> {
    const assetId = crypto.randomUUID();
    const now = new Date();

    await db.insert(mediaAssetSchema).values({
      id: assetId,
      orgId: job.orgId,
      status: 'pending_review',  // Phase 4 will validate
      originType: 'generated',
      assetType: output.assetType ?? 'unknown',
      url: output.urls[0] ?? '',
      mimeType: output.mimeType,
      width: output.width,
      height: output.height,
      durationSeconds: output.durationSeconds,
      fileSize: output.fileSize,
      hasAudio: output.hasAudio ?? false,
      audioStatus: output.hasAudio ? 'unknown' : 'no_audio',
      audioDurationMs: output.audio?.durationMs,
      audioCodec: output.audio?.codec,
      audioSampleRate: output.audio?.sampleRate,
      audioChannels: output.audio?.channels,
      audioLoudnessLufs: output.audio?.loudnessLufs,
      audioSource: output.audio?.source,
      generationJobId: job.id,
      generationVersion: job.processingVersion,
      cloudinaryPublicId: output.cloudinaryPublicId,
      metadata: {
        providerMetadata: output.providerMetadata,
        generationVersion: job.processingVersion,
      },
      createdAt: now,
      updatedAt: now,
    });

    return assetId;
  }

  /**
   * Extract output from a provider result.
   */
  private extractOutputFromResult(result: any): GenerationJobOutput {
    return {
      urls: result.urls ?? [],
      assetType: result.metadata?.assetType ?? 'unknown',
      mimeType: result.metadata?.mimeType,
      width: result.metadata?.width,
      height: result.metadata?.height,
      durationSeconds: result.metadata?.durationSeconds,
      fileSize: result.metadata?.fileSize,
      hasAudio: result.metadata?.hasAudio,
      audio: result.metadata?.audio,
      cloudinaryPublicId: result.metadata?.cloudinaryPublicId,
      providerMetadata: result.metadata?.providerMetadata,
    };
  }

  /**
   * Extract output from a provider payload.
   */
  private extractOutputFromPayload(payload: Record<string, unknown>): GenerationJobOutput {
    const urls: string[] = [];

    // Try to extract URLs from common patterns
    if (typeof payload.url === 'string') urls.push(payload.url);
    if (typeof payload.videoUrl === 'string') urls.push(payload.videoUrl);
    if (typeof payload.audioUrl === 'string') urls.push(payload.audioUrl);
    if (Array.isArray(payload.imageUrls)) urls.push(...payload.imageUrls);

    return {
      urls,
      assetType: (payload.assetType as string) ?? 'unknown',
      mimeType: payload.mimeType as string,
      width: payload.width as number,
      height: payload.height as number,
      durationSeconds: payload.durationSeconds as number,
      fileSize: payload.fileSize as number,
      hasAudio: payload.hasAudio as boolean,
      audio: payload.audio as GenerationJobAudioOutput,
      cloudinaryPublicId: payload.cloudinaryPublicId as string,
      providerMetadata: payload.providerMetadata as Record<string, unknown>,
    };
  }

  /**
   * Classify an error into a generation error code.
   */
  private classifyError(error: unknown): GenerationErrorCode {
    if (error instanceof GenerationError) {
      return error.code;
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (message.includes('timeout')) return 'PROVIDER_TIMEOUT';
      if (message.includes('rate limit')) return 'PROVIDER_RATE_LIMITED';
      if (message.includes('auth') || message.includes('unauthorized')) return 'PROVIDER_AUTH_ERROR';
      if (message.includes('quota') || message.includes('limit exceeded')) return 'PROVIDER_QUOTA_EXCEEDED';
      if (message.includes('content policy') || message.includes('rejected')) return 'CONTENT_POLICY_VIOLATION';
      if (message.includes('storage') || message.includes('upload')) return 'STORAGE_FAILED';
      if (message.includes('database') || message.includes('db')) return 'DATABASE_ERROR';
    }

    return 'UNKNOWN_ERROR';
  }

  /**
   * Map a database row to a GenerationJobRecord.
   */
  private mapJobRow(row: any): GenerationJobRecord {
    return {
      id: row.id,
      orgId: row.orgId,
      providerId: row.providerId,
      modelId: row.modelId,
      kind: row.kind,
      status: row.status as GenerationJobStatus,
      input: row.input as GenerationRequest,
      output: row.output as GenerationJobOutput | undefined,
      externalJobId: row.externalJobId,
      externalStatus: row.externalStatus,
      creditsReserved: row.creditsReserved ?? 0,
      creditsCharged: row.creditsCharged ?? 0,
      estimatedCost: row.estimatedCost,
      actualCost: row.actualCost,
      costCurrency: row.costCurrency ?? 'USD',
      errorMessage: row.errorMessage,
      errorCode: row.errorCode,
      attempts: row.attempts ?? 0,
      maxAttempts: row.maxAttempts ?? this.options.defaultMaxAttempts,
      nextAttemptAt: row.nextAttemptAt,
      processingVersion: row.processingVersion,
      mediaAssetId: row.mediaAssetId,
      webhookReceivedAt: row.webhookReceivedAt,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      durationMs: row.durationMs,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

// ─── Error Class ────────────────────────────────────────────────────────────

/**
 * Error class for generation failures.
 */
export class GenerationError extends Error {
  constructor(
    public readonly code: GenerationErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'GenerationError';
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let instance: GenerationFactory | null = null;

/**
 * Get the singleton GenerationFactory instance.
 */
export function getFactory(options?: GenerationFactoryOptions): GenerationFactory {
  if (!instance) {
    instance = new GenerationFactory(options);
  }
  return instance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetFactory(): void {
  instance = null;
}
