/**
 * GET /api/settings/webhooks/[id]/deliveries?limit=25
 *   — Return the most recent delivery attempts for one endpoint.
 *   Used by the settings UI to render a delivery log per webhook.
 */

import { and, desc, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { requirePlanFeature } from '@/lib/require-plan';
import { getDb } from '@/libs/DB';
import { webhookDeliverySchema, webhookEndpointSchema } from '@/models/Schema';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const gate = await requirePlanFeature(orgId!, 'apiAccess');
  if (gate.error) return gate.error;

  const { id } = await params;
  const limit = Math.min(
    Math.max(Number(request.nextUrl.searchParams.get('limit') ?? 25), 1),
    100,
  );

  const db = await getDb();

  // Confirm the endpoint belongs to this org before returning delivery rows.
  const [endpoint] = await db
    .select({ id: webhookEndpointSchema.id })
    .from(webhookEndpointSchema)
    .where(and(eq(webhookEndpointSchema.id, id), eq(webhookEndpointSchema.orgId, orgId!)))
    .limit(1);

  if (!endpoint) {
    return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
  }

  const rows = await db
    .select({
      id: webhookDeliverySchema.id,
      event: webhookDeliverySchema.event,
      statusCode: webhookDeliverySchema.statusCode,
      status: webhookDeliverySchema.status,
      errorMessage: webhookDeliverySchema.errorMessage,
      durationMs: webhookDeliverySchema.durationMs,
      attemptCount: webhookDeliverySchema.attemptCount,
      deliveredAt: webhookDeliverySchema.deliveredAt,
      createdAt: webhookDeliverySchema.createdAt,
    })
    .from(webhookDeliverySchema)
    .where(eq(webhookDeliverySchema.endpointId, id))
    .orderBy(desc(webhookDeliverySchema.createdAt))
    .limit(limit);

  return NextResponse.json({ deliveries: rows });
}
