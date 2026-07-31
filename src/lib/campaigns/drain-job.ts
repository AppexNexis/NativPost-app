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

// Posts generated per chunk. `generateCampaignPosts` derives "how many are
// left" from rows already on disk, so calling it repeatedly resumes rather
// than restarts — that is what makes a 400-post campaign survivable. Sized
// under the brand-voice cache ceiling (CACHE_MAX) so a chunk's prewarm can't
// evict its own entries before the insert loop reads them.
const CHUNK_SIZE = 50;

// How long one invocation keeps pulling chunks before parking the job back on
// the queue. Well inside the 300s platform cap: the check happens BETWEEN
// chunks, so the budget must leave room for one more full chunk plus the
// bookkeeping writes.
const DEFAULT_TIME_BUDGET_MS = 180 * 1000;

export type DrainResult =
  | { processed: 0; message: string }
  | {
    processed: 1;
    jobId: string;
    campaignId: string;
    totalPosts: number;
    generatedPosts: number;
    failedPosts: number;
    /**
     * False when the invocation ran out of time budget with posts still to
     * generate. The job has been parked back on the queue with its progress
     * intact; the next drain (cron tick or Inngest step) continues from
     * there. Callers driving the job to completion loop on this.
     */
    complete: boolean;
  }
  | { processed: 0; jobId: string; retriedIn: string; error: string }
  | { processed: 0; jobId: string; error: string; terminal: true }
  | { processed: 0; error: string; status: 404 };

