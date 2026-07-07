/**
 * Campaign job drainer — shared logic used by BOTH the cron HTTP route
 * (`POST /api/cron/campaigns/process`) and the enqueue route
 * (`POST /api/campaigns/[id]/generate`) via `waitUntil`.
 *
 * Extracting this out of the cron route eliminated a silent failure mode:
 * the enqueue route used to fire-and-forget an HTTP kick to the cron
 * endpoint using `CRON_SECRET`. If that env var was missing or mismatched
 * on Vercel the kick was skipped/401'd with no signal, and jobs sat in
 * `status:'queued', attempts:0` forever (only cleared by the every-2-min
 * GH Actions cron). Calling `drainOneJob` in-process via `waitUntil`
 * removes the HTTP hop and the secret dependency for the initial kick.
 */
import { and, asc, eq, isNull, lte, or, sql } from 'drizzle-orm';

import { generateCampaignPosts } from '@/app/api/campaigns/utils';
import { campaignJobSchema, campaignSchema } from '@/models/Schema';

const MAX_ATTEMPTS = 3;
// Vercel silently kills functions past maxDuration (300s). A "processing"
// row whose updatedAt is older than this cutoff has been abandoned — the
// sweeper below re-queues it (or terminally fails it if attempts are spent).
const STALE_MS = 6 * 60 * 1000;

export type DrainResult =
  | { processed: 0; message: string }
  | { processed: 1; jobId: string; campaignId: string; totalPosts: number; generatedPosts: number; failedPosts: number }
  | { processed: 0; jobId: string; retriedIn: string; error: string }
  | { processed: 0; jobId: string; error: string; terminal: true }
  | { processed: 0; error: string; status: 404 };

export type DrainOpts = {
  /** If set, target this specific queued job (fresh-kick path). */
  jobId?: string | null;
  /** If true (default), sweep stale `processing` rows before picking. */
  sweepStale?: boolean;
};

export async function sweepStaleJobs(db: any): Promise<void> {
  const staleCutoff = new Date(Date.now() - STALE_MS);
  const staleJobs = await db
    .select()
    .from(campaignJobSchema)
    .where(
      and(
        eq(campaignJobSchema.status, 'processing'),
        lte(campaignJobSchema.updatedAt, staleCutoff),
      ),
    )
    .limit(10);

  for (const stale of staleJobs) {
    const attempts = stale.attempts ?? 1;
    if (attempts < MAX_ATTEMPTS) {
      await db
        .update(campaignJobSchema)
        .set({
          status: 'queued',
          step: 'starting',
          errorMessage: `Attempt ${attempts} timed out (function killed at 300s cap)`,
          nextAttemptAt: new Date(Date.now() + 60 * 1000),
          updatedAt: new Date(),
        })
        .where(eq(campaignJobSchema.id, stale.id));
    } else {
      await db
        .update(campaignJobSchema)
        .set({
          status: 'failed',
          step: 'error',
          errorMessage: `Timed out after ${attempts} attempts (each killed at 300s cap). The engine may be unreachable or the campaign is too large.`,
          completedAt: new Date(),
        })
        .where(eq(campaignJobSchema.id, stale.id));
      await db
        .update(campaignSchema)
        .set({ status: 'draft', updatedAt: new Date() })
        .where(eq(campaignSchema.id, stale.campaignId));
    }
  }
}

export async function drainOneJob(db: any, opts: DrainOpts = {}): Promise<DrainResult> {
  const { jobId: targetJobId = null, sweepStale = true } = opts;
  const now = new Date();

  if (sweepStale) {
    await sweepStaleJobs(db);
  }

  // 1. Pick a job — prefer the explicit id (fresh kick), else scan oldest
  //    eligible queued row. Explicit path bypasses the nextAttemptAt gate
  //    because a fresh kick from the enqueue endpoint is by definition
  //    ready to run.
  let job: any | undefined;

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
    return { processed: 0, message: 'No queued jobs' };
  }

  // 2. Claim — race guard: only update if row is still 'queued'.
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
    return { processed: 0, message: 'Race — another worker claimed this job' };
  }

  const claimed = claimResult[0]!;

  // 3. Fetch campaign
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
    return { processed: 0, error: 'Campaign not found', status: 404 };
  }

  // 4. Run with progress + per-post error callbacks.
  try {
    const overrides = {
      topic: claimed.topicOverride || undefined,
      targetPlatforms: (claimed.targetPlatformsOverride as string[] | null) || undefined,
    };

    // Throttle progress writes so a big campaign doesn't hammer the DB.
    let lastWriteAt = 0;
    let lastPercent = -1;

    const result = await generateCampaignPosts(
      db,
      claimed.orgId,
      campaign,
      overrides.topic,
      overrides.targetPlatforms,
      async (p: { percent: number; status: string; total: number; postIndex: number }) => {
        const nowMs = Date.now();
        if (p.percent === lastPercent && nowMs - lastWriteAt < 1500) {
          return;
        }
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
          console.warn('[DrainJob] Progress write failed:', writeErr?.message);
        }
      },
      undefined,
      async (evt: { postIndex: number; detail: any }) => {
        try {
          await db
            .update(campaignJobSchema)
            .set({
              postsFailed: sql`${campaignJobSchema.postsFailed} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(campaignJobSchema.id, claimed.id));
          console.warn(`[DrainJob] Post ${evt.postIndex} error:`, evt.detail);
        } catch { /* ignore */ }
      },
    );

    // 5. Success
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

    return {
      processed: 1,
      jobId: claimed.id,
      campaignId: campaign.id,
      totalPosts: result.totalPosts,
      generatedPosts: result.completedPosts,
      failedPosts: result.failedPosts,
    };
  } catch (err: any) {
    // 6. Retry or terminal fail
    const attempts = claimed.attempts ?? 1;
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[DrainJob] Job ${claimed.id} failed (attempt ${attempts}):`, detail);

    if (attempts < MAX_ATTEMPTS) {
      // Exponential backoff: 60s, 240s, 960s.
      const backoffSeconds = 60 * 4 ** (attempts - 1);
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

      return {
        processed: 0,
        jobId: claimed.id,
        retriedIn: `${backoffSeconds}s`,
        error: detail,
      };
    }

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

    return {
      processed: 0,
      jobId: claimed.id,
      error: detail,
      terminal: true,
    };
  }
}
