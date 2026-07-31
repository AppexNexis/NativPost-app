/**
 * Inngest client + event contract.
 *
 * WHY INNGEST IS HERE
 * ───────────────────
 * Campaign generation used to run inside the HTTP request that started it,
 * via `waitUntil(drainOneJob)`. That works until the campaign is big: the
 * whole run has to fit in one serverless invocation, and when it doesn't the
 * platform kills the function mid-way with no checkpoint. A 400-post campaign
 * could never finish.
 *
 * Inngest turns the run into durable steps. Each step is its own invocation
 * with its own time budget, its result is checkpointed, and a step that fails
 * is retried without redoing the ones before it. Combined with the chunking in
 * `drainOneJob` — where "how many posts are left" is derived from rows on
 * disk — a campaign of any size completes, and a crash costs at most one chunk.
 *
 * OPTIONAL BY DESIGN
 * ──────────────────
 * Inngest is a fast path, never a hard dependency. When the keys are unset
 * (`isInngestConfigured()` is false) the enqueue route falls back to the
 * original `waitUntil` kick and the every-2-min cron still drains the queue.
 * Nothing about generation *requires* Inngest to be reachable — that property
 * is worth keeping, so do not make these env vars required in Env.ts.
 */

import { Inngest } from 'inngest';

export const inngest = new Inngest({ id: 'nativpost' });

/** Emitted by `POST /api/campaigns/[id]/generate` once a job row exists. */
export const CAMPAIGN_GENERATE_EVENT = 'campaign/generate.requested';

export type CampaignGenerateEventData = {
  jobId: string;
  campaignId: string;
  orgId: string;
};

/**
 * True when this deployment can actually reach Inngest. `INNGEST_EVENT_KEY`
 * is what `inngest.send()` needs; the signing key is what the serve route
 * needs to verify inbound calls. Missing either means we stay on the
 * waitUntil + cron path.
 */
export function isInngestConfigured(): boolean {
  return Boolean(process.env.INNGEST_EVENT_KEY && process.env.INNGEST_SIGNING_KEY);
}
