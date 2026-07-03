/**
 * Hydrate TikTok templates with a hosted, playable video.
 *
 * Rationale: Apify's TikTok scraper doesn't always populate `videoUrl`
 * (especially without `shouldDownloadVideos: true`), and Cloudinary can't
 * ingest a `tiktok.com` HTML page. We solve this with a two-hop bridge:
 *
 *     tiktok.com/@user/video/123
 *         → TikWM API → direct .mp4 URL
 *         → Cloudinary uploadVideoFromUrl → nativpost/templates/...
 *
 * Runs are safe to re-invoke — rows whose `mediaUrl` is already a
 * Cloudinary URL are skipped. Rate limits are respected via a serial loop
 * with a 750ms per-request pause (roughly 80 req/min, well under TikWM's
 * 120 req/min ceiling).
 *
 * Called from:
 *   - /api/cron/seed-trending/process      (inline after Apify processing)
 *   - /api/cron/seed-trending/hydrate-tiktok (standalone backfill)
 */

import { and, eq, or, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { contentTemplateSchema } from '@/models/Schema';

import { configureCloudinary, uploadVideoFromUrl } from './cloudinary';
import { getModerationForProvider, getModerationWebhookUrl } from './moderation-policy';
import { resolveTikTokMedia } from './providers/tikwm';

export type HydrateTikTokDeps = {
  cloudinary: { cloudName: string; apiKey: string; apiSecret: string };
  tikwmApiKey?: string;
  /** Max rows to process in this run. Default 50, hard cap 200. */
  limit?: number;
  /** Pause between TikWM calls (ms). Default 750. */
  delayMs?: number;
};

export type HydrateTikTokResult = {
  scanned: number;
  hydrated: number;
  failed: number;
  skipped: number;
  details: Array<{
    templateId: string;
    sourceUrl: string;
    outcome: 'hydrated' | 'tikwm-failed' | 'cloudinary-failed' | 'db-failed';
    mediaUrl?: string;
    error?: string;
  }>;
};

const CLOUDINARY_HOST_HINT = 'res.cloudinary.com';

function needsHydration(mediaUrl: string | null): boolean {
  if (!mediaUrl) return true;
  const lower = mediaUrl.toLowerCase();
  if (lower.includes(CLOUDINARY_HOST_HINT)) return false;
  if (lower.includes('tiktok.com')) return true;
  // Anything else — accept if it looks like a direct video URL,
  // otherwise flag for hydration.
  return !/\.(mp4|mov|webm|m3u8)(\?.*)?$/i.test(lower);
}

function sanitizePublicId(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_.\-/]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 120);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Cloudinary SDK throws plain objects like { error: { message, http_code } } —
// not Error instances — so naive String(err) yields "[object Object]".
// Unwrap every plausible shape so failure diagnostics stay useful.
function formatCloudinaryError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as any;
    if (e.error?.message) {
      return e.error.http_code
        ? `${e.error.message} (${e.error.http_code})`
        : e.error.message;
    }
    if (e.message) return String(e.message);
  }
  return err instanceof Error ? err.message : String(err);
}

