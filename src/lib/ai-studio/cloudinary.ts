// Cloudinary uploader dedicated to AI Studio renders.
// Target folder: `nativpost/renders`.

import { v2 as cloudinary } from 'cloudinary';

function ensureConfigured() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary credentials missing');
  }
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

export type StoredRender = {
  publicId: string;
  url: string;
  thumbnailUrl: string;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  mimeType: string | null;
};

export async function storeImageRender(
  sourceUrl: string,
  publicId: string,
  context: Record<string, string>,
  orgId: string,
): Promise<StoredRender> {
  ensureConfigured();
  const result = await cloudinary.uploader.upload(sourceUrl, {
    resource_type: 'image',
    public_id: publicId,
    // AI Studio renders live inside the org folder so they surface in the
    // Media Library, which queries `nativpost/{orgId}` on Cloudinary.
    folder: `nativpost/${orgId}`,
    overwrite: true,
    context,
    tags: ['ai-studio'],
  });
  return {
    publicId: result.public_id as string,
    url: result.secure_url as string,
    thumbnailUrl: result.secure_url as string,
    width: result.width ? Number(result.width) : null,
    height: result.height ? Number(result.height) : null,
    durationSeconds: null,
    mimeType: typeof result.format === 'string' ? `image/${result.format}` : null,
  };
}

export async function storeAudioRender(
  audioBuffer: Buffer,
  publicId: string,
  context: Record<string, string>,
  orgId: string,
): Promise<StoredRender> {
  ensureConfigured();
  const dataUri = `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    resource_type: 'auto',
    public_id: publicId,
    folder: `nativpost/${orgId}`,
    overwrite: true,
    context,
    tags: ['ai-studio', 'elevenlabs-tts'],
  });
  return {
    publicId: result.public_id as string,
    url: result.secure_url as string,
    thumbnailUrl: result.secure_url as string,
    width: null,
    height: null,
    durationSeconds: result.duration ? Number(result.duration) : null,
    mimeType: typeof result.format === 'string' ? `audio/${result.format}` : 'audio/mpeg',
  };
}

export async function storeVideoRender(
  sourceUrl: string,
  publicId: string,
  context: Record<string, string>,
  orgId: string,
): Promise<StoredRender> {
  ensureConfigured();
  const result = await cloudinary.uploader.upload(sourceUrl, {
    resource_type: 'video',
    public_id: publicId,
    folder: `nativpost/${orgId}`,
    overwrite: true,
    context,
    tags: ['ai-studio'],
    eager: [{ width: 720, height: 1280, crop: 'limit', format: 'mp4' }],
    eager_async: false,
  });
  return {
    publicId: result.public_id as string,
    url: result.secure_url as string,
    thumbnailUrl: (result.eager?.[0]?.secure_url as string) || (result.secure_url as string),
    width: result.width ? Number(result.width) : null,
    height: result.height ? Number(result.height) : null,
    durationSeconds: result.duration ? Number(result.duration) : null,
    mimeType: 'video/mp4',
  };
}
