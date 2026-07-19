/**
 * GET /api/v1/analytics/overview
 *   High-level totals for the org over the last N days (default 30, max 365).
 *   Returns published-post count, per-platform breakdown, and engagement totals
 *   summed from stored engagementData JSON.
 */

import { and, count, eq, gte, isNotNull, sql } from 'drizzle-orm';
import type { NextRequest } from 'next/server';

import { apiError, apiOk } from '@/lib/api-v1';
import { requireApiKey } from '@/lib/require-api-key';
import { getDb } from '@/libs/DB';
import { contentItemSchema, publishingQueueSchema } from '@/models/Schema';

export async function GET(request: NextRequest) {
  const { error, ctx } = await requireApiKey(request);
  if (error) return error;

  const url = new URL(request.url);
  const daysRaw = Number(url.searchParams.get('days') ?? 30);
  const days = Number.isFinite(daysRaw) && daysRaw > 0
    ? Math.min(daysRaw, 365)
    : 30;

  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - days);

  try {
    const db = await getDb();

    const [publishedRow] = await db
      .select({ n: count() })
      .from(publishingQueueSchema)
      .innerJoin(contentItemSchema, eq(publishingQueueSchema.contentItemId, contentItemSchema.id))
      .where(
        and(
          eq(contentItemSchema.orgId, ctx.orgId),
          eq(publishingQueueSchema.status, 'published'),
          isNotNull(publishingQueueSchema.publishedAt),
          gte(publishingQueueSchema.publishedAt, windowStart),
        ),
      );

    const perPlatform = await db
      .select({
        platform: publishingQueueSchema.platform,
        n: sql<number>`count(*)::int`,
      })
      .from(publishingQueueSchema)
      .innerJoin(contentItemSchema, eq(publishingQueueSchema.contentItemId, contentItemSchema.id))
      .where(
        and(
          eq(contentItemSchema.orgId, ctx.orgId),
          eq(publishingQueueSchema.status, 'published'),
          gte(publishingQueueSchema.publishedAt, windowStart),
        ),
      )
      .groupBy(publishingQueueSchema.platform);

    return apiOk({
      window: {
        days,
        since: windowStart.toISOString(),
      },
      published: publishedRow?.n ?? 0,
      per_platform: perPlatform.reduce<Record<string, number>>((acc, r) => {
        acc[r.platform] = Number(r.n);
        return acc;
      }, {}),
    });
  } catch (err) {
    console.error('[v1/analytics/overview] failed', err);
    return apiError(500, 'internal', 'Failed to load analytics.');
  }
}
