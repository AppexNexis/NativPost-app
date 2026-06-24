import { eq, and, desc, gte } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { contentTemplateSchema } from '@/models/Schema';

// -----------------------------------------------------------
// GET /api/analytics/templates
// Query: ?timeRange=30d&sortBy=remixes|engagement|newest
// -----------------------------------------------------------
export async function GET(request: NextRequest) {
  const db = await getDb();
  const { error } = await getAuthContext();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const timeRange = searchParams.get('timeRange') || '30d';
  const sortBy = searchParams.get('sortBy') || 'engagement';

  const days = Number(timeRange.replace('d', '')) || 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    let orderBy;
    switch (sortBy) {
      case 'remixes':
        orderBy = desc(contentTemplateSchema.remixCount);
        break;
      case 'engagement':
        orderBy = desc(contentTemplateSchema.engagementScore);
        break;
      case 'newest':
        orderBy = desc(contentTemplateSchema.createdAt);
        break;
      default:
        orderBy = desc(contentTemplateSchema.engagementScore);
    }

    const items = await db
      .select()
      .from(contentTemplateSchema)
      .where(
        and(
          eq(contentTemplateSchema.curationStatus, 'approved'),
          eq(contentTemplateSchema.isActive, true),
          gte(contentTemplateSchema.createdAt, since),
        ),
      )
      .orderBy(orderBy)
      .limit(100);

    // Calculate trending flag (top 20% by engagement score in this period)
    const sortedByEngagement = [...items].sort((a, b) =>
      (b.engagementScore || 0) - (a.engagementScore || 0)
    );
    const top20Index = Math.floor(sortedByEngagement.length * 0.2);
    const trendingIds = new Set(
      sortedByEngagement.slice(0, Math.max(1, top20Index)).map((i) => i.id)
    );

    const templates = items.map((item) => ({
      id: item.id,
      sourceUrl: item.sourceUrl,
      sourcePlatform: item.sourcePlatform,
      thumbnailUrl: item.thumbnailUrl,
      contentType: item.contentType,
      niches: item.niches,
      angles: item.angles,
      remixCount: item.remixCount,
      publishCount: item.publishCount,
      avgRemixPerformance: item.avgRemixPerformance,
      engagementScore: item.engagementScore,
      trending: trendingIds.has(item.id),
      createdAt: item.createdAt,
    }));

    return NextResponse.json({ templates }, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch template analytics:', err);
    return NextResponse.json({ error: 'Failed to fetch template analytics' }, { status: 500 });
  }
}
