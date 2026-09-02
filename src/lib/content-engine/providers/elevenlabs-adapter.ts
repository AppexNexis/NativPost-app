// Content Intelligence Engine — ElevenLabs Provider Adapter
// Phase 2: Wraps existing ElevenLabs REST client into the Provider interface
//
// This adapter does NOT replace the existing elevenlabs.ts — it wraps it.
// The existing code continues to work unchanged.
// New Content Intelligence Engine code uses this adapter instead.

import { textToSpeech, type TtsResult } from '@/lib/ai-studio/elevenlabs';
import type {
  Provider,
  GenerationRequest,
  JobSubmission,
  JobStatus,
  JobResult,
} from './types';

// ─── ElevenLabs Provider Adapter ────────────────────────────────────────────

/**
 * ElevenLabsAdapter implements the Provider interface for ElevenLabs TTS.
 *
 * Unlike Fal.ai, ElevenLabs is synchronous — the API call blocks until
 * the audio is returned. This means:
 * - submitJob() returns immediately with status 'completed'
 * - getJobStatus() always returns 'completed'
 * - getJobResult() is not meaningful (result is in submitJob)
 *
 * The adapter handles this by returning the result inline.
 */
export class ElevenLabsAdapter implements Provider {
  readonly id = 'elevenlabs';
  readonly name = 'ElevenLabs';
  readonly type = 'audio' as const;
  readonly config = {
    envVar: 'ELEVENLABS_API_KEY',
    baseUrl: 'https://api.elevenlabs.io',
  };
  readonly isActive = true;
  readonly priority = 10;

  /** Cache of completed results (jobId -> result). */
  private results = new Map<string, JobResult>();

  async submitJob(request: GenerationRequest): Promise<JobSubmission> {
    const { input } = request;

    if (!input.prompt) {
      throw new Error('ElevenLabs TTS requires a text prompt');
    }

    // Call existing TTS function
    const ttsResult: TtsResult = await textToSpeech({
      text: input.prompt,
      voiceId: (input.voiceId as string) ?? 'default',
      modelId: (input.modelId as string) ?? 'eleven_multilingual_v2',
      orgId: request.orgId,
    });

    // Build result
    const result: JobResult = {
      urls: [ttsResult.audioUrl],
      metadata: {
        assetType: 'audio',
        mimeType: 'audio/mpeg',
        durationSeconds: ttsResult.durationSec ?? undefined,
        cloudinaryPublicId: ttsResult.cloudinaryPublicId,
      },
    };

    // Generate a synthetic job ID for this synchronous operation
    const syntheticJobId = `el-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Cache the result
    this.results.set(syntheticJobId, result);

    // ElevenLabs is synchronous — return completed immediately
    return {
      providerJobId: syntheticJobId,
      status: 'completed',
    };
  }

  async getJobStatus(jobId: string): Promise<JobStatus> {
    // ElevenLabs is synchronous — if we have the result, it's completed
    if (this.results.has(jobId)) {
      return { status: 'completed' };
    }
    return { status: 'unknown', error: 'Job not found' };
  }

  async getJobResult(jobId: string): Promise<JobResult> {
    const result = this.results.get(jobId);
    if (!result) {
      throw new Error(`Job ${jobId} not found`);
    }
    return result;
  }

  async cancelJob(): Promise<void> {
    // ElevenLabs is synchronous — nothing to cancel
  }
}
