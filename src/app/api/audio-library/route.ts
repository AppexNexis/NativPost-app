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

import { AUDIO_FOLDER, normalize, userAudioFolder, type AudioAsset } from '@/lib/audio-library';
import { getAuthContext } from '@/lib/auth';

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export async function GET(request: NextRequest) {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get('limit') || 50), 200);

  // scope=default → the shared catalogue; scope=mine → this org's uploads.
  // Anything else falls back to the catalogue rather than leaking folders.
  const scope = searchParams.get('scope') === 'mine' ? 'mine' : 'default';
  const prefix = scope === 'mine' ? userAudioFolder(orgId!) : AUDIO_FOLDER;

  try {
    const results: AudioAsset[] = [];
    let nextCursor: string | undefined;

    do {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await cloudinary.api.resources({
        type: 'upload',
        resource_type: 'video',
        prefix,
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

    return NextResponse.json({ assets: results.slice(0, limit), total: results.length, scope });
  } catch (err) {
    console.error('[AudioLibrary] Cloudinary fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch audio library.', assets: [] }, { status: 500 });
  }
}
