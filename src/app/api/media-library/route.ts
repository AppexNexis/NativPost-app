import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
// import { db } from '@/libs/DB';
import { getDb } from '@/libs/DB';
import { contentItemSchema } from '@/models/Schema';

const UC_PUB_KEY = process.env.NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY || '';
const UC_SECRET_KEY = process.env.UPLOADCARE_SECRET_KEY || '';
const UC_CDN_BASE = 'https://9c0v643oty.ucarecd.net';
// const UC_CDN_BASE = 'https://32v3ws8ss0.ucarecd.net';
const UC_API = 'https://api.uploadcare.com';

export type MediaAsset = {
  uuid: string;
  name: string;
  cdnUrl: string;
  mimeType: string;
  size: number;
  isImage: boolean;
  isVideo: boolean;
  width: number | null;
  height: number | null;
  uploadedAt: string;
};

function ucAuthHeader() {
  return `Uploadcare.Simple ${UC_PUB_KEY}:${UC_SECRET_KEY}`;
}

// Extract UUID from any Uploadcare CDN URL format:
//   https://32v3ws8ss0.ucarecd.net/{uuid}/
//   https://32v3ws8ss0.ucarecd.net/{uuid}/filename.mp4
//   https://ucarecdn.com/{uuid}/
function extractUuid(url: string): string | null {
  // const match = url.match(
  //   /(?:ucarecd\.net|ucarecdn\.com)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  // );
  // return match?.[1] ?? null;
  const segment = /(?:ucarecd\.net|ucarecdn\.com)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(url)?.[0];
  return segment ? segment.split('/').pop() ?? null : null;
}

function isVideoFilename(name: string): boolean {
  return /\.(mp4|mov|webm|avi|mkv)$/i.test(name);
}

function normalizeAsset(file: Record<string, unknown>): MediaAsset {
  const mime = String(
    (file.mime_type as string)
    || ((file.content_info as Record<string, unknown>)?.mime as Record<string, unknown>)?.mime
    || '',
  );
  const filename = String(file.original_filename || file.uuid || '');
  const isImage = mime.startsWith('image/');
  const isVideo = mime.startsWith('video/') || isVideoFilename(filename);

  // Build canonical CDN URL using our project subdomain
  const uuid = String(file.uuid || '');
  const cdnUrl = `${UC_CDN_BASE}/${uuid}/`;

  return {
    uuid,
    name: filename,
    cdnUrl,
    mimeType: mime,
    size: Number(file.size) || 0,
    isImage,
    isVideo,
    width: (file.image_info as Record<string, unknown>)?.width as number | null ?? null,
    height: (file.image_info as Record<string, unknown>)?.height as number | null ?? null,
    uploadedAt: String(file.datetime_uploaded || file.datetime_stored || ''),
  };
}

