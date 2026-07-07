import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { drainOneJob } from '@/lib/campaigns/drain-job';
import { getDb } from '@/libs/DB';

export const dynamic = 'force-dynamic';
// Vercel Hobby caps at 300s; per team memory the cron drain must fit here.
export const maxDuration = 300;

/**
 * POST /api/cron/campaigns/process
 *
 * Thin auth wrapper around `drainOneJob`. Called every 2 minutes by
 * `.github/workflows/campaigns-process.yml` to drain the backlog.
 *
 * Request body may include `{ jobId }` to target a specific queued job
 * (used by the enqueue endpoint's immediate kick fallback); when absent
 * the drainer scans the oldest eligible queued row.
 *
 * The enqueue route (`POST /api/campaigns/[id]/generate`) no longer
 * relies on this endpoint for the initial kick — it calls `drainOneJob`
 * in-process via `waitUntil`, so a missing/mis-set `CRON_SECRET` no
 * longer strands fresh jobs at `attempts:0`.
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[CampaignsProcess] CRON_SECRET env var not set');
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let targetJobId: string | null = null;
  try {
    const body = await request.json();
    if (body && typeof body.jobId === 'string') {
      targetJobId = body.jobId;
    }
  } catch { /* no body is fine */ }

  const db = await getDb();
  const result = await drainOneJob(db, { jobId: targetJobId, sweepStale: true });

  // Preserve the historical HTTP status codes: 404 for missing campaign,
  // 200 for everything else (including terminal failures, since the drain
  // handled them correctly).
  if ('status' in result && result.status === 404) {
    const { status, ...body } = result;
    return NextResponse.json(body, { status: 404 });
  }
  return NextResponse.json(result, { status: 200 });
}
