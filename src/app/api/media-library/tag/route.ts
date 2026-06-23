/**
 * /api/media-library/tag
 *
 * With Cloudinary, org isolation is handled automatically at upload time:
 * - The /api/media-library/signature route enforces folder = nativpost/{orgId}
 * - It also attaches tag = org:{orgId} to every upload
 *
 * So unlike the Uploadcare version, we don't need a separate tagging step
 * after upload. This route exists as a thin compatibility shim in case any
 * part of the codebase still calls it, and for future use (e.g. bulk retagging).
 *
 * POST /api/media-library/tag
 * Body: { publicId: string, resourceType?: 'image' | 'video' }
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

export async function POST(request: NextRequest) {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const publicId: string = body.publicId ?? '';
  const resourceType: 'image' | 'video' = body.resourceType === 'video' ? 'video' : 'image';

  if (!publicId) {
    return NextResponse.json({ error: 'publicId is required.' }, { status: 400 });
  }

  try {
    // Ensure the org tag is attached (idempotent — safe to call multiple times)
    await cloudinary.uploader.add_tag(`org:${orgId}`, [publicId], {
      resource_type: resourceType,
    });

    return NextResponse.json({ tagged: true, publicId, orgId });
  } catch (err) {
    console.error('[MediaLibrary/Tag] Cloudinary tag error:', err);
    return NextResponse.json({ error: 'Failed to tag asset.' }, { status: 500 });
  }
}