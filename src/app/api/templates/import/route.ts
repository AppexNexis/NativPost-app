// import { sql, eq, and, desc } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { contentTemplateSchema } from '@/models/Schema';

// -----------------------------------------------------------
// POST /api/templates/import
// Bulk import templates (admin use)
// Body: { templates: Array<templateData> }
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const db = await getDb();
  const { error } = await getAuthContext();
  if (error) return error;

  try {
    const body = await request.json();
    const { templates } = body as { templates: any[] };

    if (!Array.isArray(templates) || templates.length === 0) {
      return NextResponse.json(
        { error: 'templates array is required' },
        { status: 400 }
      );
    }

    const values = templates.map((t) => ({
      sourceUrl: t.sourceUrl,
      sourcePlatform: t.sourcePlatform || 'unknown',
      sourceCreator: t.sourceCreator || null,
      sourceVideoId: t.sourceVideoId || null,
      mediaUrl: t.mediaUrl || null,
      thumbnailUrl: t.thumbnailUrl,
      thumbnailUrls: t.thumbnailUrls || {},
      durationSeconds: t.durationSeconds || null,
      contentType: t.contentType || 'custom',
      niches: t.niches || [],
      angles: t.angles || [],
      structure: t.structure || {},
      engagementScore: t.engagementScore || null,
      viewCount: t.viewCount || null,
      likeCount: t.likeCount || null,
      shareCount: t.shareCount || null,
      commentCount: t.commentCount || null,
      curationStatus: t.curationStatus || 'pending',
      curatedBy: t.curatedBy || null,
      curatedAt: t.curatedAt ? new Date(t.curatedAt) : null,
      trainingUsed: t.trainingUsed || false,
    }));

    const inserted = await db
      .insert(contentTemplateSchema)
      .values(values)
      .returning();

    return NextResponse.json({
      importedCount: inserted.length,
      items: inserted,
    }, { status: 201 });
  } catch (err) {
    console.error('Failed to import templates:', err);
    return NextResponse.json({ error: 'Failed to import templates' }, { status: 500 });
  }
}
