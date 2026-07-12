import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import {
  InsufficientCreditsError,
  reserveCredits,
  refundCredits,
} from '@/lib/ai-studio/server';
import { submitFalJob } from '@/lib/ai-studio/fal';
import { buildFalInput, buildWebhookUrl } from '@/lib/ai-studio/job-helpers';
import { estimateCredits, getModel } from '@/lib/ai-studio/models';
import { getDb } from '@/libs/DB';
import { aiStudioJobSchema } from '@/models/Schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * Talking Head endpoint.
 *
 * Two shapes:
 *  1. `{ videoUrl, audioUrl }` direct lipsync. Fires veed/lipsync.
 *  2. `{ referenceImageUrl, audioUrl, i2vModelId }` chained: image to i2v
 *     via Seedance/Kling first, then lipsync when the i2v webhook returns.
 *
 * Chained mode stashes `chain=['i2v','lipsync']` in the job input so the
 * webhook route knows to enqueue the lipsync step after the i2v step lands.
 */
export async function POST(request: NextRequest) {
  const { error, orgId, userId } = await getAuthContext();
  if (error) return error;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const audioUrl = String(body.audioUrl || '').trim();
  if (!audioUrl) {
    return NextResponse.json({ error: 'audioUrl is required' }, { status: 400 });
  }

  const videoUrl = String(body.videoUrl || '').trim();
  const referenceImageUrl = String(body.referenceImageUrl || body.imageUrl || '').trim();

  if (!videoUrl && !referenceImageUrl) {
    return NextResponse.json({ error: 'videoUrl or referenceImageUrl is required' }, { status: 400 });
  }

  const lipsyncModel = getModel('veed-lipsync')!;
  const db = await getDb();

  // Direct lipsync path: just fire veed/lipsync with the provided video.
  if (videoUrl) {
    const credits = estimateCredits(lipsyncModel);
    const [job] = await db
      .insert(aiStudioJobSchema)
      .values({
        orgId: orgId!,
        userId: userId ?? null,
        modelId: lipsyncModel.id,
        kind: 'video-lipsync',
        status: 'reserved',
        creditsReserved: credits,
        input: { videoUrl, audioUrl },
      })
      .returning();
    if (!job) return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });

    try {
      await reserveCredits(orgId!, job.id, credits);
    } catch (err) {
      await db.delete(aiStudioJobSchema).where(eq(aiStudioJobSchema.id, job.id));
      if (err instanceof InsufficientCreditsError) {
        return NextResponse.json({ error: 'Insufficient AI credits', code: 'INSUFFICIENT_CREDITS' }, { status: 402 });
      }
      throw err;
    }

    try {
      const input = buildFalInput(lipsyncModel, { imageUrl: videoUrl, audioUrl, aspect: '9:16' });
      const submitted = await submitFalJob({
        falModel: lipsyncModel.falModel,
        input,
        webhookUrl: buildWebhookUrl(),
      });
      await db
        .update(aiStudioJobSchema)
        .set({ status: 'queued', falRequestId: submitted.request_id })
        .where(eq(aiStudioJobSchema.id, job.id));
      return NextResponse.json({ jobId: job.id, status: 'queued' });
    } catch (err) {
      await refundCredits(orgId!, job.id, credits, 'Fal submit failed');
      await db
        .update(aiStudioJobSchema)
        .set({ status: 'failed', errorMessage: err instanceof Error ? err.message : String(err) })
        .where(eq(aiStudioJobSchema.id, job.id));
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Fal submit failed' }, { status: 502 });
    }
  }

  // Chained path: i2v first, then lipsync in the webhook step.
  const i2vModelId = String(body.i2vModelId || 'seedance-2-i2v');
  const i2vModel = getModel(i2vModelId);
  if (!i2vModel || i2vModel.kind !== 'video') {
    return NextResponse.json({ error: `Invalid i2v model: ${i2vModelId}` }, { status: 400 });
  }
  const seconds = Number(body.duration) || i2vModel.durations?.[0] || 5;
  if (!i2vModel.durations?.includes(seconds)) {
    return NextResponse.json({ error: `Duration ${seconds}s not supported by ${i2vModelId}` }, { status: 400 });
  }
  const aspect = String(body.aspect || body.aspectRatio || '9:16');
  const prompt = String(body.prompt || 'Talking head, natural motion').trim();

  const credits = estimateCredits(i2vModel, { seconds }) + estimateCredits(lipsyncModel);

  const [job] = await db
    .insert(aiStudioJobSchema)
    .values({
      orgId: orgId!,
      userId: userId ?? null,
      modelId: i2vModelId,
      kind: 'video-lipsync',
      status: 'reserved',
      creditsReserved: credits,
      input: {
        prompt,
        aspect,
        referenceImageUrl,
        audioUrl,
        seconds,
        chain: ['i2v', 'lipsync'],
        lipsyncModelId: lipsyncModel.id,
      },
    })
    .returning();
  if (!job) return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });

  try {
    await reserveCredits(orgId!, job.id, credits);
  } catch (err) {
    await db.delete(aiStudioJobSchema).where(eq(aiStudioJobSchema.id, job.id));
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json({ error: 'Insufficient AI credits', code: 'INSUFFICIENT_CREDITS' }, { status: 402 });
    }
    throw err;
  }

  try {
    const input = buildFalInput(i2vModel, { prompt, imageUrl: referenceImageUrl, aspect, seconds });
    const submitted = await submitFalJob({
      falModel: i2vModel.falModel,
      input,
      webhookUrl: buildWebhookUrl(),
    });
    await db
      .update(aiStudioJobSchema)
      .set({ status: 'queued', falRequestId: submitted.request_id })
      .where(eq(aiStudioJobSchema.id, job.id));
    return NextResponse.json({ jobId: job.id, status: 'queued' });
  } catch (err) {
    await refundCredits(orgId!, job.id, credits, 'Fal submit failed');
    await db
      .update(aiStudioJobSchema)
      .set({ status: 'failed', errorMessage: err instanceof Error ? err.message : String(err) })
      .where(eq(aiStudioJobSchema.id, job.id));
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fal submit failed' }, { status: 502 });
  }
}
