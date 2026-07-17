/**
 * inventoryMediaSet
 *
 * Reports the current Blitz-eligible media-set inventory for an org, split
 * by asset type (image / video) and with per-content-type feasibility.
 *
 * "Eligible" = an asset whose Cloudinary public_id has NOT been recorded in
 * `blitz_media_usage` within the sliding window (default 90 days). This is
 * the mechanism that prevents Blitz from reusing exhausted media until it
 * has been rotated out long enough.
 *
 * Blitz's batch content-mix planner calls this BEFORE deciding what to
 * generate, so slideshow / video-hook / UGC quotas can be redistributed
 * to types that actually have feasible source material.
 */

import { and, eq, gte } from 'drizzle-orm';

import {
  blitzMediaUsageSchema,
  mediaAssetSchema,
  mediaSetSchema,
} from '@/models/Schema';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|$)/i;
const VIDEO_URL_PATH = /\/video\/upload\//i;

export type EligibleAsset = {
  publicId: string;
  url: string;
  assetType: 'image' | 'video';
};

export type MediaInventory = {
  hasMediaSet: boolean;
  totals: { images: number; videos: number };
  eligible: {
    images: EligibleAsset[];
    videos: EligibleAsset[];
  };
  eligibleCounts: { images: number; videos: number };
  /** publicId set of assets that are ineligible (used within the window). */
  usedPublicIds: Set<string>;
  perContentType: Record<
    string,
    { canUseUserMedia: boolean; eligibleCount: number; kind: 'image' | 'video' }
  >;
};

/** Content-type → which media kind Blitz consumes. */
const CONTENT_TYPE_TO_KIND: Record<string, 'image' | 'video'> = {
  slideshow: 'image',
  carousel: 'image',
  wall_of_text: 'image',
  ugc: 'video',
  video_hook: 'video',
  video_hook_demo: 'video',
  talking_head: 'video',
  green_screen: 'video',
  scene: 'video',
  reel: 'video',
};

function buildCloudinaryUrl(
  publicId: string,
  resourceType: 'image' | 'video',
): string {
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!cloud) {
    return '';
  }
  return `https://res.cloudinary.com/${cloud}/${resourceType}/upload/${publicId}`;
}

function detectAssetKind(
  publicIdOrUrl: string,
  storedType: 'image' | 'video' | undefined,
  setType: string,
): 'image' | 'video' {
  if (VIDEO_URL_PATH.test(publicIdOrUrl) || VIDEO_EXT.test(publicIdOrUrl)) {
    return 'video';
  }
  if (storedType === 'video') {
    return 'video';
  }
  if (setType === 'video') {
    return 'video';
  }
  return 'image';
}

/**
 * Query the sliding-window used-publicId set for an org. Exposed for reuse by
 * pickDefaultSet and other consumers that want the same exclusion set.
 */
export async function getUsedPublicIds(
  db: any,
  orgId: string,
  now: Date = new Date(),
  windowDays: number = 90,
): Promise<Set<string>> {
  const cutoff = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ assetPublicId: blitzMediaUsageSchema.assetPublicId })
    .from(blitzMediaUsageSchema)
    .where(
      and(
        eq(blitzMediaUsageSchema.orgId, orgId),
        gte(blitzMediaUsageSchema.usedAt, cutoff),
      ),
    );
  const used = new Set<string>();
  for (const r of rows as any[]) {
    if (r?.assetPublicId) {
      used.add(r.assetPublicId);
    }
  }
  return used;
}

export async function inventoryMediaSet(
  db: any,
  orgId: string,
  contentTypes: string[] = [],
  now: Date = new Date(),
  windowDays: number = 90,
): Promise<MediaInventory> {
  // 1. Load all sets for the org.
  const sets = await db
    .select()
    .from(mediaSetSchema)
    .where(eq(mediaSetSchema.orgId, orgId));

  if (!sets || sets.length === 0) {
    const empty: MediaInventory = {
      hasMediaSet: false,
      totals: { images: 0, videos: 0 },
      eligible: { images: [], videos: [] },
      eligibleCounts: { images: 0, videos: 0 },
      usedPublicIds: new Set(),
      perContentType: {},
    };
    for (const ct of contentTypes) {
      const kind = CONTENT_TYPE_TO_KIND[ct] ?? 'image';
      empty.perContentType[ct] = { canUseUserMedia: false, eligibleCount: 0, kind };
    }
    return empty;
  }

  // 2. Flatten all assetUuids across sets. Track (entry, setType) so we can
  //    infer kind for legacy string-only entries.
  const entries: Array<{ raw: string; setType: string }> = [];
  const uuids: string[] = [];
  for (const set of sets as any[]) {
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
    for (const raw of stored) {
      entries.push({ raw, setType: set.type });
      if (UUID_RE.test(raw)) {
        uuids.push(raw);
      }
    }
  }

  // 3. Resolve legacy UUID entries via media_asset.
  const dbAssets = new Map<string, { url: string; assetType: 'image' | 'video' }>();
  if (uuids.length > 0) {
    try {
      const { inArray } = await import('drizzle-orm');
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
          dbAssets.set(r.id, {
            url: r.url,
            assetType: r.assetType === 'video' ? 'video' : 'image',
          });
        }
      }
    } catch (err) {
      console.warn('[inventoryMediaSet] media_asset lookup failed:', err);
    }
  }

  // 4. Materialize all assets with their publicId + url + kind.
  const allImages: EligibleAsset[] = [];
  const allVideos: EligibleAsset[] = [];
  const seenPublicIds = new Set<string>();

  for (const { raw, setType } of entries) {
    let publicId: string;
    let url: string;
    let kind: 'image' | 'video';

    if (UUID_RE.test(raw)) {
      const hit = dbAssets.get(raw);
      if (!hit?.url) {
        continue;
      }
      // For legacy rows we use media_asset.id as the "publicId" key so the
      // blitz_media_usage log stays consistent even without a real
      // Cloudinary public_id.
      publicId = raw;
      url = hit.url;
      kind = detectAssetKind(hit.url, hit.assetType, setType);
    } else {
      publicId = raw;
      kind = detectAssetKind(raw, undefined, setType);
      url = buildCloudinaryUrl(raw, kind);
      if (!url) {
        continue;
      }
    }

    if (seenPublicIds.has(publicId)) {
      continue;
    }
    seenPublicIds.add(publicId);

    if (kind === 'video') {
      allVideos.push({ publicId, url, assetType: 'video' });
    } else {
      allImages.push({ publicId, url, assetType: 'image' });
    }
  }

  // 5. Load used-publicId exclusion set for the 90-day window.
  const usedPublicIds = await getUsedPublicIds(db, orgId, now, windowDays);

  // 6. Filter to eligible.
  const eligibleImages = allImages.filter((a) => !usedPublicIds.has(a.publicId));
  const eligibleVideos = allVideos.filter((a) => !usedPublicIds.has(a.publicId));

  const perContentType: MediaInventory['perContentType'] = {};
  for (const ct of contentTypes) {
    const kind = CONTENT_TYPE_TO_KIND[ct] ?? 'image';
    const count = kind === 'video' ? eligibleVideos.length : eligibleImages.length;
    perContentType[ct] = {
      canUseUserMedia: count > 0,
      eligibleCount: count,
      kind,
    };
  }

  return {
    hasMediaSet: true,
    totals: { images: allImages.length, videos: allVideos.length },
    eligible: { images: eligibleImages, videos: eligibleVideos },
    eligibleCounts: {
      images: eligibleImages.length,
      videos: eligibleVideos.length,
    },
    usedPublicIds,
    perContentType,
  };
}
