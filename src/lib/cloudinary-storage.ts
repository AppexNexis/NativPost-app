/**
 * Cloudinary-backed media storage accounting.
 *
 * The media library lists assets live from Cloudinary (folder `nativpost/{orgId}`),
 * not from the `media_asset` DB table, so storage usage must be summed from the same
 * source to match what users actually see. Results are cached briefly to avoid
 * re-scanning Cloudinary (and hitting Admin API rate limits) on every read.
 */

import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

type CacheEntry = { bytes: number; ts: number };
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

async function sumFolderBytes(folder: string, resourceType: 'image' | 'video'): Promise<number> {
  let total = 0;
  let nextCursor: string | undefined;

  do {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await cloudinary.api.resources({
      type: 'upload',
      resource_type: resourceType,
      prefix: folder,
      max_results: 500,
      ...(nextCursor ? { next_cursor: nextCursor } : {}),
    });

    for (const r of res.resources ?? []) {
      total += Number(r.bytes ?? 0) || 0;
    }
    nextCursor = res.next_cursor;
  } while (nextCursor);

  return total;
}

/**
 * Total bytes of media an org stores in Cloudinary (images + videos under
 * `nativpost/{orgId}`). Cached for ~60s per org unless `force` is passed.
 */
export async function getOrgCloudinaryStorageBytes(
  orgId: string,
  opts?: { force?: boolean },
): Promise<number> {
  const cached = cache.get(orgId);
  if (!opts?.force && cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.bytes;
  }

  const folder = `nativpost/${orgId}`;
  const [imageBytes, videoBytes] = await Promise.all([
    sumFolderBytes(folder, 'image'),
    sumFolderBytes(folder, 'video'),
  ]);

  const bytes = imageBytes + videoBytes;
  cache.set(orgId, { bytes, ts: Date.now() });
  return bytes;
}

/** Drop the cached total for an org (e.g. right after an upload or delete). */
export function invalidateOrgStorageCache(orgId: string): void {
  cache.delete(orgId);
}
