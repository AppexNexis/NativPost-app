import { desc, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { mediaAssetSchema } from '@/models/Schema';

type RouteParams = { params: Promise<{ id: string }> };

// -----------------------------------------------------------
// GET /api/ai-influencers/[id]/media
// Returns recently generated clips/assets for an influencer.
// -----------------------------------------------------------
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

  const rows = await db
    .select()
    .from(mediaAssetSchema)
    .where(eq(mediaAssetSchema.influencerId, id))
    .orderBy(desc(mediaAssetSchema.createdAt))
    .limit(12);

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      url: r.url,
      thumbnailUrl: r.thumbnailUrl,
      assetType: r.assetType,
      aspectRatio: r.aspectRatio,
      durationSeconds: r.durationSeconds,
      width: r.width,
      height: r.height,
      createdAt: r.createdAt,
    })),
  });
}