export async function hydrateTikTokMedia(
  deps: HydrateTikTokDeps,
): Promise<HydrateTikTokResult> {
  const limit = Math.min(Math.max(deps.limit ?? 50, 1), 200);
  const delayMs = deps.delayMs ?? 750;

  // Pull TikTok rows whose mediaUrl is empty or clearly not a hosted mp4.
  // We can't fully express `needsHydration` in SQL, so over-fetch (2x)
  // and filter in JS.
  const candidates = await db
    .select({
      id: contentTemplateSchema.id,
      sourceUrl: contentTemplateSchema.sourceUrl,
      sourceVideoId: contentTemplateSchema.sourceVideoId,
      mediaUrl: contentTemplateSchema.mediaUrl,
      thumbnailUrl: contentTemplateSchema.thumbnailUrl,
    })
    .from(contentTemplateSchema)
    .where(
      and(
        eq(contentTemplateSchema.sourcePlatform, 'tiktok'),
        // Slideshows have no video to hydrate — their media pipeline runs
        // per-slide inside processPendingApifyRuns. Exclude them so we don't
        // waste TikWM calls (which don't resolve /photo/ URLs anyway).
        sql`${contentTemplateSchema.contentType} != 'slideshow'`,
        or(
          isNull(contentTemplateSchema.mediaUrl),
          sql`${contentTemplateSchema.mediaUrl} = ''`,
          sql`${contentTemplateSchema.mediaUrl} NOT ILIKE ${'%' + CLOUDINARY_HOST_HINT + '%'}`,
        ),
      ),
    )
    .orderBy(sql`${contentTemplateSchema.createdAt} DESC`)
    .limit(limit * 2);

  const queue = candidates.filter((c) => needsHydration(c.mediaUrl)).slice(0, limit);

  const result: HydrateTikTokResult = {
    scanned: candidates.length,
    hydrated: 0,
    failed: 0,
    skipped: candidates.length - queue.length,
    details: [],
  };

  if (queue.length === 0) {
    return result;
  }

  configureCloudinary(deps.cloudinary);

  for (const row of queue) {
    // Resolve the raw .mp4 via TikWM
    const resolved = await resolveTikTokMedia(row.sourceUrl, deps.tikwmApiKey);
    if (!resolved) {
      result.failed++;
      result.details.push({
        templateId: row.id,
        sourceUrl: row.sourceUrl,
        outcome: 'tikwm-failed',
      });
      await sleep(delayMs);
      continue;
    }

    // Upload to Cloudinary. `uploadVideoFromUrl` already applies an
    // eager 720x1280 c=limit transform which is exactly what we want.
    const publicId = sanitizePublicId(
      `tiktok_${row.sourceVideoId ?? row.id}_${Date.now()}`,
    );

    let upload: Awaited<ReturnType<typeof uploadVideoFromUrl>>;
    try {
      upload = await uploadVideoFromUrl(resolved.playUrl, publicId, {
        moderation: getModerationForProvider('tiktok', 'video'),
        notificationUrl: getModerationWebhookUrl(),
      });
    } catch (err) {
      result.failed++;
      result.details.push({
        templateId: row.id,
        sourceUrl: row.sourceUrl,
        outcome: 'cloudinary-failed',
        error: formatCloudinaryError(err),
      });
      await sleep(delayMs);
      continue;
    }

    // Persist. thumbnail_url is NOT NULL — keep existing if we don't have
    // a better one from Cloudinary or TikWM.
    const nextThumbnail =
      upload.thumbnailUrl || resolved.thumbnailUrl || row.thumbnailUrl || '';

    // Gate on moderation status. rejected → deactivate + surface reason.
    // pending (aws_rek_video is async) → deactivate until webhook flips.
    // approved / null (moderation disabled) → keep row's existing is_active.
    const moderationStatus = upload.moderation?.status ?? null;
    const moderationKind = upload.moderation?.kind ?? null;
    const isRejected = moderationStatus === 'rejected';
    const isPending = moderationStatus === 'pending';

    try {
      await db
        .update(contentTemplateSchema)
        .set({
          mediaUrl: upload.secureUrl,
          thumbnailUrl: nextThumbnail,
          cloudinaryPublicId: upload.publicId,
          moderationStatus,
          moderationKind,
          moderationLabels: upload.moderationAll as any,
          moderationCheckedAt: moderationStatus ? new Date() : null,
          // Hide rejected + pending rows from the library until the webhook
          // (or a human) confirms they are safe to deliver.
          ...(isRejected || isPending
            ? {
                isActive: false,
                curationStatus: isRejected ? 'rejected' : 'pending_moderation',
              }
            : {}),
          lastRefreshedAt: new Date(),
        })
        .where(eq(contentTemplateSchema.id, row.id));
    } catch (err) {
      result.failed++;
      result.details.push({
        templateId: row.id,
        sourceUrl: row.sourceUrl,
        outcome: 'db-failed',
        error: formatCloudinaryError(err),
      });
      await sleep(delayMs);
      continue;
    }

    result.hydrated++;
    result.details.push({
      templateId: row.id,
      sourceUrl: row.sourceUrl,
      outcome: 'hydrated',
      mediaUrl: upload.secureUrl,
    });

    await sleep(delayMs);
  }

  return result;
}
