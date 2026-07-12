import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getFalResult, getFalStatus } from '@/lib/ai-studio/fal';
import { getModel } from '@/lib/ai-studio/models';
import { reconcileFalJob } from '@/lib/ai-studio/reconcile';
import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { aiStudioJobSchema } from '@/models/Schema';

export const dynamic = 'force-dynamic';

/**
 * Returns a single job. Also acts as a polling fallback: when the job is
 * still queued/processing and has a Fal request id, we ask Fal directly
 * whether the request has finished and reconcile if so. This makes the
 * pipeline resilient to a missed or 401-rejected webhook.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const { id } = await params;
  const db = await getDb();
  const [job] = await db
    .select()
    .from(aiStudioJobSchema)
    .where(and(eq(aiStudioJobSchema.id, id), eq(aiStudioJobSchema.orgId, orgId!)))
    .limit(1);

  if (!job) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  // Poll-through: if Fal has finished but our webhook never ran (or 401'd),
  // reconcile now so the UI advances without waiting for the sweep-stale cron.
  const isPending = job.status === 'queued' || job.status === 'processing' || job.status === 'reserved';
  if (isPending && job.falRequestId) {
    const model = getModel(job.modelId);
    if (model?.falModel) {
      try {
        const status = await getFalStatus(model.falModel, job.falRequestId);
        if (status.status === 'COMPLETED') {
          const result = await getFalResult<Record<string, unknown>>(model.falModel, job.falRequestId);
          await db
            .update(aiStudioJobSchema)
            .set({ status: 'processing' })
            .where(eq(aiStudioJobSchema.id, job.id));
          await reconcileFalJob({ job, ok: true, output: result });
          const [updated] = await db
            .select()
            .from(aiStudioJobSchema)
            .where(eq(aiStudioJobSchema.id, job.id))
            .limit(1);
          const res = NextResponse.json({ job: updated ?? job, reconciled: true });
          res.headers.set('Cache-Control', 'no-store');
          return res;
        }
        if (status.status === 'FAILED') {
          await reconcileFalJob({
            job,
            ok: false,
            error: 'Fal reported FAILED via polling',
          });
          const [updated] = await db
            .select()
            .from(aiStudioJobSchema)
            .where(eq(aiStudioJobSchema.id, job.id))
            .limit(1);
          const res = NextResponse.json({ job: updated ?? job, reconciled: true });
          res.headers.set('Cache-Control', 'no-store');
          return res;
        }
      } catch {
        // Fal poll failed; fall through and return current DB state.
      }
    }
  }

  const res = NextResponse.json({ job });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
