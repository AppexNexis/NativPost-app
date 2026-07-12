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

export async function POST(request: NextRequest) {
  const { error, orgId, userId } = await getAuthContext();
  if (error) return error;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const modelId = String(body.modelId || 'pixverse-v6-i2v');
  const model = getModel(modelId);
  if (!model || model.kind !== 'video') {
    return NextResponse.json({ error: `Invalid video model: ${modelId}` }, { status: 400 });
  }

  const prompt = String(body.prompt || '').trim();
  const referenceImageUrl = String(body.imageUrl || body.referenceImageUrl || '').trim();
  if (!referenceImageUrl) {
    return NextResponse.json({ error: 'Reference image is required for image-to-video' }, { status: 400 });
  }

  const aspect = String(body.aspect || body.aspectRatio || '9:16');
  const seconds = Number(body.duration) || model.durations?.[0] || 5;
  if (!model.durations?.includes(seconds)) {
    return NextResponse.json({ error: `Duration ${seconds}s not supported by ${modelId}` }, { status: 400 });
  }

  const credits = estimateCredits(model, { seconds });
  const db = await getDb();

  const [job] = await db
    .insert(aiStudioJobSchema)
    .values({
      orgId: orgId!,
      userId: userId ?? null,
      modelId,
      kind: 'video',
      status: 'reserved',
      creditsReserved: credits,
      input: { prompt, aspect, referenceImageUrl, seconds },
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
    const input = buildFalInput(model, { prompt, imageUrl: referenceImageUrl, aspect, seconds });
    const submitted = await submitFalJob({
      falModel: model.falModel,
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
