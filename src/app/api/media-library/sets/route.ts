import { asc, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { mediaSetSchema } from '@/models/Schema';
import { CURATED_THEMES } from '@/libs/curatedThemes'; // Restored import

// ---------------------------------------------------------------------------
// GET — list sets for the current org
// ---------------------------------------------------------------------------
export async function GET() {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  try {
    const setRows = await db
      .select()
      .from(mediaSetSchema)
      .where(eq(mediaSetSchema.orgId, orgId!))
      .orderBy(asc(mediaSetSchema.createdAt));

    const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!;

    const enriched = setRows.map((set) => {
      // 1. Handle Curated Themes (Unsplash Previews)
      if (set.type === 'curated') {
        const theme = CURATED_THEMES.find((t) => t.id === set.curatedThemeId);

        // Use theme-based proxy URLs (pages 1–4) so the set card shows a
        // 2×2 preview grid.
        const previewUrls = theme
          ? [1, 2, 3, 4].map(
              (page) =>
                `/api/media-library/unsplash-preview?theme=${encodeURIComponent(theme.id)}&w=240&page=${page}`
            )
          : [];

        return {
          id: set.id,
          name: set.name,
          type: 'curated' as const,
          assetCount: 0,
          previewUrls,
          curatedThemeId: set.curatedThemeId ?? undefined,
          createdAt: set.createdAt,
        };
      }

      // 2. Handle Cloudinary Assets (Slideshow / Video)
      // Safely parse the asset_uuids string into an array to prevent crashes on legacy data
      let publicIds: string[] = [];
      if (typeof set.assetUuids === 'string') {
        try {
          publicIds = JSON.parse(set.assetUuids);
        } catch {
          publicIds = [];
        }
      } else if (Array.isArray(set.assetUuids)) {
        publicIds = set.assetUuids;
      }

      // Build preview URLs from stored Cloudinary public_ids
      const previewUrls = publicIds.slice(0, 4).map((pid) =>
        set.type === 'video'
          ? `https://res.cloudinary.com/${CLOUD}/video/upload/so_1,c_fill,w_200,h_200,q_auto,f_jpg/${pid}`
          : `https://res.cloudinary.com/${CLOUD}/image/upload/c_fill,w_200,h_200,q_auto,f_webp/${pid}`
      );

      return {
        id: set.id,
        name: set.name,
        type: set.type as 'slideshow' | 'video',
        assetCount: publicIds.length,
        previewUrls,
        createdAt: set.createdAt,
      };
    });

    return NextResponse.json({ sets: enriched });
  } catch (err) {
    console.error('[MediaLibrary/Sets] GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch sets.' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST — create a new set
// Body: { name, type, assetPublicIds?, assetUuids?, curatedThemeId? }
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const type = body?.type;

  if (!name || !['slideshow', 'video', 'curated'].includes(type)) {
    return NextResponse.json({ error: 'name and a valid type are required.' }, { status: 400 });
  }

  // Gracefully handle both the new `assetPublicIds` and legacy `assetUuids` payloads
  const incomingAssets = body.assetPublicIds ?? body.assetUuids;
  const publicIds: string[] = Array.isArray(incomingAssets) ? incomingAssets : [];
  const curatedThemeId: string | undefined = body?.curatedThemeId;

  try {
    const [created] = await db
      .insert(mediaSetSchema)
      .values({
        orgId: orgId!,
        name,
        type,
        // Column keeps old name `assetUuids` but stores public_ids now
        assetUuids: type === 'curated' ? [] : publicIds,
        curatedThemeId: type === 'curated' ? (curatedThemeId ?? null) : null,
      })
      .returning();

    return NextResponse.json({ set: created }, { status: 201 });
  } catch (err) {
    console.error('[MediaLibrary/Sets] POST error:', err);
    return NextResponse.json({ error: 'Failed to create set.' }, { status: 500 });
  }
}