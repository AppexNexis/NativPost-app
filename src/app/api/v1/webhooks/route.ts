/**
 * GET /api/v1/webhooks
 *   Read-only listing of webhook endpoints configured for the calling org.
 *   Secrets are OMITTED — those live only in the dashboard.
 *   Create/update/delete happens in-dashboard (Pro plan settings).
 */

import { desc, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';

import { apiOk, serializeWebhook } from '@/lib/api-v1';
import { requireApiKey } from '@/lib/require-api-key';
import { getDb } from '@/libs/DB';
import { webhookEndpointSchema } from '@/models/Schema';

export async function GET(request: NextRequest) {
  const { error, ctx } = await requireApiKey(request);
  if (error) return error;

  const db = await getDb();
  const rows = await db
    .select()
    .from(webhookEndpointSchema)
    .where(eq(webhookEndpointSchema.orgId, ctx.orgId))
    .orderBy(desc(webhookEndpointSchema.createdAt));

  return apiOk({
    object: 'list',
    data: rows.map(serializeWebhook),
    has_more: false,
    next_cursor: null,
  });
}
