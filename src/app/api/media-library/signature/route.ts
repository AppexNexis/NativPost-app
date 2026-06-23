/**
 * /api/media-library/signature
 *
 * Generates a signed upload signature for the Cloudinary Upload Widget.
 * This is required for SIGNED uploads (more secure than unsigned presets).
 *
 * The widget calls this endpoint before each upload to get a fresh signature.
 * We embed the orgId as a tag and set the upload folder automatically.
 *
 * POST /api/media-library/signature
 * Body: { paramsToSign: Record<string, string> }
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
  const paramsToSign: Record<string, string> = body.paramsToSign ?? {};

  // Always enforce org folder and org tag — client cannot override these
  const enforced = {
    ...paramsToSign,
    folder: `nativpost/${orgId}`,
    tags: `org:${orgId}`,
  };

  try {
    const signature = cloudinary.utils.api_sign_request(
      enforced,
      process.env.CLOUDINARY_API_SECRET!,
    );

    return NextResponse.json({
      signature,
      timestamp: enforced.timestamp ?? Math.round(Date.now() / 1000),
      folder: enforced.folder,
      tags: enforced.tags,
      apiKey: process.env.CLOUDINARY_API_KEY,
      cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    });
  } catch (err) {
    console.error('[MediaLibrary/Signature] Error:', err);
    return NextResponse.json({ error: 'Failed to generate signature.' }, { status: 500 });
  }
}