export type DrainOpts = {
  /** If set, target this specific queued job (fresh-kick path). */
  jobId?: string | null;
  /** If true (default), sweep stale `processing` rows before picking. */
  sweepStale?: boolean;
  /** Posts per chunk. Defaults to CHUNK_SIZE. */
  chunkSize?: number;
  /**
   * How long to keep pulling chunks before parking the job. Defaults to
   * DEFAULT_TIME_BUDGET_MS. Inngest passes a smaller budget so each step
   * stays short and is checkpointed independently.
   */
  timeBudgetMs?: number;
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
  const {
    jobId: targetJobId = null,
    sweepStale = true,
    chunkSize = CHUNK_SIZE,
    timeBudgetMs = DEFAULT_TIME_BUDGET_MS,
  } = opts;
  const now = new Date();

  if (sweepStale) {
    await sweepStaleJobs(db);
  }

  // 1. Pick a job — the explicit id when given (fresh kick, or the next chunk
  //    of a run already in progress), else scan the oldest eligible queued
  //    row. The explicit path bypasses the nextAttemptAt gate because a
  //    targeted call is by definition ready to run.
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

    // A caller that named a job wants THAT job. Falling through to the scan
    // here would hand it somebody else's campaign whenever its own job was
    // momentarily unavailable — which happens routinely now that chunked runs
    // park and re-claim, and a cron tick can hold the claim in between. The
    // caller retries; the cron keeps the backlog moving.
    if (!job) {
      return { processed: 0, message: `Job ${targetJobId} is not currently claimable` };
    }
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

    // ── Chunked generation ───────────────────────────────────────────────
    // One `generateCampaignPosts` call produces at most `chunkSize` posts and
    // derives what's left from rows already on disk, so calling it in a loop
    // resumes instead of restarting. That is what makes a 300-400 post
    // campaign possible: no single call has to fit the whole campaign into
    // one function invocation, and a call that gets killed loses at most one
    // chunk — the rows it already committed still count.
    //
    // The loop stops on: campaign complete, Blitz daily cap, a chunk that
    // inserted nothing (guards against spinning), or the time budget.
    let result!: Awaited<ReturnType<typeof generateCampaignPosts>>;
    let chunks = 0;
    let insertedTotal = 0;
    let failedTotal = 0;
    let complete = false;
    const startedMs = Date.now();

    // Progress is reported against the campaign's whole window, across chunks.
    // `progressBase` is how many posts were already done when the CURRENT chunk
    // started, so the in-chunk `postIndex` can be added to it directly — without
    // it the bar restarts from zero on every chunk. Seeded from the campaign row
    // (which the drain maintains) and re-derived from each chunk's own count of
    // what it found on disk, which is authoritative.
    let progressBase = campaign.generatedPosts ?? 0;
    let windowTarget = campaign.totalPosts || 0;

    do {
      result = await generateCampaignPosts(
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
                // Against the whole window, carrying earlier chunks — see
                // `progressBase`. `p.total`/`p.percent` are chunk-local.
                postsTotal: windowTarget || p.total,
                postsCompleted: progressBase + p.postIndex,
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
        { maxPosts: chunkSize },
      );

      chunks++;
      insertedTotal += result.contentItemIds.length;
      failedTotal += result.failedPosts;
      // Roll the baseline forward for the next chunk. `existingCount` is what
      // this chunk found on disk before it ran, so adding what it inserted
      // gives the next chunk's starting point.
      progressBase = (result.existingCount ?? progressBase) + result.contentItemIds.length;
      windowTarget = result.campaignTarget ?? windowTarget;

      // Stop when the quota is satisfied, or when a chunk produced nothing at
      // all — the latter means there is no more work to be had (daily cap, no
      // usable templates) and looping again would spin.
      complete = Boolean(result.quotaSatisfied)
        || Boolean(result.dailyLimitReached)
        || result.contentItemIds.length === 0;
    } while (!complete && Date.now() - startedMs < timeBudgetMs);

    console.warn(
      `[DrainJob] Job ${claimed.id}: ${chunks} chunk(s), ${insertedTotal} inserted, `
      + `${failedTotal} failed, complete=${complete}, ${Date.now() - startedMs}ms`,
    );

    // Out of budget with work remaining — park the job back on the queue with
    // its progress intact. `attempts` resets to 0 because this is forward
    // progress, not a failure; leaving it incremented would burn the retry
    // allowance and terminally fail a healthy campaign after 3 chunks.
    if (!complete) {
      const done = progressBase;
      await db
        .update(campaignJobSchema)
        .set({
          status: 'queued',
          step: 'generating_chunked',
          attempts: 0,
          nextAttemptAt: null,
          progress: windowTarget > 0
            ? Math.max(5, Math.min(99, Math.round((done / windowTarget) * 100)))
            : 5,
          postsTotal: windowTarget,
          postsCompleted: done,
          updatedAt: new Date(),
        })
        .where(eq(campaignJobSchema.id, claimed.id));

      return {
        processed: 1,
        jobId: claimed.id,
        campaignId: campaign.id,
        totalPosts: windowTarget,
        generatedPosts: done,
        failedPosts: failedTotal,
        complete: false,
      };
    }

    // 5. Success.
    // Write the WINDOW figures, never this chunk's. `generateCampaignPosts`
    // reports what a single call produced; writing that back as the campaign's
    // total is how a 112-post campaign became a 2-post campaign. `windowTarget`
    // is the campaign's real target and `progressBase` has been rolled forward
    // past the final chunk, so it holds the cumulative count.
    const cumulativeDone = progressBase;
    // Only call the campaign a write-off when this run actually tried to
    // produce posts and every one of them failed. A final chunk that
    // legitimately had nothing left to do must not flip a full campaign back
    // to 'draft'.
    const finalCampaignStatus
      = insertedTotal === 0 && failedTotal > 0 && cumulativeDone === 0 ? 'draft' : 'review';

    await db
      .update(campaignJobSchema)
      .set({
        status: 'done',
        step: 'done',
        progress: 100,
        postsTotal: windowTarget,
        postsCompleted: cumulativeDone,
        postsFailed: failedTotal,
        completedAt: new Date(),
      })
      .where(eq(campaignJobSchema.id, claimed.id));

    await db
      .update(campaignSchema)
      .set({
        status: finalCampaignStatus,
        totalPosts: windowTarget,
        generatedPosts: cumulativeDone,
        updatedAt: new Date(),
      })
      .where(eq(campaignSchema.id, campaign.id));

    return {
      processed: 1,
      jobId: claimed.id,
      campaignId: campaign.id,
      totalPosts: windowTarget,
      generatedPosts: cumulativeDone,
      failedPosts: failedTotal,
      complete: true,
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
