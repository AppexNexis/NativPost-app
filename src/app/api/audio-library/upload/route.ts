/**
 * POST /api/audio-library/upload
 *
 * Uploads a user's own audio file into their org's audio folder, so it appears
 * in the editor's "My Library" tab and can be reused on any future post.
 *
 * Storage mirrors the shared catalogue: Cloudinary, `resource_type=video`
 * (which is how Cloudinary stores audio), under a per-org prefix. That means
 * the same GET route, normaliser and player serve both tabs — a user upload is
 * not a special case anywhere downstream.
 *
 * The title is written to `context.title` because Cloudinary's generated
 * public_id tails are base32 gibberish; the GET route reads that context back
 * rather than showing the user `da319awzjdgfs7q0k4mx`.
 */

import { v2 as cloudinary } from 'cloudinary';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';

import { userAudioFolder } from '@/lib/audio-library';

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/** Keep uploads sane — a background track is not a podcast episode. */
const MAX_BYTES = 25 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/ogg',
  'audio/webm',
]);

export async function POST(request: NextRequest) {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: 'That file is empty.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That file is ${(file.size / 1048576).toFixed(1)} MB. The maximum is 25 MB.` },
      { status: 413 },
    );
  }
  // Browsers occasionally send an empty type for exotic containers; fall back
  // to the extension rather than rejecting a legitimate file outright.
  const looksAudio = ALLOWED_MIME.has(file.type)
    || /\.(mp3|wav|m4a|aac|ogg|webm)$/i.test(file.name);
  if (!looksAudio) {
    return NextResponse.json(
      { error: 'Unsupported file type. Upload an MP3, WAV, M4A, AAC, OGG or WebM file.' },
      { status: 415 },
    );
  }

  const title = (form.get('title') as string | null)?.trim()
    || file.name.replace(/\.[^.]+$/, '')
    || 'Untitled track';

  try {
    const buffer = Buffer.from(await file.arrayBuffer());

    const uploaded = await new Promise<Record<string, any>>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'video', // Cloudinary stores audio under `video`.
          folder: userAudioFolder(orgId!),
          context: { title },
          tags: ['user-upload'],
        },
        (err, result) => {
          if (err || !result) {
            reject(err ?? new Error('Upload returned no result'));
            return;
          }
          resolve(result as unknown as Record<string, any>);
        },
      );
      stream.end(buffer);
    });

    return NextResponse.json({
      asset: {
        publicId: uploaded.public_id,
        title,
        url: uploaded.secure_url,
        durationSeconds: typeof uploaded.duration === 'number' ? Math.round(uploaded.duration) : null,
        mimeType: uploaded.format ? `audio/${uploaded.format}` : file.type || 'audio/mpeg',
        tags: ['user-upload'],
        addedAt: uploaded.created_at ?? null,
      },
    }, { status: 201 });
  } catch (err) {
    console.error('[AudioLibrary] user upload failed:', err);
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }
}
