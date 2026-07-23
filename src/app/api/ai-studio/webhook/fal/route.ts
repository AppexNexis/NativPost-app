import { Buffer } from 'node:buffer';

import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
  type FalWebhookPayload,
  friendlyFalWebhookError,
  getFalResult,
  parseFalErrorPayload,
  verifyFalWebhook,
} from '@/lib/ai-studio/fal';
import { getModel } from '@/lib/ai-studio/models';
import { reconcileFalJob } from '@/lib/ai-studio/reconcile';
import { getDb } from '@/libs/DB';
import { aiStudioJobSchema } from '@/models/Schema';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Fal.ai webhook receiver.
 *
 * Fal signs the raw HTTP body bytes; we hash those bytes as-is (via
 * arrayBuffer, NOT text()) so the digest matches what Fal signed. The
 * canonical message is:
 *   [request_id, user_id, timestamp, sha256_hex(raw_body)].join('\n')
 * verified against JWKS Ed25519 keys.
 *
 * Signature verification can be soft-disabled in local dev by setting
 * `FAL_WEBHOOK_INSECURE=1`.
 *
 * The polling fallback in GET /api/ai-studio/jobs/[id] uses the same
 * reconcileFalJob helper, so a missed webhook never strands a job.
 */
/**
 * Resolve a Fal webhook error to a user-facing message. Falls back to
 * fetching the full result from Fal's REST endpoint when the webhook
 * error field is generic (e.g. just "Unexpected status code: 422") so
 * the user gets the model-level detail array.
 */
async function resolveFalError(
  payload: FalWebhookPayload,
  job: typeof aiStudioJobSchema.$inferSelect,
): Promise<string> {
  // First try the webhook error field directly.
  const webhookMsg = friendlyFalWebhookError(payload.error);
  if (webhookMsg !== 'Fal returned error') {
    return webhookMsg;
  }

  // Webhook error was generic. Try fetching the full result from Fal.
  const model = getModel(job.modelId);
  if (!model?.falModel || !job.falRequestId) {
    return webhookMsg;
  }

  try {
    const result = await getFalResult<Record<string, unknown>>(model.falModel, job.falRequestId);
    const errField = result?.error;
    if (typeof errField === 'string') {
      const parsed = parseFalErrorPayload(errField);
      return parsed.type ? `${parsed.message} (${parsed.type})` : parsed.message;
    }
    if (errField && typeof errField === 'object') {
      const parsed = parseFalErrorPayload(JSON.stringify(errField));
      return parsed.type ? `${parsed.message} (${parsed.type})` : parsed.message;
    }
    if (result?.detail) {
      const parsed = parseFalErrorPayload(JSON.stringify(result));
      return parsed.type ? `${parsed.message} (${parsed.type})` : parsed.message;
    }
    return webhookMsg;
  } catch {
    return webhookMsg;
  }
}

export async function POST(request: NextRequest) {
  const rawBodyBuf = Buffer.from(await request.arrayBuffer());
  const insecure = process.env.FAL_WEBHOOK_INSECURE === '1';
  const debug = process.env.FAL_WEBHOOK_DEBUG === '1';

  if (debug) {
    console.log('[fal-webhook] headers:', {
      requestId: request.headers.get('x-fal-webhook-request-id'),
      userId: request.headers.get('x-fal-webhook-user-id'),
      timestamp: request.headers.get('x-fal-webhook-timestamp'),
      signaturePresent: !!request.headers.get('x-fal-webhook-signature'),
      bodyLen: rawBodyBuf.length,
    });
  }

  if (!insecure) {
    const ok = await verifyFalWebhook(
      {
        requestId: request.headers.get('x-fal-webhook-request-id'),
        userId: request.headers.get('x-fal-webhook-user-id'),
        timestamp: request.headers.get('x-fal-webhook-timestamp'),
        signature: request.headers.get('x-fal-webhook-signature'),
      },
      rawBodyBuf,
    );
    if (!ok) {
      if (debug) {
        console.log('[fal-webhook] signature verification failed');
      }
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
    }
  }

  let payload: FalWebhookPayload;
  try {
    payload = JSON.parse(rawBodyBuf.toString('utf8')) as FalWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const requestId = payload.request_id || payload.gateway_request_id;
  if (!requestId) {
    return NextResponse.json({ error: 'missing request_id' }, { status: 400 });
  }

  const db = await getDb();
  const [job] = await db
    .select()
    .from(aiStudioJobSchema)
    .where(eq(aiStudioJobSchema.falRequestId, requestId))
    .limit(1);

  if (!job) {
    // Idempotent: no matching job means we already reconciled it or the
    // request id is stale. Nothing to do.
    return NextResponse.json({ ok: true, matched: false });
  }
  if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'canceled' || job.status === 'refunded') {
    return NextResponse.json({ ok: true, alreadyFinal: true });
  }

  await db
    .update(aiStudioJobSchema)
    .set({ webhookReceivedAt: new Date(), status: 'processing' })
    .where(eq(aiStudioJobSchema.id, job.id));

  const outcome = await reconcileFalJob({
    job,
    ok: payload.status === 'OK',
    error: payload.status === 'OK' ? undefined : await resolveFalError(payload, job),
    output: payload.payload,
  });

  return NextResponse.json({ ok: true, outcome });
}
