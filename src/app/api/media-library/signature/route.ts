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
 * Body: { paramsToSign: Record<string, any> }
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

export async function POST(request: NextRequest) {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  
  // Use Record<string, any> to account for numbers (like timestamps) and strings
  const paramsToSign: Record<string, any> = body.paramsToSign ?? {};

  // Safely extract the timestamp from the payload or generate a new one
  const timestamp = paramsToSign.timestamp ?? Math.round(Date.now() / 1000);

  // Explicitly type the enforced object to prevent strict inference errors
  const enforced: Record<string, any> = {
    ...paramsToSign,
    timestamp, // Inject the guaranteed timestamp back into the object for signing
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
      timestamp, // Pass the guaranteed timestamp to the frontend
      folder: enforced.folder,
      tags: enforced.tags,
      apiKey: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
      cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    });
  } catch (err) {
    console.error('[MediaLibrary/Signature] Error:', err);
    return NextResponse.json({ error: 'Failed to generate signature.' }, { status: 500 });
  }
}