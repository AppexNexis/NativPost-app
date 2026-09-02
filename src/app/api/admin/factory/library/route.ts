// Content Factory API — Library
// Searchable content library with semantic search + filters

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import {
  mediaAssetSchema,
  assetTagSchema,
  tagSchema,
} from '@/models/Schema';
import { eq, and, desc, sql } from 'drizzle-orm';

// ─── Admin Guard ─────────────────────────────────────────────────────────────

const NATIVPOST_TEAM_ORG_ID = process.env.NEXT_PUBLIC_NATIVPOST_TEAM_ORG_ID;

async function requireAdmin() {
  const { userId, orgId, orgRole } = await auth();

  if (!userId || !orgId) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      orgId: null,
    };
  }

  if (orgId !== NATIVPOST_TEAM_ORG_ID || orgRole !== 'org:admin') {
    return {
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      orgId: null,
    };
  }

  return { error: null, orgId };
}

// ─── GET /api/admin/factory/library ──────────────────────────────────────────

export async function GET(req: Request) {
  const { error, orgId } = await requireAdmin();
  if (error) return error;

  try {
    const { searchParams } = new URL(req.url);

    // Parse filters
    const assetType = searchParams.get('assetType');
    const status = searchParams.get('status');
    const tags = searchParams.get('tags')?.split(',').filter(Boolean);
    const qualityMin = searchParams.get('qualityMin');
    const qualityMax = searchParams.get('qualityMax');
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') ?? '50', 10);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10);

    // Build where conditions
    const conditions = [eq(mediaAssetSchema.orgId, orgId!)];

    if (assetType) {
      conditions.push(eq(mediaAssetSchema.assetType, assetType));
    }

    if (status) {
      conditions.push(eq(mediaAssetSchema.status, status));
    }

    if (qualityMin) {
      conditions.push(sql`${mediaAssetSchema.qualityScore} >= ${parseFloat(qualityMin)}`);
    }

    if (qualityMax) {
      conditions.push(sql`${mediaAssetSchema.qualityScore} <= ${parseFloat(qualityMax)}`);
    }

    if (search) {
      conditions.push(sql`${mediaAssetSchema.url} ILIKE ${`%${search}%`}`);
    }

    // Fetch assets
    const assets = await db
      .select({
        id: mediaAssetSchema.id,
        url: mediaAssetSchema.url,
        assetType: mediaAssetSchema.assetType,
        status: mediaAssetSchema.status,
        qualityScore: mediaAssetSchema.qualityScore,
        durationSeconds: mediaAssetSchema.durationSeconds,
        hasAudio: mediaAssetSchema.hasAudio,
        audioStatus: mediaAssetSchema.audioStatus,
        aspectRatio: mediaAssetSchema.aspectRatio,
        fileSize: mediaAssetSchema.fileSize,
        createdAt: mediaAssetSchema.createdAt,
      })
      .from(mediaAssetSchema)
      .where(and(...conditions))
      .orderBy(desc(mediaAssetSchema.createdAt))
      .limit(limit)
      .offset(offset);

    // Fetch tags for each asset
    const assetsWithTags = await Promise.all(
      assets.map(async (asset) => {
        const assetTags = await db
          .select({
            tagId: assetTagSchema.tagId,
            confidence: assetTagSchema.confidence,
            tagName: tagSchema.name,
            tagType: tagSchema.type,
          })
          .from(assetTagSchema)
          .innerJoin(tagSchema, eq(assetTagSchema.tagId, tagSchema.id))
          .where(eq(assetTagSchema.assetId, asset.id));

        return {
          ...asset,
          tags: assetTags.map(t => ({
            id: t.tagId,
            name: t.tagName,
            type: t.tagType,
            confidence: t.confidence,
          })),
        };
      }),
    );

    // Filter by tags if specified
    let filteredAssets = assetsWithTags;
    if (tags && tags.length > 0) {
      filteredAssets = assetsWithTags.filter(asset =>
        tags.some(tag =>
          asset.tags.some(t =>
            t.name.toLowerCase().includes(tag.toLowerCase()),
          ),
        ),
      );
    }

    // Get total count for pagination
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(mediaAssetSchema)
      .where(and(...conditions));

    const total = totalResult[0]?.count ?? 0;

    return NextResponse.json({
      assets: filteredAssets,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
      filters: {
        assetType,
        status,
        tags,
        qualityMin,
        qualityMax,
        search,
      },
    });
  } catch (err) {
    console.error('Library error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
