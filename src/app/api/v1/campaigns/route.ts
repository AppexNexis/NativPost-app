/**
 * GET  /api/v1/campaigns   — list campaigns for the org
 * POST /api/v1/campaigns   — create a campaign (draft status)
 */

import { and, desc, eq, lt } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import {
  apiError,
  apiOk,
  decodeCursor,
  encodeCursor,
  paginationParams,
  serializeCampaign,
} from '@/lib/api-v1';
import { requireApiKey } from '@/lib/require-api-key';
import { getDb } from '@/libs/DB';
import { campaignSchema } from '@/models/Schema';

const CreateCampaignSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(1000).optional(),
  posts_per_day: z.number().int().positive().max(50).default(3),
  campaign_length_days: z.number().int().positive().max(365).default(7),
  start_date: z.string().datetime().optional(),
  content_mix: z.record(z.string(), z.number()).optional(),
});

export async function GET(request: NextRequest) {
  const { error, ctx } = await requireApiKey(request);
  if (error) return error;

  const { limit, cursor } = paginationParams(request);
  const cursorDate = decodeCursor(cursor);
  const conditions = [eq(campaignSchema.orgId, ctx.orgId)];
  if (cursorDate) conditions.push(lt(campaignSchema.createdAt, cursorDate));

  const db = await getDb();
  const rows = await db
    .select()
    .from(campaignSchema)
    .where(and(...conditions))
    .orderBy(desc(campaignSchema.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && pageRows[pageRows.length - 1]
    ? encodeCursor(pageRows[pageRows.length - 1]!.createdAt)
    : null;

  return apiOk({
    object: 'list',
    data: pageRows.map(serializeCampaign),
    has_more: hasMore,
    next_cursor: nextCursor,
  });
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
  const parsed = CreateCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, 'invalid_body', 'Validation failed.', { details: parsed.error.flatten() });
  }

  const totalPosts = parsed.data.posts_per_day * parsed.data.campaign_length_days;

  const db = await getDb();
  const [row] = await db
    .insert(campaignSchema)
    .values({
      orgId: ctx.orgId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      postsPerDay: parsed.data.posts_per_day,
      campaignLengthDays: parsed.data.campaign_length_days,
      startDate: parsed.data.start_date ? new Date(parsed.data.start_date) : null,
      contentMix: parsed.data.content_mix ?? {},
      totalPosts,
    })
    .returning();

  if (!row) return apiError(500, 'internal', 'Insert returned no row.');
  return apiOk(serializeCampaign(row), { status: 201 });
}
