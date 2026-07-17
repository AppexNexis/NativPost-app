/**
 * pickDefaultSet
 *
 * Picks the user's most recent Media Set matching a content type, for Blitz
 * media substitution. Returns the raw `media_set` row (with resolved asset
 * URLs pre-fetched) or `null` if no match exists.
 *
 * Set.type values in the schema today: 'slideshow' | 'video' | 'curated'.
 * The Blitz caller only asks for substitution on the safe-swap content types
 * (slideshow / carousel / wall_of_text). For those we map:
 *   - slideshow / carousel → Set.type = 'slideshow'
 *   - wall_of_text → Set.type = 'slideshow' (image assets used as background)
 *
 * Anything else returns null and Blitz falls back to template media as-is
 * (per user decision).
 *
 * Storage note: `media_set.assetUuids` (jsonb) stores Cloudinary `public_id`s,
 * NOT rows in `media_asset`. The prior implementation joined `media_asset` by
 * id and always returned zero matches, so Blitz never applied user Sets.
 * This version resolves public_ids directly to Cloudinary delivery URLs, with
 * a DB fallback for legacy orgs that still stored `media_asset.id` values in
 * `assetUuids`.
 */

import { and, desc, eq, inArray } from 'drizzle-orm';

import { mediaAssetSchema, mediaSetSchema } from '@/models/Schema';

export type ResolvedSet = {
  id: string;
  name: string;
  type: string;
  assets: Array<{ url: string; assetType: 'image' | 'video' }>;
};

const CONTENT_TYPE_TO_SET_TYPE: Record<string, string | undefined> = {
  slideshow: 'slideshow',
  carousel: 'slideshow',
  wall_of_text: 'slideshow',
  // Video content types map to 'video' Sets (e.g. "studio 2 hook"). When
  // the org has no 'video' Set we fall back to null and the caller
  // preserves template media. See applySetToSlots for slot routing.
  talking_head: 'video',
  video_hook: 'video',
  video_hook_demo: 'video',
  ugc: 'video',
  green_screen: 'video',
  scene: 'video',
  reel: 'video',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|$)/i;

function buildCloudinaryUrl(publicId: string, resourceType: 'image' | 'video'): string {
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!cloud) {
    return '';
  }
  // `publicId` from the sets API already includes any folder prefix
  // (e.g. `nativpost/user-uploads/xyz`) so no extra folder handling here.
  return `https://res.cloudinary.com/${cloud}/${resourceType}/upload/${publicId}`;
}

function inferAssetType(publicIdOrUrl: string, setType: string): 'image' | 'video' {
  if (VIDEO_EXT.test(publicIdOrUrl)) {
    return 'video';
  }
  if (setType === 'video') {
    return 'video';
  }
  return 'image';
}

export async function pickDefaultSet(
  db: any,
  orgId: string,
  contentType: string,
): Promise<ResolvedSet | null> {
  const setType = CONTENT_TYPE_TO_SET_TYPE[contentType];
  if (!setType) {
    return null;
  }

  const [set] = await db
    .select()
    .from(mediaSetSchema)
    .where(and(eq(mediaSetSchema.orgId, orgId), eq(mediaSetSchema.type, setType)))
    .orderBy(desc(mediaSetSchema.updatedAt))
    .limit(1);

  if (!set) {
    return null;
  }

  // `assetUuids` column can hold either a jsonb array or a stringified array
  // depending on when the row was written. Normalize both shapes.
  let stored: string[] = [];
  if (Array.isArray(set.assetUuids)) {
    stored = (set.assetUuids as string[]).filter(Boolean);
  } else if (typeof set.assetUuids === 'string') {
    try {
      const parsed = JSON.parse(set.assetUuids);
      if (Array.isArray(parsed)) {
        stored = parsed.filter(Boolean);
      }
    } catch {
      stored = [];
    }
  }

  if (stored.length === 0) {
    return null;
  }

  // Split entries into UUIDs (legacy media_asset rows) and Cloudinary public_ids.
  const uuids: string[] = [];
  const publicIds: string[] = [];
  for (const entry of stored) {
    if (UUID_RE.test(entry)) {
      uuids.push(entry);
    } else {
      publicIds.push(entry);
    }
  }

  // Resolve any legacy uuids from the media_asset table.
  const dbAssets = new Map<string, { url: string; assetType: string }>();
  if (uuids.length > 0) {
    try {
      const rows = await db
        .select({
          id: mediaAssetSchema.id,
          url: mediaAssetSchema.url,
          assetType: mediaAssetSchema.assetType,
        })
        .from(mediaAssetSchema)
        .where(
          and(
            eq(mediaAssetSchema.orgId, orgId),
            inArray(mediaAssetSchema.id, uuids),
          ),
        );
      for (const r of rows as any[]) {
        if (r?.id && r?.url) {
          dbAssets.set(r.id, { url: r.url, assetType: r.assetType });
        }
      }
    } catch (err) {
      // Legacy path is best-effort — never fail Set resolution because
      // media_asset lookups error out.
      console.warn('[pickDefaultSet] media_asset lookup failed:', err);
    }
  }

  // Preserve the ordering the user configured on the set.
  const resolved: Array<{ url: string; assetType: 'image' | 'video' }> = [];
  for (const entry of stored) {
    if (UUID_RE.test(entry)) {
      const hit = dbAssets.get(entry);
      if (hit?.url) {
        resolved.push({
          url: hit.url,
          assetType: (hit.assetType === 'video' ? 'video' : 'image'),
        });
      }
      continue;
    }
    // Cloudinary public_id
    const assetType = inferAssetType(entry, set.type);
    const url = buildCloudinaryUrl(entry, assetType);
    if (url) {
      resolved.push({ url, assetType });
    }
  }

  if (resolved.length === 0) {
    return null;
  }

  return {
    id: set.id,
    name: set.name,
    type: set.type,
    assets: resolved,
  };
}
