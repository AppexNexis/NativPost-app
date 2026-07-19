/**
 * GET  /api/v1/content   — list content items for the org
 * POST /api/v1/content   — create a new content item
 *
 * Query params for GET:
 *   status         single status filter (draft/pending_review/approved/scheduled/published/rejected)
 *   content_type   single content type filter
 *   limit          page size (default 25, max 100)
 *   cursor         opaque pagination cursor from a previous response
 */

import { and, desc, eq, lt, ne } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import {
  apiError,
  apiOk,
  decodeCursor,
  encodeCursor,
  paginationParams,
  serializeContent,
} from '@/lib/api-v1';
import { requireApiKey } from '@/lib/require-api-key';
import { fireWebhook } from '@/lib/webhook-dispatcher';
import { getDb } from '@/libs/DB';
import { contentItemSchema } from '@/models/Schema';

const CreateContentSchema = z.object({
  caption: z.string().min(1).max(4000),
  content_type: z.enum([
    'text_only',
    'single_image',
    'slideshow',
    'reel',
    'talking_head',
    'video_hook',
    'video_hook_demo',
    'carousel',
  ]).default('single_image'),
  hashtags: z.array(z.string().max(50)).max(50).optional(),
  topic: z.string().max(280).optional(),
  media_urls: z.array(z.string().url()).max(20).optional(),
  target_platforms: z.array(z.string()).max(10).optional(),
  platform_specific: z.record(z.string(), z.unknown()).optional(),
  aspect_ratio: z.string().max(10).optional(),
  scheduled_for: z.string().datetime().optional(),
  status: z.enum(['draft', 'pending_review', 'approved', 'scheduled']).default('draft'),
});

export async function GET(request: NextRequest) {
  const { error, ctx } = await requireApiKey(request);
  if (error) return error;

  const { limit, cursor } = paginationParams(request);
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const contentType = url.searchParams.get('content_type');

  const cursorDate = decodeCursor(cursor);

  const conditions = [
    eq(contentItemSchema.orgId, ctx.orgId),
    ne(contentItemSchema.status, 'archived'),
  ];
  if (status) conditions.push(eq(contentItemSchema.status, status));
  if (contentType) conditions.push(eq(contentItemSchema.contentType, contentType));
  if (cursorDate) conditions.push(lt(contentItemSchema.createdAt, cursorDate));

  try {
    const db = await getDb();
    const rows = await db
      .select()
      .from(contentItemSchema)
      .where(and(...conditions))
      .orderBy(desc(contentItemSchema.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && pageRows[pageRows.length - 1]
      ? encodeCursor(pageRows[pageRows.length - 1]!.createdAt)
      : null;

    return apiOk({
      object: 'list',
      data: pageRows.map(serializeContent),
      has_more: hasMore,
      next_cursor: nextCursor,
    });
  } catch (err) {
    console.error('[v1/content] GET failed', err);
    return apiError(500, 'internal', 'Failed to list content.');
  }
}

export async function POST(request: NextRequest) {
  const { error, ctx } = await requireApiKey(request);
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, 'invalid_body', 'Request body must be valid JSON.');
  }

  const parsed = CreateContentSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, 'invalid_body', 'Validation failed.', {
      details: parsed.error.flatten(),
    });
  }

  try {
    const db = await getDb();
    const [row] = await db
      .insert(contentItemSchema)
      .values({
        orgId: ctx.orgId,
        caption: parsed.data.caption,
        contentType: parsed.data.content_type,
        hashtags: parsed.data.hashtags ?? [],
        topic: parsed.data.topic ?? null,
        graphicUrls: parsed.data.media_urls ?? [],
        targetPlatforms: parsed.data.target_platforms ?? [],
        platformSpecific: parsed.data.platform_specific ?? {},
        aspectRatio: parsed.data.aspect_ratio ?? null,
        scheduledFor: parsed.data.scheduled_for ? new Date(parsed.data.scheduled_for) : null,
        status: parsed.data.status,
      })
      .returning();

    if (!row) return apiError(500, 'internal', 'Insert returned no row.');

    const serialized = serializeContent(row);
    await fireWebhook(ctx.orgId, 'content.created', { content: serialized });

    return apiOk(serialized, { status: 201 });
  } catch (err) {
    console.error('[v1/content] POST failed', err);
    return apiError(500, 'internal', 'Failed to create content.');
  }
}
