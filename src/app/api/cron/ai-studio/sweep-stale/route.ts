import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { and, eq, inArray, lt } from 'drizzle-orm';

import { getDb } from '@/libs/DB';
import { aiStudioJobSchema } from '@/models/Schema';
import { refundCredits } from '@/lib/ai-studio/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const STALE_MINUTES = 20;

/**
 * Marks AI Studio jobs stuck in `reserved` / `queued` / `processing` for
 * more than STALE_MINUTES minutes as failed, and refunds their reservation.
 *
 * Wired to `vercel.json` cron at every 15 minutes.
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - STALE_MINUTES * 60_000);
  const db = await getDb();
  const stale = await db
    .select()
    .from(aiStudioJobSchema)
    .where(
      and(
        inArray(aiStudioJobSchema.status, ['reserved', 'queued', 'processing']),
        lt(aiStudioJobSchema.updatedAt, cutoff),
      ),
    )
    .limit(50);

  let refunded = 0;
  for (const job of stale) {
    try {
      await refundCredits(job.orgId, job.id, job.creditsReserved, 'sweeper: stale');
      await db
        .update(aiStudioJobSchema)
        .set({ status: 'failed', errorMessage: 'Timed out waiting for Fal response' })
        .where(eq(aiStudioJobSchema.id, job.id));
      refunded += 1;
    } catch (err) {
      console.error('[ai-studio sweep] failed to refund', job.id, err);
    }
  }

  return NextResponse.json({ ok: true, swept: stale.length, refunded });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
