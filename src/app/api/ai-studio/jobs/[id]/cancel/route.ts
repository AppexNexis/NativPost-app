import { NextResponse } from 'next/server';

import { and, eq } from 'drizzle-orm';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { aiStudioJobSchema } from '@/models/Schema';
import { cancelFalJob } from '@/lib/ai-studio/fal';
import { refundCredits } from '@/lib/ai-studio/server';
import { getModel } from '@/lib/ai-studio/models';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;
  const db = await getDb();
  const [job] = await db
    .select()
    .from(aiStudioJobSchema)
    .where(and(eq(aiStudioJobSchema.id, id), eq(aiStudioJobSchema.orgId, orgId!)))
    .limit(1);

  if (!job) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const inflightStatuses = new Set(['reserved', 'queued', 'processing']);
  if (!inflightStatuses.has(job.status)) {
    return NextResponse.json({ error: 'Job is already final', status: job.status }, { status: 409 });
  }

  const model = getModel(job.modelId);
  if (model && job.falRequestId) {
    try {
      await cancelFalJob(model.falModel, job.falRequestId);
    } catch (err) {
      // Cancel failure is not fatal: the sweeper will handle it.
      console.error('[AI Studio cancel] Fal cancel failed', err);
    }
  }

  await refundCredits(job.orgId, job.id, job.creditsReserved, 'user canceled');
  await db
    .update(aiStudioJobSchema)
    .set({ status: 'canceled' })
    .where(eq(aiStudioJobSchema.id, job.id));

  const res = NextResponse.json({ ok: true });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
