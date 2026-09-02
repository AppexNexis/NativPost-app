// Content Intelligence Engine — Fal.ai Provider Adapter
// Phase 2: Wraps existing Fal.ai REST client into the Provider interface
//
// This adapter does NOT replace the existing fal.ts — it wraps it.
// The existing code continues to work unchanged.
// New Content Intelligence Engine code uses this adapter instead.

import {
  submitFalJob,
  getFalStatus,
  getFalResult,
  cancelFalJob,
  extractMediaFromFalPayload,
  type FalSubmitResult,
} from '@/lib/ai-studio/fal';
import { buildFalInput } from '@/lib/ai-studio/job-helpers';
import { getModel } from '@/lib/ai-studio/models';
import type {
  Provider,
  ProviderCapability,
  GenerationRequest,
  JobSubmission,
  JobStatus,
  JobResult,
  JobStatusType,
  JobResultMetadata,
} from './types';

// ─── Fal Provider Adapter ───────────────────────────────────────────────────

/**
 * FalAdapter implements the Provider interface for Fal.ai.
 *
 * It delegates to the existing Fal REST wrapper functions,
 * translating between the Content Intelligence Engine types
 * and Fal's API shape.
 */
export class FalAdapter implements Provider {
  readonly id = 'fal';
  readonly name = 'Fal.ai';
  readonly type = 'media_generation' as ProviderCapability;
  readonly config = {
    envVar: 'FAL_KEY',
    baseUrl: 'https://queue.fal.run',
  };
  readonly isActive = true;
  readonly priority = 10;

  async submitJob(request: GenerationRequest): Promise<JobSubmission> {
    const { modelId, input, webhookUrl } = request;

    // Get the AI Studio model object for buildFalInput
    const aiStudioModel = getModel(modelId);
    if (!aiStudioModel) {
      throw new Error(`Unknown model: ${modelId}`);
    }

    // Build Fal-specific input payload using existing helper
    const falInput = buildFalInput(aiStudioModel, {
      prompt: input.prompt,
      imageUrl: input.imageUrl,
      imageUrls: input.imageUrls,
      audioUrl: input.audioUrl,
      seconds: input.duration,
      aspect: input.aspectRatio ?? '9:16',
      seed: input.seed as number | undefined,
    });

    // Submit via existing Fal wrapper
    const result: FalSubmitResult = await submitFalJob({
      falModel: this.getFalModelId(modelId),
      input: falInput,
      webhookUrl: webhookUrl ?? '',
    });

    return {
      providerJobId: result.request_id,
      status: 'queued',
      statusUrl: result.status_url,
      resultUrl: result.response_url,
      cancelUrl: result.cancel_url,
    };
  }

  async getJobStatus(
    jobId: string,
    providerModelId: string,
  ): Promise<JobStatus> {
    const falModel = this.getFalModelId(providerModelId);
    const status = await getFalStatus(falModel, jobId);

    return {
      status: this.mapStatus(status.status),
      providerStatus: status.status,
      queuePosition: status.queue_position,
      logs: status.logs,
    };
  }

  async getJobResult(
    jobId: string,
    providerModelId: string,
  ): Promise<JobResult> {
    const falModel = this.getFalModelId(providerModelId);
    const rawResult = await getFalResult(falModel, jobId);

    // Extract media URLs using existing helper
    const media = extractMediaFromFalPayload(rawResult as Record<string, unknown>);

    const urls: string[] = [];
    const metadata: JobResultMetadata = {
      assetType: 'unknown',
    };

    if (media.imageUrl) {
      urls.push(media.imageUrl);
      if (media.imageUrls && media.imageUrls.length > 1) {
        urls.push(...media.imageUrls.slice(1));
      }
      metadata.assetType = 'image';
      metadata.width = media.width;
      metadata.height = media.height;
    }

    if (media.videoUrl) {
      urls.push(media.videoUrl);
      metadata.assetType = 'video';
      metadata.durationSeconds = media.durationSec;
    }

    if (media.audioUrl) {
      urls.push(media.audioUrl);
      metadata.assetType = 'audio';
    }

    return {
      urls,
      metadata,
      rawOutput: rawResult,
    };
  }

  async cancelJob(jobId: string, providerModelId: string): Promise<void> {
    const falModel = this.getFalModelId(providerModelId);
    await cancelFalJob(falModel, jobId);
  }

  async verifyWebhook(
    signature: string,
    body: string,
    timestamp?: string,
  ): Promise<boolean> {
    // Delegate to existing webhook verification
    try {
      const { verifyFalWebhook } = await import('@/lib/ai-studio/fal');
      return verifyFalWebhook(
        {
          requestId: '',
          userId: '',
          timestamp: timestamp ?? '',
          signature,
        },
        body,
      );
    } catch {
      return false;
    }
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  /**
   * Map Fal status to our standard status type.
   */
  private mapStatus(falStatus: string): JobStatusType {
    switch (falStatus) {
      case 'IN_QUEUE':
        return 'queued';
      case 'IN_PROGRESS':
        return 'processing';
      case 'COMPLETED':
        return 'completed';
      case 'FAILED':
        return 'failed';
      default:
        return 'unknown';
    }
  }

  /**
   * Get the Fal model ID for a given model.
   * This maps our model IDs to Fal's internal model strings.
   */
  private getFalModelId(modelId: string): string {
    const model = getModel(modelId);
    if (!model?.falModel) {
      throw new Error(`No Fal model mapping for model ID: ${modelId}`);
    }
    return model.falModel;
  }
}
