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

  const modelId = String(body.modelId || 'flux-dev');
  const model = getModel(modelId);
  if (!model || model.kind !== 'image') {
    return NextResponse.json({ error: `Invalid image model: ${modelId}` }, { status: 400 });
  }

  const prompt = String(body.prompt || '').trim();
  if (!prompt) {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
  }

  const aspect = String(body.aspect || body.aspectRatio || '9:16');
  if (!model.aspects.includes(aspect as (typeof model.aspects)[number])) {
    return NextResponse.json({ error: `Aspect ${aspect} not supported by ${modelId}` }, { status: 400 });
  }

  const rawReferences = Array.isArray(body.references) ? body.references : [];
  const references = rawReferences
    .map(r => String(r || '').trim())
    .filter(r => r.length > 0)
    .slice(0, 4);

  if (model.requiresImage && references.length === 0) {
    return NextResponse.json({ error: `${model.label} requires at least one reference image` }, { status: 400 });
  }

  const credits = estimateCredits(model);
  const db = await getDb();

  const [job] = await db
    .insert(aiStudioJobSchema)
    .values({
      orgId: orgId!,
      userId: userId ?? null,
      modelId,
      kind: 'image',
      status: 'reserved',
      creditsReserved: credits,
      input: { prompt, aspect, references },
    })
    .returning();
  if (!job) return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });

  try {
    await reserveCredits(orgId!, job.id, credits);
  } catch (err) {
    await db.delete(aiStudioJobSchema).where(eq(aiStudioJobSchema.id, job.id));
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json({ error: 'Insufficient AI credits', code: 'INSUFFICIENT_CREDITS', required: err.required, available: err.available }, { status: 402 });
    }
    throw err;
  }

  try {
    const input = buildFalInput(model, {
      prompt,
      aspect,
      imageUrl: references[0],
      imageUrls: references,
    });
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
