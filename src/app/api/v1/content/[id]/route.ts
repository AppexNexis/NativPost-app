/**
 * GET    /api/v1/content/[id]  — fetch one content item
 * PATCH  /api/v1/content/[id]  — update mutable fields
 * DELETE /api/v1/content/[id]  — soft-archive (status='archived')
 */

import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { apiError, apiOk, serializeContent } from '@/lib/api-v1';
import { requireApiKey } from '@/lib/require-api-key';
import { fireWebhook } from '@/lib/webhook-dispatcher';
import { getDb } from '@/libs/DB';
import { contentItemSchema } from '@/models/Schema';

const PatchSchema = z.object({
  caption: z.string().min(1).max(4000).optional(),
  hashtags: z.array(z.string().max(50)).max(50).optional(),
  topic: z.string().max(280).nullable().optional(),
  media_urls: z.array(z.string().url()).max(20).optional(),
  target_platforms: z.array(z.string()).max(10).optional(),
  platform_specific: z.record(z.string(), z.unknown()).optional(),
  aspect_ratio: z.string().max(10).nullable().optional(),
  scheduled_for: z.string().datetime().nullable().optional(),
  status: z.enum(['draft', 'pending_review', 'approved', 'scheduled', 'rejected']).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { error, ctx } = await requireApiKey(request);
  if (error) return error;

  const { id } = await params;
  const db = await getDb();

  const [row] = await db
    .select()
    .from(contentItemSchema)
    .where(and(eq(contentItemSchema.id, id), eq(contentItemSchema.orgId, ctx.orgId)))
    .limit(1);

  if (!row) return apiError(404, 'not_found', 'Content not found.');
  return apiOk(serializeContent(row));
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { error, ctx } = await requireApiKey(request);
  if (error) return error;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, 'invalid_body', 'Request body must be valid JSON.');
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, 'invalid_body', 'Validation failed.', { details: parsed.error.flatten() });
  }

  const updates: Record<string, unknown> = {};
  const d = parsed.data;
  if (d.caption !== undefined) updates.caption = d.caption;
  if (d.hashtags !== undefined) updates.hashtags = d.hashtags;
  if (d.topic !== undefined) updates.topic = d.topic;
  if (d.media_urls !== undefined) updates.graphicUrls = d.media_urls;
  if (d.target_platforms !== undefined) updates.targetPlatforms = d.target_platforms;
  if (d.platform_specific !== undefined) updates.platformSpecific = d.platform_specific;
  if (d.aspect_ratio !== undefined) updates.aspectRatio = d.aspect_ratio;
  if (d.scheduled_for !== undefined) {
    updates.scheduledFor = d.scheduled_for ? new Date(d.scheduled_for) : null;
  }
  if (d.status !== undefined) updates.status = d.status;

  if (Object.keys(updates).length === 0) {
    return apiError(400, 'no_updates', 'Request body has no updatable fields.');
  }

  try {
    const db = await getDb();
    const [row] = await db
      .update(contentItemSchema)
      .set(updates)
      .where(and(eq(contentItemSchema.id, id), eq(contentItemSchema.orgId, ctx.orgId)))
      .returning();

    if (!row) return apiError(404, 'not_found', 'Content not found.');

    const serialized = serializeContent(row);
    await fireWebhook(ctx.orgId, 'content.updated', { content: serialized });
    if (d.status === 'approved') {
      await fireWebhook(ctx.orgId, 'content.approved', { content: serialized });
    }

    return apiOk(serialized);
  } catch (err) {
    console.error('[v1/content/[id]] PATCH failed', err);
    return apiError(500, 'internal', 'Failed to update content.');
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { error, ctx } = await requireApiKey(request);
  if (error) return error;

  const { id } = await params;
  const db = await getDb();

  const [row] = await db
    .update(contentItemSchema)
    .set({ status: 'archived' })
    .where(and(eq(contentItemSchema.id, id), eq(contentItemSchema.orgId, ctx.orgId)))
    .returning({ id: contentItemSchema.id });

  if (!row) return apiError(404, 'not_found', 'Content not found.');

  await fireWebhook(ctx.orgId, 'content.deleted', { id });

  return apiOk({ id, object: 'content', deleted: true });
}
