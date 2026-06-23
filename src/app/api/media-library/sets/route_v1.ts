import { asc, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { mediaSetSchema } from '@/models/Schema';
// NOTE: adjust this import to wherever curatedThemes.ts actually lives.
// It currently sits next to the media-library page component (imported
// there as './curatedThemes'); move it to a shared location such as
// `@/libs/curatedThemes` so both the page and this route can use the
// same 60+ theme list instead of duplicating it.
import { CURATED_THEMES } from '@/libs/curatedThemes';

const UC_CDN_BASE = 'https://9c0v643oty.ucarecd.net';

type SetResponse = {
  id: string;
  name: string;
  type: 'slideshow' | 'video' | 'curated';
  assetCount: number;
  previewUrls: string[];
  curatedThemeId?: string;
};

function uploadcarePreview(uuid: string, size = 200): string {
  return `${UC_CDN_BASE}/${uuid}/-/preview/${size}x${size}/-/format/webp/-/quality/smart/`;
}

// -----------------------------------------------------------
// GET /api/media-library/sets
// -----------------------------------------------------------
export async function GET() {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  try {
    const setRows = await db
      .select()
      .from(mediaSetSchema)
      .where(eq(mediaSetSchema.orgId, orgId!))
      .orderBy(asc(mediaSetSchema.createdAt));

    const sets: SetResponse[] = setRows.map((set) => {
      if (set.type === 'curated') {
        const theme = CURATED_THEMES.find(t => t.id === set.curatedThemeId);
        const previewUrls = theme
          ? [`/api/media-library/unsplash-preview?query=${encodeURIComponent(theme.query)}&w=240&page=1`]
          : [];

        return {
          id: set.id,
          name: set.name,
          type: 'curated' as const,
          assetCount: 0,
          previewUrls,
          curatedThemeId: set.curatedThemeId ?? undefined,
        };
      }

      // --- FIX: Safely parse the asset_uuids string into an array ---
      let assetUuids: string[] = [];
      if (typeof set.assetUuids === 'string') {
        try {
          assetUuids = JSON.parse(set.assetUuids);
        } catch (e) {
          assetUuids = [];
        }
      } else if (Array.isArray(set.assetUuids)) {
        assetUuids = set.assetUuids;
      }

      return {
        id: set.id,
        name: set.name,
        type: set.type as 'slideshow' | 'video',
        assetCount: assetUuids.length,
        previewUrls: assetUuids.slice(0, 4).map(uuid => uploadcarePreview(uuid)),
      };
    });

    return NextResponse.json({ sets });
  } catch (err) {
    console.error('[MediaLibrary/Sets] GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch sets.' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// POST /api/media-library/sets
// Body: { name: string, type: 'slideshow'|'video'|'curated', assetUuids?: string[], curatedThemeId?: string }
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const type = body?.type;

  if (!name || !['slideshow', 'video', 'curated'].includes(type)) {
    return NextResponse.json({ error: 'name and a valid type are required.' }, { status: 400 });
  }

  const assetUuids: string[] = Array.isArray(body?.assetUuids) ? body.assetUuids : [];
  const curatedThemeId: string | undefined = body?.curatedThemeId;

  try {
    const [set] = await db
      .insert(mediaSetSchema)
      .values({
        orgId: orgId!,
        name,
        type,
        assetUuids: type === 'curated' ? [] : assetUuids,
        curatedThemeId: type === 'curated' ? curatedThemeId ?? null : null,
      })
      .returning();

    if (!set) {
      return NextResponse.json({ error: 'Failed to create set.' }, { status: 500 });
    }

    return NextResponse.json({ set }, { status: 201 });
  } catch (err) {
    console.error('[MediaLibrary/Sets] POST error:', err);
    return NextResponse.json({ error: 'Failed to create set.' }, { status: 500 });
  }
}