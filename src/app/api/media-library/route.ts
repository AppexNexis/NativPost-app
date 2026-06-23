/**
 * /api/media-library
 *
 * Full Cloudinary replacement for the previous Uploadcare-based media library.
 *
 * Storage model:
 *   - Every asset is uploaded directly to Cloudinary (browser → Cloudinary via signed widget).
 *   - Assets are organised under a folder per org:  nativpost/{orgId}/
 *   - orgId is embedded as a Cloudinary tag:        tag = "org:{orgId}"
 *   - Categories are stored in Cloudinary context:  context.categories = "Cat1|Cat2"
 *   - The DB (mediaSetSchema) only tracks sets — not individual assets.
 *
 * GET  /api/media-library?type=image|video|all&category=...&limit=48&offset=0
 * DELETE /api/media-library?publicId=<public_id>
 */

import { v2 as cloudinary } from 'cloudinary';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';

// ---------------------------------------------------------------------------
// Cloudinary config — loaded from env at module level
// ---------------------------------------------------------------------------
cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type MediaAsset = {
  publicId: string;       // Cloudinary public_id  (primary key going forward)
  name: string;           // display filename
  url: string;            // optimised delivery URL  (with f_auto,q_auto)
  thumbnailUrl: string;   // 400×400 thumbnail
  mimeType: string;
  size: number;           // bytes
  isImage: boolean;
  isVideo: boolean;
  width: number | null;
  height: number | null;
  uploadedAt: string;     // ISO string
  categories: string[];   // from Cloudinary context.categories
  resourceType: 'image' | 'video' | 'raw';
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!;

function buildDeliveryUrl(publicId: string, resourceType: 'image' | 'video' | 'raw'): string {
  if (resourceType === 'video') {
    // q_auto, f_auto video delivery
    return `https://res.cloudinary.com/${CLOUD}/video/upload/q_auto,f_auto/${publicId}`;
  }
  // AI-enhanced image: enhance + upscale cap + auto format + auto quality
  return `https://res.cloudinary.com/${CLOUD}/image/upload/e_enhance,q_auto,f_auto,c_limit,w_2000/${publicId}`;
}

function buildThumbnailUrl(publicId: string, resourceType: 'image' | 'video' | 'raw'): string {
  if (resourceType === 'video') {
    // Video thumbnail: grab frame at 1s, crop to square
    return `https://res.cloudinary.com/${CLOUD}/video/upload/so_1,c_fill,w_400,h_400,q_auto,f_jpg/${publicId}`;
  }
  return `https://res.cloudinary.com/${CLOUD}/image/upload/c_fill,w_400,h_400,q_auto,f_webp/${publicId}`;
}

/**
 * Parse Cloudinary context string into a categories array.
 * Cloudinary context is stored as "key=value|key2=value2".
 * We store categories as:  categories=Cat1\,Cat2\,Cat3
 * (commas escaped because pipe and equals are Cloudinary context delimiters)
 */
function parseCategories(context: Record<string, string> | undefined): string[] {
  if (!context?.categories) return [];
  // We store as comma-separated (commas encoded as \, by Cloudinary, returned decoded)
  return context.categories.split(',').map(c => c.trim()).filter(Boolean);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeResource(resource: any): MediaAsset {
  const resourceType: 'image' | 'video' | 'raw' = resource.resource_type ?? 'image';
  const isVideo = resourceType === 'video';
  const isImage = resourceType === 'image';
  const context = resource.context?.custom ?? resource.context ?? {};
  const publicId: string = resource.public_id;
  const name = publicId.split('/').pop() ?? publicId;

  return {
    publicId,
    name,
    url: buildDeliveryUrl(publicId, resourceType),
    thumbnailUrl: buildThumbnailUrl(publicId, resourceType),
    mimeType: resource.format ? `${resourceType}/${resource.format}` : '',
    size: resource.bytes ?? 0,
    isImage,
    isVideo,
    width: resource.width ?? null,
    height: resource.height ?? null,
    uploadedAt: resource.created_at ?? '',
    categories: parseCategories(context),
    resourceType,
  };
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const type = (searchParams.get('type') || 'all') as 'image' | 'video' | 'all';
  const category = searchParams.get('category');
  const limit = Math.min(Number(searchParams.get('limit') || 48), 100);
  const offset = Number(searchParams.get('offset') || 0);

  try {
    // Folder-based isolation: all org assets live under nativpost/{orgId}/
    const folder = `nativpost/${orgId}`;

    const fetchType = async (rt: 'image' | 'video') => {
      const results: MediaAsset[] = [];
      let nextCursor: string | undefined;

      // Paginate through all assets in the org folder for this resource type
      do {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res: any = await cloudinary.api.resources({
          type: 'upload',
          resource_type: rt,
          prefix: folder,
          max_results: 100,
          context: true,         // fetch context (categories)
          tags: true,
          ...(nextCursor ? { next_cursor: nextCursor } : {}),
        });
        results.push(...(res.resources ?? []).map(normalizeResource));
        nextCursor = res.next_cursor;
      } while (nextCursor);

      return results;
    };

    let assets: MediaAsset[] = [];

    if (type === 'image') {
      assets = await fetchType('image');
    } else if (type === 'video') {
      assets = await fetchType('video');
    } else {
      // Fetch both in parallel
      const [images, videos] = await Promise.all([fetchType('image'), fetchType('video')]);
      assets = [...images, ...videos];
    }

    // Category filter
    if (category && category !== 'All categories') {
      if (category === 'Uncategorized') {
        assets = assets.filter(a => a.categories.length === 0);
      } else {
        assets = assets.filter(a => a.categories.includes(category));
      }
    }

    // Sort newest first
    assets.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

    const total = assets.length;
    const page = assets.slice(offset, offset + limit);
    const nextOffset = offset + limit < total ? offset + limit : null;

    return NextResponse.json({ assets: page, total, nextOffset });
  } catch (err) {
    console.error('[MediaLibrary] Cloudinary fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch media library.' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE  /api/media-library?publicId=<public_id>&resourceType=image|video
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  const { error } = await getAuthContext();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const publicId = searchParams.get('publicId');
  const resourceType = (searchParams.get('resourceType') || 'image') as 'image' | 'video';

  if (!publicId) {
    return NextResponse.json({ error: 'Missing publicId parameter.' }, { status: 400 });
  }

  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    return NextResponse.json({ deleted: true, publicId });
  } catch (err) {
    console.error('[MediaLibrary] Cloudinary delete error:', err);
    return NextResponse.json({ error: 'Failed to delete asset.' }, { status: 500 });
  }
}