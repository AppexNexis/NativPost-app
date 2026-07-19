/**
 * GET /api/v1/templates
 *   Read-only listing of trending content templates from the shared library.
 *   Filters: source_platform, content_type, is_active. Cursor-paginated.
 */

import { and, desc, eq, lt } from 'drizzle-orm';
import type { NextRequest } from 'next/server';

import {
  apiOk,
  decodeCursor,
  encodeCursor,
  paginationParams,
  serializeTemplate,
} from '@/lib/api-v1';
import { requireApiKey } from '@/lib/require-api-key';
import { getDb } from '@/libs/DB';
import { contentTemplateSchema } from '@/models/Schema';

export async function GET(request: NextRequest) {
  const { error } = await requireApiKey(request);
  if (error) return error;

  const { limit, cursor } = paginationParams(request);
  const url = new URL(request.url);
  const sourcePlatform = url.searchParams.get('source_platform');
  const contentType = url.searchParams.get('content_type');

  const cursorDate = decodeCursor(cursor);
  const conditions = [eq(contentTemplateSchema.isActive, true)];
  if (sourcePlatform) conditions.push(eq(contentTemplateSchema.sourcePlatform, sourcePlatform));
  if (contentType) conditions.push(eq(contentTemplateSchema.contentType, contentType));
  if (cursorDate) conditions.push(lt(contentTemplateSchema.createdAt, cursorDate));

  const db = await getDb();
  const rows = await db
    .select()
    .from(contentTemplateSchema)
    .where(and(...conditions))
    .orderBy(desc(contentTemplateSchema.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && pageRows[pageRows.length - 1]
    ? encodeCursor(pageRows[pageRows.length - 1]!.createdAt)
    : null;

  return apiOk({
    object: 'list',
    data: pageRows.map(serializeTemplate),
    has_more: hasMore,
    next_cursor: nextCursor,
  });
}
