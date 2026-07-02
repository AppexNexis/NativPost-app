import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { contentTemplateSchema } from '@/models/Schema';
import type { ContentTemplate, ContentType, NicheTag, SourcePlatform } from '@/types/v2';

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serializeTemplate(item: typeof contentTemplateSchema.$inferSelect): ContentTemplate {
  return {
    ...item,
    // content_template has no aspect_ratio column; templates are 9:16 by
    // convention. Surface as null so the frontend type stays satisfied.
    aspectRatio: null,
    sourcePlatform: item.sourcePlatform as ContentTemplate['sourcePlatform'],
    contentType: item.contentType as ContentTemplate['contentType'],
    niches: (item.niches ?? []) as ContentTemplate['niches'],
    angles: (item.angles ?? []) as string[],
    structure: (item.structure ?? {}) as ContentTemplate['structure'],
    thumbnailUrls: (item.thumbnailUrls ?? {}) as Record<string, string>,
    slideCaptions: (item.slideCaptions ?? {}) as Record<string, string>,
    addedAt: item.addedAt?.toISOString() ?? new Date().toISOString(),
    curatedAt: item.curatedAt?.toISOString() ?? null,
    lastRefreshedAt: item.lastRefreshedAt?.toISOString() ?? null,
    updatedAt: item.updatedAt?.toISOString() ?? new Date().toISOString(),
    createdAt: item.createdAt?.toISOString() ?? new Date().toISOString(),
  } as ContentTemplate;
}

export async function GET(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();

  if (error || !orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  const page = Math.max(1, Number(searchParams.get('page') ?? 1));
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(searchParams.get('limit') ?? DEFAULT_LIMIT)));
  const offset = (page - 1) * limit;

  const contentType = searchParams.get('contentType') as ContentType | null;
  const niche = searchParams.get('niche') as NicheTag | null;
  const platform = searchParams.get('platform') as SourcePlatform | null;
  const angle = searchParams.get('angle');
  const search = searchParams.get('search')?.trim().toLowerCase();
  const sort = searchParams.get('sort') as 'engagement' | 'remixes' | 'newest' | null;

  const conditions = [
    eq(contentTemplateSchema.curationStatus, 'approved'),
    eq(contentTemplateSchema.isActive, true),
  ];

  if (contentType) {
    conditions.push(eq(contentTemplateSchema.contentType, contentType));
  }
  if (niche) {
    conditions.push(sql`${contentTemplateSchema.niches} @> ${JSON.stringify([niche])}::jsonb`);
  }
  if (platform) {
    conditions.push(eq(contentTemplateSchema.sourcePlatform, platform));
  }
  if (angle) {
    conditions.push(sql`${contentTemplateSchema.angles} @> ${JSON.stringify([angle])}::jsonb`);
  }
  if (search) {
    const likePattern = `%${search}%`;
    conditions.push(
      or(
        ilike(contentTemplateSchema.sourceCreator, likePattern),
        ilike(contentTemplateSchema.contentType, likePattern),
        sql`${contentTemplateSchema.niches}::text ILIKE ${likePattern}`,
        sql`${contentTemplateSchema.angles}::text ILIKE ${likePattern}`,
      )!,
    );
  }

  const where = and(...conditions);

  let orderBy;
  switch (sort) {
    case 'remixes':
      orderBy = desc(contentTemplateSchema.remixCount);
      break;
    case 'newest':
      orderBy = desc(contentTemplateSchema.createdAt);
      break;
    default:
      orderBy = desc(contentTemplateSchema.engagementScore);
  }

  try {
    const [countResult, items] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(contentTemplateSchema)
        .where(where),
      db
        .select()
        .from(contentTemplateSchema)
        .where(where)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
    ]);

    const total = countResult[0]?.count ?? 0;
    const templates = items.map(serializeTemplate);

    return NextResponse.json({
      templates,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    });
  } catch (err) {
    console.error('[Templates API] Failed to fetch templates:', err);
    return NextResponse.json(
      { error: 'Failed to fetch templates' },
      { status: 500 },
    );
  }
}
