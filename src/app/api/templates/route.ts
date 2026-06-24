import { eq, and, desc, sql } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { contentTemplateSchema } from '@/models/Schema';

// -----------------------------------------------------------
// GET /api/templates
// List content templates with filtering
// Query params:
//   ?contentType=slideshow&niche=b2b_saas&platform=tiktok&limit=20&offset=0&sort=engagement
// -----------------------------------------------------------
export async function GET(request: NextRequest) {
  const db = await getDb();
  // const { error, orgId } = await getAuthContext();
  const { error } = await getAuthContext();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const contentType = searchParams.get('contentType');
  const niche = searchParams.get('niche');
  const platform = searchParams.get('platform');
  const angle = searchParams.get('angle');
  const status = searchParams.get('status') || 'approved';
  const sort = searchParams.get('sort') || 'engagement';
  const limit = Math.min(Number(searchParams.get('limit')) || 20, 100);
  const offset = Number(searchParams.get('offset')) || 0;

  try {
    const conditions = [
      eq(contentTemplateSchema.curationStatus, status),
      eq(contentTemplateSchema.isActive, true),
    ];

    if (contentType) {
      conditions.push(eq(contentTemplateSchema.contentType, contentType));
    }
    if (platform) {
      conditions.push(eq(contentTemplateSchema.sourcePlatform, platform));
    }
    if (niche) {
      conditions.push(sql`${contentTemplateSchema.niches} @> ${JSON.stringify([niche])}::jsonb`);
    }
    if (angle) {
      conditions.push(sql`${contentTemplateSchema.angles} @> ${JSON.stringify([angle])}::jsonb`);
    }

    let orderBy;
    switch (sort) {
      case 'engagement':
        orderBy = desc(contentTemplateSchema.engagementScore);
        break;
      case 'remixes':
        orderBy = desc(contentTemplateSchema.remixCount);
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
      .where(and(...conditions))
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(contentTemplateSchema)
      .where(and(...conditions));

    return NextResponse.json({
      items,
      total: countResult[0]?.count ?? 0,
      limit,
      offset,
    }, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch templates:', err);
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// POST /api/templates
// Create a new content template (admin/curation use)
// Body: full template object
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const db = await getDb();
  // const { error, orgId } = await getAuthContext();
  const { error } = await getAuthContext();
  if (error) return error;

  try {
    const body = await request.json();

    const [created] = await db
      .insert(contentTemplateSchema)
      .values({
        sourceUrl: body.sourceUrl,
        sourcePlatform: body.sourcePlatform,
        sourceCreator: body.sourceCreator || null,
        sourceVideoId: body.sourceVideoId || null,
        mediaUrl: body.mediaUrl || null,
        thumbnailUrl: body.thumbnailUrl,
        thumbnailUrls: body.thumbnailUrls || {},
        durationSeconds: body.durationSeconds || null,
        contentType: body.contentType,
        niches: body.niches || [],
        angles: body.angles || [],
        structure: body.structure || {},
        engagementScore: body.engagementScore || null,
        viewCount: body.viewCount || null,
        likeCount: body.likeCount || null,
        shareCount: body.shareCount || null,
        commentCount: body.commentCount || null,
        curationStatus: body.curationStatus || 'pending',
        curatedBy: body.curatedBy || null,
        curatedAt: body.curatedAt ? new Date(body.curatedAt) : null,
        trainingUsed: body.trainingUsed || false,
      })
      .returning();

    return NextResponse.json({ item: created }, { status: 201 });
  } catch (err) {
    console.error('Failed to create template:', err);
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
}
