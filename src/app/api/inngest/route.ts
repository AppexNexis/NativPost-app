/**
 * Inngest serve endpoint.
 *
 * Inngest calls back into this route to execute each step of a run, so it must
 * be reachable from the internet and excluded from auth middleware. Register
 * the app at this URL in the Inngest dashboard:
 *
 *   https://app.nativpost.com/api/inngest
 *
 * Env (both optional — see lib/inngest/client.ts; generation falls back to the
 * waitUntil + cron path when unset):
 *   INNGEST_EVENT_KEY    — used by inngest.send()
 *   INNGEST_SIGNING_KEY  — used to verify inbound step calls
 */

import { serve } from 'inngest/next';

import { inngest } from '@/lib/inngest/client';
import { campaignGenerate } from '@/lib/inngest/functions/campaign-generate';

// Each step call is its own invocation; the drain's per-step budget is well
// inside this, so a step parks the job rather than getting killed.
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [campaignGenerate],
});
