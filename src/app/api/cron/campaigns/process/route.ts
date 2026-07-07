import { and, asc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getDb } from '@/libs/DB';
import { campaignJobSchema, campaignSchema } from '@/models/Schema';
import { generateCampaignPosts } from '../../../campaigns/utils';

export const dynamic = 'force-dynamic';
// Vercel Hobby caps at 300s; per team memory the cron drain must fit here.
export const maxDuration = 300;

const MAX_ATTEMPTS = 3;

/**
 * POST /api/cron/campaigns/process
 *
 * Drains one campaign generation job per invocation.
 *
 *   1. Auth via `Bearer $CRON_SECRET` (same pattern as publish-scheduled).
 *   2. Pick a job — if the request body specifies `{ jobId }` (immediate
 *      kick from the start endpoint) target that one; otherwise scan for
 *      the oldest queued job with `next_attempt_at` in the past or null.
 *   3. Flip to `processing`, bump `attempts`, invoke `generateCampaignPosts`
 *      with `onProgress` writing back to the row so the status endpoint
 *      streams real % progress instead of a spinner.
 *   4. On success → status='done', progress=100, campaign.status='review'.
 *   5. On error → if attempts < MAX_ATTEMPTS re-queue with exponential
 *      backoff (60s → 240s → 960s); else mark 'failed' and reset campaign
 *      status back to 'draft' so the UI doesn't sit in 'generating'.
 *
 * The GitHub Actions cron (see .github/workflows/campaigns-process.yml)
 * fires this every 2 minutes to drain whatever's queued; the start
 * endpoint also fires an immediate kick with the fresh job's id so users
 * don't wait for the next tick.
 */
