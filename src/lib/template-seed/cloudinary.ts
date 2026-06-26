/**
 * Cloudinary upload helpers for the trending content seed pipeline.
 */

import { v2 as cloudinary } from 'cloudinary';

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export function configureCloudinary(config: CloudinaryConfig) {
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  });
}

export interface UploadResult {
  publicId: string;
  url: string;
  secureUrl: string;
  thumbnailUrl: string;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
}

export async function uploadVideoFromUrl(
  sourceUrl: string,
  publicId: string,
): Promise<UploadResult> {
  const result = await cloudinary.uploader.upload(sourceUrl, {
    resource_type: 'video',
    public_id: publicId,
    folder: 'nativpost/templates',
    overwrite: true,
    eager: [
      { width: 720, height: 1280, crop: 'limit', format: 'mp4' },
    ],
    eager_async: false,
  });

  return {
    publicId: result.public_id as string,
    url: result.url as string,
    secureUrl: result.secure_url as string,
    thumbnailUrl: (result.eager?.[0]?.secure_url as string) || (result.secure_url as string),
    durationSeconds: result.duration ? Number(result.duration) : null,
    width: result.width ? Number(result.width) : null,
    height: result.height ? Number(result.height) : null,
  };
}

export async function uploadImageFromUrl(
  sourceUrl: string,
  publicId: string,
): Promise<UploadResult> {
  const result = await cloudinary.uploader.upload(sourceUrl, {
    resource_type: 'image',
    public_id: publicId,
    folder: 'nativpost/templates',
    overwrite: true,
  });

  return {
    publicId: result.public_id as string,
    url: result.url as string,
    secureUrl: result.secure_url as string,
    thumbnailUrl: result.secure_url as string,
    durationSeconds: null,
    width: result.width ? Number(result.width) : null,
    height: result.height ? Number(result.height) : null,
  };
}

export function getThumbnailUrl(publicId: string, width = 400): string {
  return cloudinary.url(publicId, {
    width,
    crop: 'limit',
    resource_type: 'video',
    format: 'jpg',
  });
}
