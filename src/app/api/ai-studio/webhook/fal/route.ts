import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { eq } from 'drizzle-orm';

import { getDb } from '@/libs/DB';
import { aiStudioJobSchema } from '@/models/Schema';
import { commitCredits, refundCredits, saveMediaAsset } from '@/lib/ai-studio/server';
import { extractMediaFromFalPayload, submitFalJob, verifyFalWebhook, type FalWebhookPayload } from '@/lib/ai-studio/fal';
import { buildFalInput, buildWebhookUrl } from '@/lib/ai-studio/job-helpers';
import { storeImageRender, storeVideoRender } from '@/lib/ai-studio/cloudinary';
import { getModel, estimateCredits } from '@/lib/ai-studio/models';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Fal.ai webhook receiver.
 *
 * Fal delivers `payload.status = 'OK' | 'ERROR'` here. On OK we upload the
 * output to Cloudinary, save a media_asset, commit reserved credits, and
 * flip the job to `succeeded`. On ERROR we refund and flip to `failed`.
 *
 * Signature verification uses Fal's published JWKS (Ed25519). The canonical
 * message is `request_id + user_id + timestamp + sha256(body)`. Verification
 * can be soft-disabled in local dev by setting `FAL_WEBHOOK_INSECURE=1`.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const insecure = process.env.FAL_WEBHOOK_INSECURE === '1';

  if (!insecure) {
    const ok = await verifyFalWebhook(
      {
        requestId: request.headers.get('x-fal-webhook-request-id'),
        userId: request.headers.get('x-fal-webhook-user-id'),
        timestamp: request.headers.get('x-fal-webhook-timestamp'),
        signature: request.headers.get('x-fal-webhook-signature'),
      },
      rawBody,
    );
    if (!ok) {
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
    }
  }

  let payload: FalWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as FalWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const requestId = payload.request_id || payload.gateway_request_id;
  if (!requestId) {
    return NextResponse.json({ error: 'missing request_id' }, { status: 400 });
  }

  const db = await getDb();
  const [job] = await db
    .select()
    .from(aiStudioJobSchema)
    .where(eq(aiStudioJobSchema.falRequestId, requestId))
    .limit(1);

  if (!job) {
    // Idempotent: no matching job means we already reconciled it or the
    // request id is stale. Nothing to do.
    return NextResponse.json({ ok: true, matched: false });
  }
  if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'canceled' || job.status === 'refunded') {
    return NextResponse.json({ ok: true, alreadyFinal: true });
  }

  const now = new Date();
  await db
    .update(aiStudioJobSchema)
    .set({ webhookReceivedAt: now, status: 'processing' })
    .where(eq(aiStudioJobSchema.id, job.id));

  if (payload.status !== 'OK') {
    await refundCredits(job.orgId, job.id, job.creditsReserved, payload.error || 'Fal returned error');
    await db
      .update(aiStudioJobSchema)
      .set({ status: 'failed', errorMessage: payload.error || 'Fal returned error' })
      .where(eq(aiStudioJobSchema.id, job.id));
    return NextResponse.json({ ok: true, failed: true });
  }

  const input = (job.input ?? {}) as Record<string, unknown>;
  const chain = Array.isArray(input.chain) ? (input.chain as string[]) : [];
  const media = extractMediaFromFalPayload(payload.payload);

  try {
    // Chained Talking Head: first hop landed. Kick lipsync as second hop.
    if (chain[0] === 'i2v' && chain[1] === 'lipsync' && media.videoUrl) {
      const lipsyncModelId = String(input.lipsyncModelId || 'veed-lipsync');
      const lipsyncModel = getModel(lipsyncModelId);
      if (!lipsyncModel) throw new Error(`Missing lipsync model: ${lipsyncModelId}`);

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

      // Reserve the additional lipsync credits (i2v credits stay reserved).
      // But the initial reservation already included both hops, so we skip
      // additional reserve here and just move fal_request_id + advance chain.
      await db
        .update(aiStudioJobSchema)
        .set({
          falRequestId: submitted.request_id,
          status: 'queued',
          modelId: lipsyncModel.id,
          input: { ...input, chain: chain.slice(1), i2vVideoUrl: media.videoUrl },
        })
        .where(eq(aiStudioJobSchema.id, job.id));
      return NextResponse.json({ ok: true, chained: true });
    }

    const isVideo = job.kind === 'video' || job.kind === 'video-lipsync';
    const sourceUrl = isVideo ? media.videoUrl : media.imageUrl;
    if (!sourceUrl) throw new Error('Fal payload had no media url');

    const publicId = `ai-studio_${job.id}`;
    const context = {
      jobId: job.id,
      orgId: job.orgId,
      modelId: job.modelId,
      prompt: String((input as { prompt?: string }).prompt || '').slice(0, 200),
      source: 'ai-studio',
    };

    const stored = isVideo
      ? await storeVideoRender(sourceUrl, publicId, context)
      : await storeImageRender(sourceUrl, publicId, context);

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

    return NextResponse.json({ ok: true });
  } catch (err) {
    // If we couldn't finish reconciliation, refund and mark failed.
    await refundCredits(job.orgId, job.id, job.creditsReserved, err instanceof Error ? err.message : 'reconcile failed');
    await db
      .update(aiStudioJobSchema)
      .set({ status: 'failed', errorMessage: err instanceof Error ? err.message : String(err) })
      .where(eq(aiStudioJobSchema.id, job.id));
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'reconcile failed' }, { status: 500 });
  }
}