export async function POST(request: NextRequest) {
  const db = await getDb();

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
    if (body && typeof body.jobId === 'string') targetJobId = body.jobId;
  } catch { /* no body is fine */ }

  const now = new Date();

  // ── 1. Pick a job ───────────────────────────────────────────────────────
  // Prefer the explicit jobId path (fresh kick) — that job might have a
  // future nextAttemptAt from a backoff schedule, but if the client kicked
  // it we assume it's ready.
  let job: typeof campaignJobSchema.$inferSelect | undefined;

  if (targetJobId) {
    [job] = await db
      .select()
      .from(campaignJobSchema)
      .where(
        and(
          eq(campaignJobSchema.id, targetJobId),
          eq(campaignJobSchema.status, 'queued'),
        ),
      )
      .limit(1);
  }

  if (!job) {
    // Scan for oldest eligible queued job.
    [job] = await db
      .select()
      .from(campaignJobSchema)
      .where(
        and(
          eq(campaignJobSchema.status, 'queued'),
          or(
            isNull(campaignJobSchema.nextAttemptAt),
            lte(campaignJobSchema.nextAttemptAt, now),
          ),
        ),
      )
      .orderBy(asc(campaignJobSchema.createdAt))
      .limit(1);
  }

  if (!job) {
    return NextResponse.json({ processed: 0, message: 'No queued jobs' }, { status: 200 });
  }

  // ── 2. Claim the job ────────────────────────────────────────────────────
  // Guard against concurrent workers grabbing the same row. Only update if
  // status is still 'queued' — if a parallel invocation raced us, the
  // update matches zero rows and we bail.
  const claimResult = await db
    .update(campaignJobSchema)
    .set({
      status: 'processing',
      startedAt: now,
      attempts: (job.attempts ?? 0) + 1,
      step: 'engine_generating',
      progress: 5,
      updatedAt: now,
    })
    .where(
      and(
        eq(campaignJobSchema.id, job.id),
        eq(campaignJobSchema.status, 'queued'),
      ),
    )
    .returning();

  if (claimResult.length === 0) {
    return NextResponse.json(
      { processed: 0, message: 'Race — another worker claimed this job' },
      { status: 200 },
    );
  }

  const claimed = claimResult[0]!;

  // ── 3. Fetch campaign row ───────────────────────────────────────────────
  const [campaign] = await db
    .select()
    .from(campaignSchema)
    .where(eq(campaignSchema.id, claimed.campaignId))
    .limit(1);

  if (!campaign) {
    await db
      .update(campaignJobSchema)
      .set({
        status: 'failed',
        errorMessage: 'Campaign not found',
        completedAt: new Date(),
        step: 'error',
      })
      .where(eq(campaignJobSchema.id, claimed.id));
    return NextResponse.json({ processed: 0, error: 'Campaign not found' }, { status: 404 });
  }

  // ── 4. Run generation with progress callbacks ───────────────────────────
  try {
    const overrides = {
      topic: claimed.topicOverride || undefined,
      targetPlatforms: (claimed.targetPlatformsOverride as string[] | null) || undefined,
    };

    // Throttle progress writes — a big campaign can call onProgress dozens
    // of times per second inside the insert loop. Write at most every ~1.5s
    // OR when the percent changes materially.
    let lastWriteAt = 0;
    let lastPercent = -1;

    const result = await generateCampaignPosts(
      db,
      claimed.orgId,
      campaign,
      overrides.topic,
      overrides.targetPlatforms,
      async (p) => {
        const nowMs = Date.now();
        if (p.percent === lastPercent && nowMs - lastWriteAt < 1500) return;
        lastPercent = p.percent;
        lastWriteAt = nowMs;
        try {
          await db
            .update(campaignJobSchema)
            .set({
              progress: Math.max(5, Math.min(99, p.percent)),
              step: p.status,
              postsTotal: p.total,
              postsCompleted: p.postIndex,
              updatedAt: new Date(),
            })
            .where(eq(campaignJobSchema.id, claimed.id));
        } catch (writeErr: any) {
          console.warn('[CampaignsProcess] Progress write failed:', writeErr?.message);
        }
      },
      undefined,
      async (evt) => {
        try {
          await db
            .update(campaignJobSchema)
            .set({
              postsFailed: sql`${campaignJobSchema.postsFailed} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(campaignJobSchema.id, claimed.id));
          console.warn(`[CampaignsProcess] Post ${evt.postIndex} error:`, evt.detail);
        } catch { /* ignore */ }
      },
    );

    // ── 5. Success ────────────────────────────────────────────────────────
    const finalCampaignStatus = result.failedPosts === result.totalPosts ? 'draft' : 'review';

    await db
      .update(campaignJobSchema)
      .set({
        status: 'done',
        step: 'done',
        progress: 100,
        postsTotal: result.totalPosts,
        postsCompleted: result.completedPosts,
        postsFailed: result.failedPosts,
        completedAt: new Date(),
      })
      .where(eq(campaignJobSchema.id, claimed.id));

    await db
      .update(campaignSchema)
      .set({
        status: finalCampaignStatus,
        totalPosts: result.totalPosts,
        generatedPosts: result.completedPosts,
        updatedAt: new Date(),
      })
      .where(eq(campaignSchema.id, campaign.id));

    return NextResponse.json({
      processed: 1,
      jobId: claimed.id,
      campaignId: campaign.id,
      totalPosts: result.totalPosts,
      generatedPosts: result.completedPosts,
      failedPosts: result.failedPosts,
    }, { status: 200 });

  } catch (err: any) {
    // ── 6. Retry or fail ──────────────────────────────────────────────────
    const attempts = claimed.attempts ?? 1;
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[CampaignsProcess] Job ${claimed.id} failed (attempt ${attempts}):`, detail);

    if (attempts < MAX_ATTEMPTS) {
      // Exponential backoff: 60s, 240s, 960s.
      const backoffSeconds = 60 * Math.pow(4, attempts - 1);
      const nextAttempt = new Date(Date.now() + backoffSeconds * 1000);
      await db
        .update(campaignJobSchema)
        .set({
          status: 'queued',
          step: 'starting',
          errorMessage: `Attempt ${attempts} failed: ${detail}`,
          nextAttemptAt: nextAttempt,
          updatedAt: new Date(),
        })
        .where(eq(campaignJobSchema.id, claimed.id));

      return NextResponse.json({
        processed: 0,
        jobId: claimed.id,
        retriedIn: `${backoffSeconds}s`,
        error: detail,
      }, { status: 200 });
    }

    // Terminal failure: reset the campaign so the UI can show a retry CTA
    // instead of sitting stuck in 'generating'.
    await db
      .update(campaignJobSchema)
      .set({
        status: 'failed',
        step: 'error',
        errorMessage: detail,
        completedAt: new Date(),
      })
      .where(eq(campaignJobSchema.id, claimed.id));

    await db
      .update(campaignSchema)
      .set({ status: 'draft', updatedAt: new Date() })
      .where(eq(campaignSchema.id, campaign.id));

    return NextResponse.json({
      processed: 0,
      jobId: claimed.id,
      error: detail,
      terminal: true,
    }, { status: 200 });
  }
}
