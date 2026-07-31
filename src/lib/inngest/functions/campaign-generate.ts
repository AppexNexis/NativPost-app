/**
 * campaign-generate — drives one campaign generation job to completion.
 *
 * The actual work lives in `drainOneJob`, which is shared with the cron
 * backstop. This function's only job is to call it repeatedly, as durable
 * steps, until the campaign's window is full.
 *
 * Why a loop of steps rather than one long call:
 *   - Each `step.run` is a separate invocation with its own time budget, so no
 *     single call has to fit a 400-post campaign into one function.
 *   - Step results are checkpointed. A retry re-runs the failed step only —
 *     and because `drainOneJob` re-derives what's left from rows on disk, even
 *     a step that half-completed before dying doesn't duplicate work.
 *   - Progress is visible in the Inngest dashboard per chunk, not as one
 *     opaque 5-minute call.
 *
 * The job row remains the source of truth for the UI; this function never
 * reports progress the drain hasn't already written.
 */

import { eq } from 'drizzle-orm';

import { drainOneJob } from '@/lib/campaigns/drain-job';
import { getDb } from '@/libs/DB';
import { campaignJobSchema } from '@/models/Schema';

import { CAMPAIGN_GENERATE_EVENT, inngest } from '../client';

// Hard ceiling on chunk steps for one run. At the drain's default chunk size
// this covers campaigns far larger than the product allows; it exists so a
// bug that stops making progress terminates instead of looping forever.
const MAX_CHUNK_STEPS = 40;

// Per-step time budget. Deliberately well under the platform's function limit
// so a step always finishes and checkpoints rather than being killed — the
// drain checks this budget between chunks and parks the job when it's spent.
const STEP_TIME_BUDGET_MS = 60 * 1000;

// Inngest v4 takes (options, handler) with the trigger inside options —
// the v3 three-argument form (options, trigger, handler) no longer typechecks.
export const campaignGenerate = inngest.createFunction(
  {
    id: 'campaign-generate',
    name: 'Generate campaign posts',
    triggers: [{ event: CAMPAIGN_GENERATE_EVENT }],
    // One run per campaign at a time. `generateCampaignPosts` is already
    // quota-guarded against double-inserting, but serialising here means two
    // enqueues for the same campaign queue up instead of fighting over the
    // job claim and burning chunks on "another worker has it".
    concurrency: [{ key: 'event.data.campaignId', limit: 1 }],
    retries: 3,
  },
  async ({ event, step, logger }) => {
    const { jobId, campaignId } = event.data as { jobId: string; campaignId: string };

    for (let i = 0; i < MAX_CHUNK_STEPS; i++) {
      const outcome = await step.run(`chunk-${i}`, async () => {
        const db = await getDb();

        // sweepStale: false — this run owns its job, and sweeping is the
        // cron's responsibility. Sweeping here would let one campaign's run
        // requeue an unrelated org's abandoned job.
        const drained = await drainOneJob(db, {
          jobId,
          sweepStale: false,
          timeBudgetMs: STEP_TIME_BUDGET_MS,
        });

        // The job row is the authority on where we are — the drain result can
        // be ambiguous (e.g. the cron claimed the job between steps), but the
        // row's status never is.
        const [job] = await db
          .select({
            status: campaignJobSchema.status,
            postsCompleted: campaignJobSchema.postsCompleted,
            postsTotal: campaignJobSchema.postsTotal,
            errorMessage: campaignJobSchema.errorMessage,
          })
          .from(campaignJobSchema)
          .where(eq(campaignJobSchema.id, jobId))
          .limit(1);

        return {
          jobStatus: job?.status ?? 'missing',
          postsCompleted: job?.postsCompleted ?? 0,
          postsTotal: job?.postsTotal ?? 0,
          errorMessage: job?.errorMessage ?? null,
          drainProcessed: drained.processed,
        };
      });

      if (outcome.jobStatus === 'done') {
        logger.info('Campaign generation complete', {
          campaignId,
          posts: outcome.postsCompleted,
        });
        return {
          campaignId,
          jobId,
          postsCompleted: outcome.postsCompleted,
          postsTotal: outcome.postsTotal,
          chunks: i + 1,
        };
      }

      if (outcome.jobStatus === 'failed' || outcome.jobStatus === 'missing') {
        // Throwing surfaces the run as failed in the Inngest dashboard and
        // lets its retry policy have a go. The drain has already recorded the
        // real reason on the job row, which is what the UI shows.
        throw new Error(
          `Campaign job ${jobId} ${outcome.jobStatus}: ${outcome.errorMessage ?? 'no detail'}`,
        );
      }

      // Still queued/processing with nothing drained — something else holds
      // the claim (most likely a cron tick that overlapped us). Back off
      // rather than burning the step allowance on contention.
      if (outcome.drainProcessed === 0) {
        await step.sleep(`await-claim-${i}`, '15s');
      }
    }

    throw new Error(
      `Campaign job ${jobId} did not complete within ${MAX_CHUNK_STEPS} chunks`,
    );
  },
);