// -----------------------------------------------------------
// GET /api/media-library
// Fetches only UUIDs attached to this org's content items from
// the DB, then retrieves their metadata from Uploadcare in batch.
//
// ?type=image|video|all  (default: all)
// ?limit=48
// ?offset=0
// -----------------------------------------------------------
export async function GET(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  if (!UC_SECRET_KEY) {
    return NextResponse.json(
      { error: 'UPLOADCARE_SECRET_KEY is not configured.' },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'all';
  const limit = Math.min(Number(searchParams.get('limit') || 48), 100);
  const offset = Number(searchParams.get('offset') || 0);

  try {
    // Source A — UUIDs from this org's content item graphic_urls in the DB
    const rows = await db
      .select({ graphicUrls: contentItemSchema.graphicUrls })
      .from(contentItemSchema)
      .where(eq(contentItemSchema.orgId, orgId!));

    const dbUuidSet = new Set<string>();
    for (const row of rows) {
      const urls = (row.graphicUrls as string[]) || [];
      for (const url of urls) {
        const uuid = extractUuid(url);
        if (uuid) {
          dbUuidSet.add(uuid);
        }
      }
    }

    // Source B — Files tagged with this orgId via /api/media-library/tag.
    // We fetch all stored files from Uploadcare and filter by metadata.
    // This catches files uploaded directly to the library (not yet on any post).
    const PAGE_SIZE = 100;
    const allFetched: Record<string, unknown>[] = [];
    let nextFrom: string | null = null;

    while (true) {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        ordering: '-datetime_uploaded',
        stored: 'true',
      });
      if (nextFrom) {
        params.set('from', nextFrom);
      }

      const res = await fetch(`${UC_API}/files/?${params.toString()}`, {
        headers: {
          Authorization: ucAuthHeader(),
          Accept: 'application/vnd.uploadcare-v0.7+json',
        },
      });

      if (!res.ok) {
        break;
      }

      const data = await res.json();
      const results: Record<string, unknown>[] = data.results || [];
      allFetched.push(...results);

      if (!data.next || results.length < PAGE_SIZE) {
        break;
      }
      try {
        const nextUrl = new URL(data.next);
        nextFrom = nextUrl.searchParams.get('from');
        if (!nextFrom) {
          break;
        }
      } catch {
        break;
      }
    }

    // Merge: include file if it's in the DB set OR tagged with this orgId
    const seenUuids = new Set<string>();
    let fetchedAssets: MediaAsset[] = [];

    for (const file of allFetched) {
      const uuid = String(file.uuid || '');
      if (seenUuids.has(uuid)) {
        continue;
      }

      // Check if tagged with this orgId via metadata
      const metadata = (file.metadata as Record<string, string>) || {};
      const taggedForOrg = metadata.orgId === orgId;

      // Check if referenced in DB graphic_urls
      const inDb = dbUuidSet.has(uuid);

      if (taggedForOrg || inDb) {
        seenUuids.add(uuid);
        fetchedAssets.push(normalizeAsset(file));
      }
    }

    // Also add any DB UUIDs that weren't returned by Uploadcare's list
    // (e.g. unstored files) — fetch them individually
    for (const uuid of dbUuidSet) {
      if (!seenUuids.has(uuid)) {
        try {
          const res = await fetch(`${UC_API}/files/${uuid}/`, {
            headers: {
              Authorization: ucAuthHeader(),
              Accept: 'application/vnd.uploadcare-v0.7+json',
            },
          });
          if (res.ok) {
            const file = await res.json();
            fetchedAssets.push(normalizeAsset(file));
            seenUuids.add(uuid);
          }
        } catch {
          // Skip missing files silently
        }
      }
    }

    // Apply type filter
    if (type === 'image') {
      fetchedAssets = fetchedAssets.filter(a => a.isImage);
    } else if (type === 'video') {
      fetchedAssets = fetchedAssets.filter(a => a.isVideo);
    }

    // Sort newest first
    fetchedAssets.sort((a, b) => {
      if (!a.uploadedAt || !b.uploadedAt) {
        return 0;
      }
      return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
    });

    const total = fetchedAssets.length;
    const page = fetchedAssets.slice(offset, offset + limit);
    const nextOffset = offset + limit < total ? offset + limit : null;

    return NextResponse.json({
      assets: page,
      total,
      nextOffset,
      nextCursor: null,
    });
  } catch (err) {
    console.error('[MediaLibrary] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch media library.' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// DELETE /api/media-library?uuid=<uuid>
// Permanently deletes a file from Uploadcare
// -----------------------------------------------------------
export async function DELETE(request: NextRequest) {
  const { error } = await getAuthContext();
  if (error) {
    return error;
  }

  const uuid = new URL(request.url).searchParams.get('uuid');
  if (!uuid) {
    return NextResponse.json({ error: 'Missing uuid parameter.' }, { status: 400 });
  }

  try {
    const res = await fetch(`${UC_API}/files/${uuid}/`, {
      method: 'DELETE',
      headers: {
        Authorization: ucAuthHeader(),
        Accept: 'application/vnd.uploadcare-v0.7+json',
      },
    });

    if (!res.ok && res.status !== 404) {
      return NextResponse.json({ error: 'Failed to delete file.' }, { status: 502 });
    }

    return NextResponse.json({ deleted: true, uuid });
  } catch (err) {
    console.error('[MediaLibrary] Delete error:', err);
    return NextResponse.json({ error: 'Failed to delete file.' }, { status: 500 });
  }
}
