/**
 * Outgoing webhook dispatcher.
 *
 * `fireWebhook(orgId, event, data)` is the single call site every producer
 * uses. It:
 *   1. Looks up enabled endpoints for the org that subscribe to `event`
 *      (empty events array = subscribe to ALL).
 *   2. For each match, signs the payload and POSTs it with a 10 s
 *      per-request AbortController.
 *   3. Records a `webhook_delivery` row per attempt.
 *   4. Tracks consecutive failures on the endpoint; auto-disables after 20.
 *
 * The producer never awaits the network — it hands the dispatch to
 * `waitUntil` from `@vercel/functions` so the API handler returns immediately.
 * See memory nativpost-async-job-inprocess-kick for the pattern.
 */

import { and, eq } from 'drizzle-orm';
import { waitUntil } from '@vercel/functions';

import { getDb } from '@/libs/DB';
import {
  EVENT_HEADER,
  DELIVERY_ID_HEADER,
  SIGNATURE_HEADER,
  signPayload,
} from '@/lib/webhook-signing';
import { webhookDeliverySchema, webhookEndpointSchema } from '@/models/Schema';

export type WebhookEvent =
  // Content lifecycle
  | 'content.created'
  | 'content.updated'
  | 'content.approved'
  | 'content.published'
  | 'content.publish_failed'
  | 'content.deleted'
  // Campaign lifecycle
  | 'campaign.launched'
  | 'campaign.completed'
  | 'campaign.paused'
  // Connections
  | 'social_account.connected'
  | 'social_account.disconnected';

export const ALL_WEBHOOK_EVENTS: WebhookEvent[] = [
  'content.created',
  'content.updated',
  'content.approved',
  'content.published',
  'content.publish_failed',
  'content.deleted',
  'campaign.launched',
  'campaign.completed',
  'campaign.paused',
  'social_account.connected',
  'social_account.disconnected',
];

const REQUEST_TIMEOUT_MS = 10_000;
const AUTO_DISABLE_FAILURE_THRESHOLD = 20;

type WebhookPayload = {
  id: string;
  event: WebhookEvent;
  created_at: string;
  data: Record<string, unknown>;
};

/**
 * Producer-facing entry point.
 * Fire-and-forget — the returned promise resolves as soon as the dispatch
 * is scheduled, not when deliveries complete.
 */
export async function fireWebhook(
  orgId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  // Wrap the actual dispatch in waitUntil so it survives the response.
  try {
    waitUntil(dispatchWebhook(orgId, event, data));
  } catch (err) {
    // waitUntil is unavailable outside Vercel's serverless runtime (e.g.
    // long-running scripts, cron worker). Fall back to background async.
    console.warn('[webhook] waitUntil unavailable, falling back to unawaited promise', err);
    void dispatchWebhook(orgId, event, data).catch((e) => {
      console.error('[webhook] background dispatch error', e);
    });
  }
}

async function dispatchWebhook(
  orgId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  const db = await getDb();

  const endpoints = await db
    .select()
    .from(webhookEndpointSchema)
    .where(and(eq(webhookEndpointSchema.orgId, orgId), eq(webhookEndpointSchema.enabled, true)));

  if (endpoints.length === 0) {
    return;
  }

  const matching = endpoints.filter((ep) => {
    const events = (ep.events ?? []) as string[];
    // Empty subscription list = all events (matches Stripe UX)
    return events.length === 0 || events.includes(event);
  });

  if (matching.length === 0) {
    return;
  }

  await Promise.allSettled(
    matching.map((ep) => deliverOnce(ep, event, data)),
  );
}

async function deliverOnce(
  endpoint: typeof webhookEndpointSchema.$inferSelect,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  const db = await getDb();

  const deliveryId = crypto.randomUUID();
  const payload: WebhookPayload = {
    id: deliveryId,
    event,
    created_at: new Date().toISOString(),
    data,
  };
  const body = JSON.stringify(payload);
  const signature = signPayload(body, endpoint.secret);

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let statusCode: number | null = null;
  let responseBody: string | null = null;
  let errorMessage: string | null = null;
  let success = false;

  try {
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'NativPost-Webhooks/1.0',
        [SIGNATURE_HEADER]: signature,
        [EVENT_HEADER]: event,
        [DELIVERY_ID_HEADER]: deliveryId,
      },
      body,
      signal: controller.signal,
    });
    statusCode = res.status;
    // Cap logged body at 2 KB so a 5 MB HTML error page doesn't fill up JSONB.
    responseBody = (await res.text()).slice(0, 2048);
    success = res.ok;
    if (!success) {
      errorMessage = `HTTP ${res.status}`;
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    if (controller.signal.aborted) {
      errorMessage = `Request timed out after ${REQUEST_TIMEOUT_MS}ms`;
    }
  } finally {
    clearTimeout(timer);
  }

  const durationMs = Date.now() - startedAt;

  await db.insert(webhookDeliverySchema).values({
    id: deliveryId,
    endpointId: endpoint.id,
    orgId: endpoint.orgId,
    event,
    payload,
    statusCode,
    responseBody,
    errorMessage,
    attemptCount: 1,
    durationMs,
    status: success ? 'success' : 'failed',
    deliveredAt: success ? new Date() : null,
  });

  const nextFailures = success ? 0 : (endpoint.consecutiveFailures ?? 0) + 1;
  const shouldDisable = nextFailures >= AUTO_DISABLE_FAILURE_THRESHOLD;

  await db
    .update(webhookEndpointSchema)
    .set({
      lastDeliveryAt: new Date(),
      lastDeliveryStatus: success ? 'success' : 'failed',
      consecutiveFailures: nextFailures,
      enabled: shouldDisable ? false : endpoint.enabled,
      disabledAt: shouldDisable ? new Date() : endpoint.disabledAt,
    })
    .where(eq(webhookEndpointSchema.id, endpoint.id));
}
