/**
 * /api/audio-library
 *
 * Shared background-audio catalog scanned from Cloudinary folder
 * `nativpost/audio/`. All orgs share the same library — this is a curated
 * pool of royalty-free tracks, not per-org uploads.
 *
 * Cloudinary quirks (see team memory `nativpost-cloudinary-asset-titles`):
 *   - Audio (mp3/wav/m4a) is stored as `resource_type=video` in Cloudinary.
 *   - Raw public_id tails look like `da319awzjdgfs7q0k4mx` — never surface
 *     those as titles. Titles come from `context.custom.title`, with a
 *     prettified fallback that decodes the last path segment.
 *
 * Response shape matches what AudioTab expects — { title, url, publicId,
 * durationSeconds, mimeType, tags }.
 *
 * GET  /api/audio-library?limit=50
 */

import { v2 as cloudinary } from 'cloudinary';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!;
const AUDIO_FOLDER = 'nativpost/audio';

export type AudioAsset = {
  publicId: string;
  title: string;
  url: string;
  durationSeconds: number | null;
  mimeType: string;
  tags: string[];
  addedAt: string | null;
};

function prettifyPublicId(publicId: string): string {
  const tail = publicId.split('/').pop() ?? publicId;
  // Cloudinary auto-tails look like base32 gibberish; if it's more than 12
  // chars of alphanumerics with no separators, treat as unnamed.
  if (/^[a-z0-9]{12,}$/i.test(tail)) return 'Untitled track';
  return tail
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, c => c.toUpperCase());
}

function buildAudioUrl(publicId: string, format?: string): string {
  // Deliver at the source format (mp3/m4a/wav) — no transcoding needed.
  const ext = format ? `.${format}` : '';
  return `https://res.cloudinary.com/${CLOUD}/video/upload/${publicId}${ext}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(resource: any): AudioAsset {
  const publicId: string = resource.public_id;
  const context = resource.context?.custom ?? resource.context ?? {};
  const contextTitle: string | undefined = context.title || context.name || context.caption;
  const title = (contextTitle && contextTitle.trim()) || prettifyPublicId(publicId);

  return {
    publicId,
    title,
    url: buildAudioUrl(publicId, resource.format),
    durationSeconds: typeof resource.duration === 'number' ? Math.round(resource.duration) : null,
    mimeType: resource.format ? `audio/${resource.format}` : 'audio/mpeg',
    tags: Array.isArray(resource.tags) ? resource.tags : [],
    addedAt: resource.created_at ?? null,
  };
}

export async function GET(request: NextRequest) {
  const { error } = await getAuthContext();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get('limit') || 50), 200);

  try {
    const results: AudioAsset[] = [];
    let nextCursor: string | undefined;

    do {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await cloudinary.api.resources({
        type: 'upload',
        resource_type: 'video',
        prefix: AUDIO_FOLDER,
        max_results: 100,
        context: true,
        tags: true,
        ...(nextCursor ? { next_cursor: nextCursor } : {}),
      });
      results.push(...(res.resources ?? []).map(normalize));
      nextCursor = res.next_cursor;
    } while (nextCursor && results.length < limit * 2);

    results.sort((a, b) => {
      const at = a.addedAt ? new Date(a.addedAt).getTime() : 0;
      const bt = b.addedAt ? new Date(b.addedAt).getTime() : 0;
      return bt - at;
    });

    return NextResponse.json({ assets: results.slice(0, limit), total: results.length });
  } catch (err) {
    console.error('[AudioLibrary] Cloudinary fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch audio library.', assets: [] }, { status: 500 });
  }
}
