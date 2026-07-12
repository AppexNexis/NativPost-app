// Retry a failed/canceled AI Studio job. Clones the original job's input
// into a new row, reserves fresh credits, and submits a new Fal request.
// The original row is left untouched so its error message stays visible.
//
// Content-policy failures from OpenAI's moderator are stochastic, so a
// plain retry with the same prompt+image often succeeds. Users can also
// use this to re-run a canceled or Fal-rejected job without rebuilding
// the composer from scratch.

import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { submitFalJob } from '@/lib/ai-studio/fal';
import { buildFalInput, buildWebhookUrl } from '@/lib/ai-studio/job-helpers';
import { estimateCredits, getModel } from '@/lib/ai-studio/models';
import {
  InsufficientCreditsError,
  refundCredits,
  reserveCredits,
} from '@/lib/ai-studio/server';
import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { aiStudioJobSchema } from '@/models/Schema';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error, orgId, userId } = await getAuthContext();
  if (error) {
    return error;
  }

  const { id } = await params;
  const db = await getDb();
  const [original] = await db
    .select()
    .from(aiStudioJobSchema)
    .where(and(eq(aiStudioJobSchema.id, id), eq(aiStudioJobSchema.orgId, orgId!)))
    .limit(1);

  if (!original) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  // Only retry terminal-failure states. Succeeded/in-flight jobs don't get
  // retried; users can cancel + retry if they want to re-run an in-flight one.
  const retryableStatuses = new Set(['failed', 'canceled', 'refunded']);
  if (!retryableStatuses.has(original.status)) {
    return NextResponse.json(
      { error: `Cannot retry a ${original.status} job`, status: original.status },
      { status: 409 },
    );
  }

  const model = getModel(original.modelId);
  if (!model) {
    return NextResponse.json({ error: `Unknown model: ${original.modelId}` }, { status: 400 });
  }

  const input = (original.input ?? {}) as Record<string, unknown>;
  const prompt = typeof input.prompt === 'string' ? input.prompt : undefined;
  const aspect = typeof input.aspect === 'string' ? input.aspect : '9:16';
  const seconds = typeof input.seconds === 'number' ? input.seconds : undefined;
  const audioUrl = typeof input.audioUrl === 'string' ? input.audioUrl : undefined;
  // Different submit routes stash the source image under different keys.
  // Chained lipsync stage uses i2vVideoUrl as the video source.
  const imageUrl = (typeof input.i2vVideoUrl === 'string' && input.i2vVideoUrl)
    || (typeof input.videoUrl === 'string' && input.videoUrl)
    || (typeof input.referenceImageUrl === 'string' && input.referenceImageUrl)
    || (typeof input.imageUrl === 'string' && input.imageUrl)
    || undefined;

  const credits = estimateCredits(model, { seconds });

  const [job] = await db
    .insert(aiStudioJobSchema)
    .values({
      orgId: orgId!,
      userId: userId ?? null,
      modelId: original.modelId,
      kind: original.kind,
      status: 'reserved',
      creditsReserved: credits,
      input: { ...input, retryOf: original.id },
    })
    .returning();
  if (!job) {
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
  }

  try {
    await reserveCredits(orgId!, job.id, credits);
  } catch (err) {
    await db.delete(aiStudioJobSchema).where(eq(aiStudioJobSchema.id, job.id));
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json(
        { error: 'Insufficient AI credits', code: 'INSUFFICIENT_CREDITS' },
        { status: 402 },
      );
    }
    throw err;
  }

  try {
    const falInput = buildFalInput(model, {
      prompt,
      imageUrl: imageUrl || undefined,
      audioUrl,
      seconds,
      aspect,
    });
    const submitted = await submitFalJob({
      falModel: model.falModel,
      input: falInput,
      webhookUrl: buildWebhookUrl(),
    });
    await db
      .update(aiStudioJobSchema)
      .set({ status: 'queued', falRequestId: submitted.request_id })
      .where(eq(aiStudioJobSchema.id, job.id));

    const res = NextResponse.json({ jobId: job.id, status: 'queued' });
    res.headers.set('Cache-Control', 'no-store');
    return res;
  } catch (err) {
    await refundCredits(orgId!, job.id, credits, 'Fal submit failed');
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(aiStudioJobSchema)
      .set({ status: 'failed', errorMessage: message })
      .where(eq(aiStudioJobSchema.id, job.id));
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
