/**
 * POST /api/content/upload-snapshot
 *
 * Accepts a base64-encoded image (JPEG/PNG) captured from the editor preview,
 * uploads it to Cloudinary, and returns the public URL.
 *
 * Body:
 *   imageData  — base64 data URL string (e.g. "data:image/jpeg;base64,...")
 *   publicId   — optional custom public ID (default: auto-generated)
 *   folder     — optional folder path (default: "nativpost/previews")
 *
 * Returns:
 *   { url: "https://res.cloudinary.com/..." }
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

  try {
    const body = await request.json();
    const imageData: string | undefined = body.imageData;
    const publicId: string | undefined = body.publicId;
    const folder: string = body.folder || `nativpost/${orgId}/previews`;

    if (!imageData) {
      return NextResponse.json({ error: 'Missing imageData' }, { status: 400 });
    }

    // Upload to Cloudinary as a video resource.
    // Cloudinary wraps the single JPEG frame in an h.264 MP4 container,
    // producing a short looping video that shows the composited preview
    // (background frame + text overlays) baked in.
    // Tagged with orgId so it appears in the media library.
    const result = await cloudinary.uploader.upload(imageData, {
      folder,
      public_id: publicId,
      resource_type: 'video',
      tags: [`org:${orgId}`],
      transformation: [
        { width: 720, height: 1280, crop: 'pad', background: '#000', video_codec: 'h264' },
      ],
      eager: [
        { width: 608, height: 1080, crop: 'pad', background: '#000', video_codec: 'h264' },
      ],
      eager_async: false,
    });

    return NextResponse.json({ url: result.secure_url });
  } catch (err) {
    console.error('[UploadSnapshot] Error:', err);
    return NextResponse.json({ error: 'Failed to upload snapshot' }, { status: 500 });
  }
}
