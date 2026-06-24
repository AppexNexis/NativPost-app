import { eq, and, desc, sql } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { mediaAssetSchema } from '@/models/Schema';

// -----------------------------------------------------------
// GET /api/media-assets
// List media assets for the current org
// Query params: ?assetType=video&aspectRatio=9:16&tag=branded&limit=20&offset=0
// -----------------------------------------------------------
export async function GET(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const assetType = searchParams.get('assetType');
  const aspectRatio = searchParams.get('aspectRatio');
  const tag = searchParams.get('tag');
  const source = searchParams.get('source');
  const limit = Math.min(Number(searchParams.get('limit')) || 20, 100);
  const offset = Number(searchParams.get('offset')) || 0;

  try {
    const conditions = [eq(mediaAssetSchema.orgId, orgId!)];

    if (assetType) {
      conditions.push(eq(mediaAssetSchema.assetType, assetType));
    }
    if (aspectRatio) {
      conditions.push(eq(mediaAssetSchema.aspectRatio, aspectRatio));
    }
    if (source) {
      conditions.push(eq(mediaAssetSchema.source, source));
    }
    if (tag) {
      conditions.push(sql`${mediaAssetSchema.tags} @> ${JSON.stringify([tag])}::jsonb`);
    }

    const items = await db
      .select()
      .from(mediaAssetSchema)
      .where(and(...conditions))
      .orderBy(desc(mediaAssetSchema.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(mediaAssetSchema)
      .where(and(...conditions));

    return NextResponse.json({
      items,
      total: countResult[0]?.count ?? 0,
      limit,
      offset,
    }, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch media assets:', err);
    return NextResponse.json({ error: 'Failed to fetch media assets' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// POST /api/media-assets
// Create a new media asset record (after upload)
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  try {
    const body = await request.json();

    const [created] = await db
      .insert(mediaAssetSchema)
      .values({
        orgId: orgId!,
        uploadcareUuid: body.uploadcareUuid || null,
        url: body.url,
        thumbnailUrl: body.thumbnailUrl || null,
        assetType: body.assetType,
        mimeType: body.mimeType || null,
        fileSize: body.fileSize || null,
        width: body.width || null,
        height: body.height || null,
        aspectRatio: body.aspectRatio || null,
        durationSeconds: body.durationSeconds || null,
        tags: body.tags || [],
        description: body.description || null,
        source: body.source || 'upload',
        aiMetadata: body.aiMetadata || {},
      })
      .returning();

    return NextResponse.json({ item: created }, { status: 201 });
  } catch (err) {
    console.error('Failed to create media asset:', err);
    return NextResponse.json({ error: 'Failed to create media asset' }, { status: 500 });
  }
}
