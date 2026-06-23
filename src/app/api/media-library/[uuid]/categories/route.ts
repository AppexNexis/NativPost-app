/**
 * /api/media-library/[uuid]/categories
 *
 * Updates categories for a Cloudinary asset using Cloudinary's context API.
 * "uuid" here is actually the Cloudinary public_id (URL-encoded).
 *
 * Cloudinary context stores arbitrary key=value pairs alongside assets.
 * We use:   context.categories = "Cat1,Cat2,Cat3"
 *
 * Unlike Uploadcare's metadata which had a 256-char cap, Cloudinary context
 * values support up to 1024 characters — plenty for any realistic category set.
 *
 * PATCH /api/media-library/[publicId]/categories
 * Body: { categories: string[], resourceType?: 'image' | 'video' }
 *
 * Note: The route param is named [uuid] to match existing Next.js file structure
 * but it receives a Cloudinary public_id. The client must URL-encode slashes.
 */

import { v2 as cloudinary } from 'cloudinary';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> },
) {
  const { error } = await getAuthContext();
  if (error) return error;

  const { uuid } = await params;
  // public_id may contain slashes — decode it
  const publicId = decodeURIComponent(uuid);

  const body = await request.json().catch(() => null);
  const categories = Array.isArray(body?.categories) ? (body.categories as string[]) : null;
  const resourceType: 'image' | 'video' = body?.resourceType === 'video' ? 'video' : 'image';

  if (!categories) {
    return NextResponse.json({ error: 'categories array is required.' }, { status: 400 });
  }

  // Cloudinary context value: comma-separated category names
  // Commas within category names would need escaping, but our category names
  // don't contain commas, so this is safe.
  const contextValue = categories.join(',');

  try {
    await cloudinary.uploader.explicit(publicId, {
      type: 'upload',
      resource_type: resourceType,
      context: `categories=${contextValue}`,
    });

    return NextResponse.json({ publicId, categories });
  } catch (err) {
    console.error('[MediaLibrary/Categories] Cloudinary context error:', err);
    return NextResponse.json({ error: 'Failed to update categories.' }, { status: 500 });
  }
}