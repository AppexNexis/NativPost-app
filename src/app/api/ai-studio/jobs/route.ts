import { and, desc, eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getFalResult, getFalStatus } from '@/lib/ai-studio/fal';
import { getModel } from '@/lib/ai-studio/models';
import { reconcileFalJob } from '@/lib/ai-studio/reconcile';
import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { aiStudioJobSchema } from '@/models/Schema';

export const dynamic = 'force-dynamic';

/**
 * Lists recent jobs. On every read, we poll Fal for any queued/processing
 * jobs older than the webhook-should-have-fired threshold and reconcile
 * them inline. This means the UI advances even if the webhook 401'd or was
 * dropped, without waiting for the sweep-stale cron.
 */
export async function GET(request: Request) {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? 50), 1), 200);
  const kind = searchParams.get('kind');

  const db = await getDb();
  let rows = await db
    .select()
    .from(aiStudioJobSchema)
    .where(
      kind
        ? and(eq(aiStudioJobSchema.orgId, orgId!), eq(aiStudioJobSchema.kind, kind))
        : eq(aiStudioJobSchema.orgId, orgId!),
    )
    .orderBy(desc(aiStudioJobSchema.createdAt))
    .limit(limit);

  // Poll-through reconciliation for pending jobs. Bounded to at most 3
  // per request so we never blow past Vercel's serverless budget when a
  // burst of stuck jobs is present.
  const pending = rows.filter(
    j =>
      (j.status === 'queued' || j.status === 'processing')
      && !!j.falRequestId
      && Date.now() - new Date(j.createdAt).getTime() > 10_000,
  ).slice(0, 3);

  const reconciledIds: string[] = [];
  for (const job of pending) {
    const model = getModel(job.modelId);
    if (!model?.falModel || !job.falRequestId) {
      continue;
    }
    try {
      const status = await getFalStatus(model.falModel, job.falRequestId);
      if (status.status === 'COMPLETED') {
        const result = await getFalResult<Record<string, unknown>>(model.falModel, job.falRequestId);
        await reconcileFalJob({ job, ok: true, output: result });
        reconciledIds.push(job.id);
      } else if (status.status === 'FAILED') {
        await reconcileFalJob({ job, ok: false, error: 'Fal reported FAILED via polling' });
        reconciledIds.push(job.id);
      }
    } catch {
      // Poll error; try again on next tick.
    }
  }

  if (reconciledIds.length > 0) {
    const refreshed = await db
      .select()
      .from(aiStudioJobSchema)
      .where(inArray(aiStudioJobSchema.id, reconciledIds));
    const byId = new Map(refreshed.map(r => [r.id, r]));
    rows = rows.map(r => byId.get(r.id) ?? r);
  }

  const res = NextResponse.json({ jobs: rows, reconciled: reconciledIds.length });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
