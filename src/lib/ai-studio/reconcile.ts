// Shared reconciliation for Fal jobs. Used by both the webhook route (push
// path) and the jobs/[id] GET route (poll fallback). Given a job row and a
// Fal payload, uploads the output to Cloudinary, saves a media_asset,
// commits reserved credits, and flips job status.

import type { InferSelectModel } from 'drizzle-orm';
import { eq } from 'drizzle-orm';

import { getDb } from '@/libs/DB';
import { aiStudioJobSchema } from '@/models/Schema';

import { storeImageRender, storeVideoRender } from './cloudinary';
import { extractMediaFromFalPayload, submitFalJob } from './fal';
import { buildFalInput, buildWebhookUrl } from './job-helpers';
import { estimateCredits, getModel } from './models';
import { commitCredits, refundCredits, saveMediaAsset } from './server';

type Job = InferSelectModel<typeof aiStudioJobSchema>;

export type ReconcileOutcome =
  | { status: 'succeeded' }
  | { status: 'failed'; reason: string }
  | { status: 'chained' }
  | { status: 'noop'; reason: string };

/**
 * Reconcile a Fal job from a payload. The payload shape matches what Fal
 * sends in webhooks and what getFalResult returns (both have `payload`
 * containing the model output).
 *
 * The caller is responsible for flipping the job status to `processing`
 * beforehand; this function only handles the terminal transitions.
 */
export async function reconcileFalJob(args: {
  job: Job;
  ok: boolean;
  error?: string;
  output?: Record<string, unknown>;
}): Promise<ReconcileOutcome> {
  const { job, ok, error, output } = args;
  const db = await getDb();

  if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'canceled' || job.status === 'refunded') {
    return { status: 'noop', reason: 'already final' };
  }

  if (!ok) {
    const reason = error || 'Fal returned error';
    await refundCredits(job.orgId, job.id, job.creditsReserved, reason);
    await db
      .update(aiStudioJobSchema)
      .set({ status: 'failed', errorMessage: reason })
      .where(eq(aiStudioJobSchema.id, job.id));
    return { status: 'failed', reason };
  }

  const input = (job.input ?? {}) as Record<string, unknown>;
  const chain = Array.isArray(input.chain) ? (input.chain as string[]) : [];
  const media = extractMediaFromFalPayload(output);

  try {
    // Chained Talking Head: first hop landed. Kick lipsync as second hop.
    if (chain[0] === 'i2v' && chain[1] === 'lipsync' && media.videoUrl) {
      const lipsyncModelId = String(input.lipsyncModelId || 'veed-lipsync');
      const lipsyncModel = getModel(lipsyncModelId);
      if (!lipsyncModel) {
        throw new Error(`Missing lipsync model: ${lipsyncModelId}`);
      }

      const nextInput = buildFalInput(lipsyncModel, {
        imageUrl: media.videoUrl,
        audioUrl: String(input.audioUrl || ''),
        aspect: String(input.aspect || '9:16'),
      });
      const submitted = await submitFalJob({
        falModel: lipsyncModel.falModel,
        input: nextInput,
        webhookUrl: buildWebhookUrl(),
      });

      await db
        .update(aiStudioJobSchema)
        .set({
          falRequestId: submitted.request_id,
          status: 'queued',
          modelId: lipsyncModel.id,
          input: { ...input, chain: chain.slice(1), i2vVideoUrl: media.videoUrl },
        })
        .where(eq(aiStudioJobSchema.id, job.id));
      return { status: 'chained' };
    }

    const isVideo = job.kind === 'video' || job.kind === 'video-lipsync';
    const sourceUrl = isVideo ? media.videoUrl : media.imageUrl;
    if (!sourceUrl) {
      throw new Error('Fal payload had no media url');
    }

    const publicId = `ai-studio_${job.id}`;
    const context = {
      jobId: job.id,
      orgId: job.orgId,
      modelId: job.modelId,
      prompt: String((input as { prompt?: string }).prompt || '').slice(0, 200),
      source: 'ai-studio',
    };

    const stored = isVideo
      ? await storeVideoRender(sourceUrl, publicId, context, job.orgId)
      : await storeImageRender(sourceUrl, publicId, context, job.orgId);

    const asset = await saveMediaAsset(job.orgId, {
      url: stored.url,
      thumbnailUrl: stored.thumbnailUrl,
      assetType: isVideo ? 'ai_video' : 'ai_image',
      aspectRatio: String((input as { aspect?: string }).aspect || '9:16'),
      source: 'ai-studio',
      description: String((input as { prompt?: string }).prompt || ''),
      aiMetadata: {
        jobId: job.id,
        modelId: job.modelId,
        model: getModel(job.modelId)?.label,
        prompt: (input as { prompt?: string }).prompt,
        cloudinaryPublicId: stored.publicId,
      },
      tags: ['ai-studio', job.modelId, isVideo ? 'ai-video' : 'ai-image'],
      durationSeconds: stored.durationSeconds ?? media.durationSec ?? null,
      width: stored.width,
      height: stored.height,
      mimeType: stored.mimeType,
    });

    const model = getModel(job.modelId);
    const commitAmount = model
      ? (input as { seconds?: number }).seconds && model.perSecond
          ? estimateCredits(model, { seconds: Number((input as { seconds?: number }).seconds) })
          : job.creditsReserved
      : job.creditsReserved;

    await commitCredits(job.orgId, job.id, commitAmount, `AI Studio: ${model?.label || job.modelId}`);

    await db
      .update(aiStudioJobSchema)
      .set({
        status: 'succeeded',
        output: {
          cloudinaryPublicId: stored.publicId,
          url: stored.url,
          thumbnailUrl: stored.thumbnailUrl,
          durationSec: stored.durationSeconds,
          width: stored.width,
          height: stored.height,
        },
        mediaAssetId: asset.id,
        creditsCharged: commitAmount,
      })
      .where(eq(aiStudioJobSchema.id, job.id));

    return { status: 'succeeded' };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'reconcile failed';
    await refundCredits(job.orgId, job.id, job.creditsReserved, reason);
    await db
      .update(aiStudioJobSchema)
      .set({ status: 'failed', errorMessage: reason })
      .where(eq(aiStudioJobSchema.id, job.id));
    return { status: 'failed', reason };
  }
}
