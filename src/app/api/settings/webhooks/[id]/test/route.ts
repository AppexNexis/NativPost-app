/**
 * POST /api/settings/webhooks/[id]/test
 *   — Fire a synthetic test payload to the endpoint AND wait for the response
 *   so the settings UI can show "delivered in Xms" / "failed: <reason>"
 *   immediately after clicking Test.
 */

import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { requirePlanFeature } from '@/lib/require-plan';
import {
  DELIVERY_ID_HEADER,
  EVENT_HEADER,
  SIGNATURE_HEADER,
  signPayload,
} from '@/lib/webhook-signing';
import { getDb } from '@/libs/DB';
import { webhookDeliverySchema, webhookEndpointSchema } from '@/models/Schema';

const TEST_TIMEOUT_MS = 8_000;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const gate = await requirePlanFeature(orgId!, 'apiAccess');
  if (gate.error) return gate.error;

  const { id } = await params;

  const db = await getDb();
  const [endpoint] = await db
    .select()
    .from(webhookEndpointSchema)
    .where(and(eq(webhookEndpointSchema.id, id), eq(webhookEndpointSchema.orgId, orgId!)))
    .limit(1);

  if (!endpoint) {
    return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
  }

  const deliveryId = crypto.randomUUID();
  const payload = {
    id: deliveryId,
    event: 'test.ping',
    created_at: new Date().toISOString(),
    data: {
      message: 'This is a test event from the NativPost dashboard.',
      endpoint_id: endpoint.id,
    },
  };
  const body = JSON.stringify(payload);
  const signature = signPayload(body, endpoint.secret);

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);

  let statusCode: number | null = null;
  let responseBody = '';
  let errorMessage: string | null = null;
  let success = false;

  try {
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'NativPost-Webhooks/1.0 (test)',
        [SIGNATURE_HEADER]: signature,
        [EVENT_HEADER]: 'test.ping',
        [DELIVERY_ID_HEADER]: deliveryId,
      },
      body,
      signal: controller.signal,
    });
    statusCode = res.status;
    responseBody = (await res.text()).slice(0, 2048);
    success = res.ok;
    if (!success) errorMessage = `HTTP ${res.status}`;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    if (controller.signal.aborted) {
      errorMessage = `Request timed out after ${TEST_TIMEOUT_MS}ms`;
    }
  } finally {
    clearTimeout(timer);
  }

  const durationMs = Date.now() - startedAt;

  await db.insert(webhookDeliverySchema).values({
    id: deliveryId,
    endpointId: endpoint.id,
    orgId: orgId!,
    event: 'test.ping',
    payload,
    statusCode,
    responseBody,
    errorMessage,
    attemptCount: 1,
    durationMs,
    status: success ? 'success' : 'failed',
    deliveredAt: success ? new Date() : null,
  });

  return NextResponse.json({
    success,
    statusCode,
    durationMs,
    errorMessage,
    deliveryId,
  });
}
