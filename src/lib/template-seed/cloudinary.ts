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

/**
 * ModerationStatus reflects Cloudinary's moderation response for a single
 * add-on. Video moderation is async — the initial upload returns 'pending'
 * and the final verdict arrives at the notification_url webhook.
 */
export type ModerationStatus = 'approved' | 'rejected' | 'pending' | 'overridden' | null;

export interface ModerationResult {
  kind: string; // 'aws_rek' | 'aws_rek_video' | 'webpurify' | 'google_video_moderation' | ...
  status: ModerationStatus;
  response?: unknown; // raw response.moderation_labels + confidence, when present
}

export interface UploadResult {
  publicId: string;
  url: string;
  secureUrl: string;
  thumbnailUrl: string;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  /** First moderation verdict from `result.moderation`, if the upload requested any. */
  moderation: ModerationResult | null;
  /** All moderation verdicts, in the order Cloudinary returned them. */
  moderationAll: ModerationResult[];
}

export interface UploadOptions {
  /**
   * Cloudinary moderation add-on(s) to run on this upload. Examples:
   *   'aws_rek_video'                    — AWS Rekognition video moderation
   *   'aws_rek'                          — AWS Rekognition image moderation
   *   'webpurify'                        — WebPurify image moderation
   *   'aws_rek_video|webpurify'          — multi-moderation pipeline
   *
   * When unset, Cloudinary skips moderation entirely (unless the upload preset
   * has moderation configured).
   */
  moderation?: string;
  /**
   * URL Cloudinary POSTs async moderation results to. REQUIRED for video
   * moderation since AWS Rekognition Video is not synchronous — the upload
   * response contains status='pending' until the webhook fires.
   */
  notificationUrl?: string;
}

function normalizeModeration(raw: unknown): ModerationResult[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null)
    .map((m) => ({
      kind: String(m.kind ?? ''),
      status: (m.status as ModerationStatus) ?? null,
      response: m.response,
    }));
}

export async function uploadVideoFromUrl(
  sourceUrl: string,
  publicId: string,
  options: UploadOptions = {},
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
    ...(options.moderation ? { moderation: options.moderation } : {}),
    ...(options.notificationUrl ? { notification_url: options.notificationUrl } : {}),
  });

  const moderationAll = normalizeModeration((result as any).moderation);

  return {
    publicId: result.public_id as string,
    url: result.url as string,
    secureUrl: result.secure_url as string,
    thumbnailUrl: (result.eager?.[0]?.secure_url as string) || (result.secure_url as string),
    durationSeconds: result.duration ? Number(result.duration) : null,
    width: result.width ? Number(result.width) : null,
    height: result.height ? Number(result.height) : null,
    moderation: moderationAll[0] ?? null,
    moderationAll,
  };
}

export async function uploadImageFromUrl(
  sourceUrl: string,
  publicId: string,
  options: UploadOptions = {},
): Promise<UploadResult> {
  const result = await cloudinary.uploader.upload(sourceUrl, {
    resource_type: 'image',
    public_id: publicId,
    folder: 'nativpost/templates',
    overwrite: true,
    ...(options.moderation ? { moderation: options.moderation } : {}),
    ...(options.notificationUrl ? { notification_url: options.notificationUrl } : {}),
  });

  const moderationAll = normalizeModeration((result as any).moderation);

  return {
    publicId: result.public_id as string,
    url: result.url as string,
    secureUrl: result.secure_url as string,
    thumbnailUrl: result.secure_url as string,
    durationSeconds: null,
    width: result.width ? Number(result.width) : null,
    height: result.height ? Number(result.height) : null,
    moderation: moderationAll[0] ?? null,
    moderationAll,
  };
}

/**
 * Re-moderate an already-uploaded asset via the explicit API.
 * Used for backfilling existing content_template rows uploaded before
 * moderation was wired into the ingestion pipeline.
 */
export async function moderateExistingAsset(
  publicId: string,
  resourceType: 'image' | 'video',
  moderation: string,
  notificationUrl?: string,
): Promise<ModerationResult[]> {
  const result = await cloudinary.uploader.explicit(publicId, {
    type: 'upload',
    resource_type: resourceType,
    moderation,
    ...(notificationUrl ? { notification_url: notificationUrl } : {}),
  });
  return normalizeModeration((result as any).moderation);
}

export function getThumbnailUrl(publicId: string, width = 400): string {
  return cloudinary.url(publicId, {
    width,
    crop: 'limit',
    resource_type: 'video',
    format: 'jpg',
  });
}
