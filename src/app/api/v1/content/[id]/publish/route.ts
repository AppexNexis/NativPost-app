/**
 * POST /api/v1/content/[id]/publish
 *
 *   Marks the content approved and enqueues it for immediate publishing
 *   via the existing publishing queue. The internal cron worker picks it
 *   up on its next tick (typically <60s). Returns 202 Accepted with the
 *   updated content object so callers can poll for status=published.
 *
 *   Body is optional. If `scheduled_for` is provided, the item is
 *   scheduled instead of published now.
 */

import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { apiError, apiOk, serializeContent } from '@/lib/api-v1';
import { requireApiKey } from '@/lib/require-api-key';
import { fireWebhook } from '@/lib/webhook-dispatcher';
import { getDb } from '@/libs/DB';
import { contentItemSchema } from '@/models/Schema';

const PublishSchema = z.object({
  scheduled_for: z.string().datetime().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { error, ctx } = await requireApiKey(request);
  if (error) return error;

  const { id } = await params;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is allowed.
  }
  const parsed = PublishSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, 'invalid_body', 'Validation failed.', { details: parsed.error.flatten() });
  }

  const db = await getDb();
  const [existing] = await db
    .select({
      id: contentItemSchema.id,
      status: contentItemSchema.status,
      targetPlatforms: contentItemSchema.targetPlatforms,
    })
    .from(contentItemSchema)
    .where(and(eq(contentItemSchema.id, id), eq(contentItemSchema.orgId, ctx.orgId)))
    .limit(1);

  if (!existing) return apiError(404, 'not_found', 'Content not found.');

  const platforms = (existing.targetPlatforms as string[] | null) ?? [];
  if (platforms.length === 0) {
    return apiError(
      422,
      'no_target_platforms',
      'Set target_platforms on the content item before publishing.',
    );
  }

  const scheduledFor = parsed.data.scheduled_for
    ? new Date(parsed.data.scheduled_for)
    : new Date();

  const newStatus = parsed.data.scheduled_for ? 'scheduled' : 'approved';

  const [row] = await db
    .update(contentItemSchema)
    .set({
      status: newStatus,
      scheduledFor,
    })
    .where(and(eq(contentItemSchema.id, id), eq(contentItemSchema.orgId, ctx.orgId)))
    .returning();

  if (!row) return apiError(500, 'internal', 'Failed to update content.');

  const serialized = serializeContent(row);
  await fireWebhook(ctx.orgId, 'content.approved', { content: serialized });

  return apiOk(
    { ...serialized, publish_queued: true },
    { status: 202 },
  );
}
