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

// GET — returns the folder prefix for this org so the frontend
// can set it in uploadWidgetOptions before opening the widget
export async function GET() {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  return NextResponse.json({
    folder: `nativpost/${orgId}`,
    tags: `org:${orgId}`,
  });
}

export async function POST(request: NextRequest) {
  // const { error, orgId } = await getAuthContext();
  const { error } = await getAuthContext();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const paramsToSign: Record<string, any> = body.paramsToSign ?? {};

  const timestamp = paramsToSign.timestamp ?? Math.round(Date.now() / 1000);

  // Sign exactly what the widget sends — folder and tags will be in
  // paramsToSign because we set them in uploadWidgetOptions on the frontend
  const signingParams: Record<string, any> = {
    ...paramsToSign,
    timestamp,
  };

  try {
    const signature = cloudinary.utils.api_sign_request(
      signingParams,
      process.env.CLOUDINARY_API_SECRET!,
    );

    return NextResponse.json({
      signature,
      timestamp,
      apiKey: process.env.CLOUDINARY_API_KEY,
      cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    });
  } catch (err) {
    console.error('[MediaLibrary/Signature] Error:', err);
    return NextResponse.json({ error: 'Failed to generate signature.' }, { status: 500 });
  }
}