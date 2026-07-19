/**
 * GET /api/v1/media-library
 *   Lists media assets owned by the org. Cursor-paginated.
 *   Filter: asset_type (image | video)
 */

import { and, desc, eq, lt } from 'drizzle-orm';
import type { NextRequest } from 'next/server';

import {
  apiOk,
  decodeCursor,
  encodeCursor,
  paginationParams,
  serializeMediaAsset,
} from '@/lib/api-v1';
import { requireApiKey } from '@/lib/require-api-key';
import { getDb } from '@/libs/DB';
import { mediaAssetSchema } from '@/models/Schema';

export async function GET(request: NextRequest) {
  const { error, ctx } = await requireApiKey(request);
  if (error) return error;

  const { limit, cursor } = paginationParams(request);
  const url = new URL(request.url);
  const assetType = url.searchParams.get('asset_type');

  const cursorDate = decodeCursor(cursor);
  const conditions = [eq(mediaAssetSchema.orgId, ctx.orgId)];
  if (assetType) conditions.push(eq(mediaAssetSchema.assetType, assetType));
  if (cursorDate) conditions.push(lt(mediaAssetSchema.createdAt, cursorDate));

  const db = await getDb();
  const rows = await db
    .select()
    .from(mediaAssetSchema)
    .where(and(...conditions))
    .orderBy(desc(mediaAssetSchema.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && pageRows[pageRows.length - 1]
    ? encodeCursor(pageRows[pageRows.length - 1]!.createdAt)
    : null;

  return apiOk({
    object: 'list',
    data: pageRows.map(serializeMediaAsset),
    has_more: hasMore,
    next_cursor: nextCursor,
  });
}
