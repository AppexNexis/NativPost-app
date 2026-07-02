/**
 * Cloudinary moderation policy for the seed ingestion pipeline.
 *
 * One source of truth for which add-on runs on which provider. Providers
 * (apify-instagram, apify-tiktok, apify-async, hydrate-tiktok, seed.ts for
 * Pexels) all call `getModerationForProvider(provider)` when uploading so
 * behavior is consistent and tunable in one place.
 *
 * See moderate_assets.md in Cloudinary docs for the full parameter reference.
 */

export type SeedProvider =
  | 'tiktok'
  | 'instagram'
  | 'pexels'
  | 'youtube'
  | 'unknown';

export interface ProviderModerationConfig {
  /** Cloudinary `moderation` string. Use `|` to chain multiple add-ons. */
  video: string;
  /** Cloudinary `moderation` string for images (thumbnails / stock stills). */
  image: string;
}

/**
 * Per-provider defaults. Reasoning:
 * - TikTok / Instagram: high risk (bikini, gym, dance, fashion) — chain
 *   AWS Rekognition Video + WebPurify for defense-in-depth.
 * - Pexels: curated stock, low risk — AWS Rekognition alone is enough.
 * - Unknown / other: strictest possible policy.
 *
 * NOTE: Add-ons must be registered in the Cloudinary console under the exact
 * name below or the upload call will fail. Registered on 2026-07-02:
 *   - aws_rek           (AI Moderation, Amazon Rekognition)
 *   - aws_rek_video     (AI Video Moderation, Amazon Rekognition)
 *   - webpurify         (Image Moderation, WebPurify)  [optional 2nd layer]
 */
const POLICY: Record<SeedProvider, ProviderModerationConfig> = {
  tiktok: {
    video: 'aws_rek_video',
    image: 'aws_rek|webpurify',
  },
  instagram: {
    video: 'aws_rek_video',
    image: 'aws_rek|webpurify',
  },
  pexels: {
    video: 'aws_rek_video',
    image: 'aws_rek',
  },
  youtube: {
    video: 'aws_rek_video',
    image: 'aws_rek',
  },
  unknown: {
    video: 'aws_rek_video',
    image: 'aws_rek',
  },
};

export function getModerationForProvider(
  provider: string | undefined | null,
  kind: 'video' | 'image' = 'video',
): string {
  const key = (provider ?? 'unknown') as SeedProvider;
  const config = POLICY[key] ?? POLICY.unknown;
  return kind === 'video' ? config.video : config.image;
}

/**
 * URL Cloudinary POSTs async moderation verdicts back to. Video moderation
 * (aws_rek_video, google_video_moderation) is not synchronous — the upload
 * response contains status='pending' until this webhook fires.
 *
 * We resolve at call-time (not module-load-time) so tests + local scripts
 * that set env vars after import still work.
 */
export function getModerationWebhookUrl(): string | undefined {
  const url = process.env.CLOUDINARY_MODERATION_WEBHOOK;
  return url && url.trim().length > 0 ? url : undefined;
}
