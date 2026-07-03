import { db } from '@/lib/db'; // adjust to your actual db client path
import { apifySeedRunSchema, contentTemplateSchema } from './../../../models/Schema';
import { eq } from 'drizzle-orm';
import { enrichTemplateWithAI } from '../ai';
import { configureCloudinary, uploadImageFromUrl, uploadVideoFromUrl } from '../cloudinary';
import { getModerationForProvider, getModerationWebhookUrl } from '../moderation-policy';
import { DEFAULT_USERNAMES as IG_DEFAULT_USERNAMES } from './apify-instagram';
import { DEFAULT_USERNAMES as TT_DEFAULT_USERNAMES } from './apify-tiktok';
import {
  buildSlideshowInput,
  groupTikTokSlideshowItems,
  SLIDESHOW_ACTOR_ID,
} from './apify-tiktok-slideshow';
import type { RawTemplate } from '../types';

const IG_ACTOR_ID = 'apify~instagram-reel-scraper';
const TT_ACTOR_ID = 'clockworks~tiktok-scraper';

// ------------------------------------------------------------------
// START: kick off an Apify run, persist tracking row, return immediately
// ------------------------------------------------------------------

type StartParams = {
  apifyToken: string;
  usernames?: string[];
  limit?: number;
  minLikes?: number;
  minViews?: number;
  curationStatus?: 'pending' | 'approved' | 'rejected';
};

async function startActorRun(actorId: string, input: Record<string, unknown>, token: string): Promise<string> {
  const res = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`Apify start failed (${actorId}): ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.data.id as string;
}

export async function startInstagramIngest(params: StartParams) {
  const usernames = params.usernames ?? IG_DEFAULT_USERNAMES;
  const limit = params.limit ?? 15;

  const runId = await startActorRun(
    IG_ACTOR_ID,
    { username: usernames, resultsLimit: limit },
    params.apifyToken,
  );

  await db.insert(apifySeedRunSchema).values({
    id: runId,
    provider: 'instagram',
    actorId: IG_ACTOR_ID,
    status: 'pending',
    params: {
      usernames,
      limit,
      minLikes: params.minLikes ?? 0,
      curationStatus: params.curationStatus ?? 'pending',
    },
  });

  return runId;
}

export async function startTikTokIngest(params: StartParams) {
  const usernames = params.usernames ?? TT_DEFAULT_USERNAMES;
  const limit = params.limit ?? 15;

  const runId = await startActorRun(
    TT_ACTOR_ID,
    {
      profiles: usernames,
      resultsPerPage: limit,
      profileScrapeSections: ['videos'],
      profileSorting: 'latest',
    },
    params.apifyToken,
  );

  await db.insert(apifySeedRunSchema).values({
    id: runId,
    provider: 'tiktok',
    actorId: TT_ACTOR_ID,
    status: 'pending',
    params: {
      usernames,
      limit,
      minViews: params.minViews ?? 0,
      curationStatus: params.curationStatus ?? 'pending',
    },
  });

  return runId;
}

type StartSlideshowParams = {
  apifyToken: string;
  urls: string[];
  limit?: number;
  curationStatus?: 'pending' | 'approved' | 'rejected';
};

export async function startTikTokSlideshowIngest(params: StartSlideshowParams) {
  const urls = (params.urls ?? []).filter(u => u.startsWith('http'));
  if (urls.length === 0) {
    throw new Error('startTikTokSlideshowIngest: no valid URLs provided');
  }
  const limit = params.limit ?? Math.min(urls.length * 15, 200);

  const runId = await startActorRun(
    SLIDESHOW_ACTOR_ID,
    buildSlideshowInput(urls, limit),
    params.apifyToken,
  );

  await db.insert(apifySeedRunSchema).values({
    id: runId,
    provider: 'tiktok-slideshow',
    actorId: SLIDESHOW_ACTOR_ID,
    status: 'pending',
    params: {
      urls,
      limit,
      curationStatus: params.curationStatus ?? 'pending',
    },
  });

  return runId;
}

// ------------------------------------------------------------------
// PROCESS: check status, fetch dataset, enrich, upload, upsert
// ------------------------------------------------------------------

async function getRunStatus(runId: string, token: string) {
  const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`);
  if (!res.ok) throw new Error(`Apify status check failed: ${res.status}`);
  const data = await res.json();
  return data.data as { status: string; defaultDatasetId: string };
}

async function getDatasetItems(datasetId: string, token: string): Promise<unknown[]> {
  const res = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}`);
  if (!res.ok) throw new Error(`Apify dataset fetch failed: ${res.status}`);
  return res.json();
}

// NOTE: field names below are my best reconstruction from the earlier IG/TikTok
// sample payloads in this conversation. Verify against your actual RawTemplate
// type in `./types` before relying on this in production — I don't have that
// file's exact shape.
function mapInstagramItem(item: any): RawTemplate | null {
  if (item.error || !item.videoUrl) return null;
  return {
    sourceUrl: item.url,
    sourcePlatform: 'instagram',
    sourceCreator: item.ownerUsername,
    sourceVideoId: item.id ?? item.shortCode,
    mediaUrl: item.videoUrl,
    thumbnailUrl: item.displayUrl ?? item.images?.[0],
    durationSeconds: item.videoDuration ? Math.round(item.videoDuration) : undefined,
    caption: item.caption,
    hashtags: item.hashtags ?? [],
    viewCount: item.videoPlayCount ?? item.videoViewCount,
    likeCount: item.likesCount,
    commentCount: item.commentsCount,
    timestamp: item.timestamp,
  } as unknown as RawTemplate;
}

function mapTikTokItem(item: any): RawTemplate | null {
  // TikTok field names not confirmed live — adjust once you verify the
  // clockworks/tiktok-scraper output schema against console.apify.com.
  if (!item.videoUrl && !item.webVideoUrl) return null;
  return {
    sourceUrl: item.webVideoUrl ?? item.url,
    sourcePlatform: 'tiktok',
    sourceCreator: item.authorMeta?.name ?? item.author,
    sourceVideoId: item.id,
    mediaUrl: item.videoUrl ?? item.videoUrlNoWaterMark,
    thumbnailUrl: item.covers?.default ?? item.coverUrl,
    durationSeconds: item.videoMeta?.duration,
    caption: item.text,
    hashtags: item.hashtags?.map((h: any) => h.name) ?? [],
    viewCount: item.playCount ?? item.videoMeta?.playCount,
    likeCount: item.diggCount,
    commentCount: item.commentCount,
    shareCount: item.shareCount,
    timestamp: item.createTimeISO,
  } as unknown as RawTemplate;
}

function sanitizePublicId(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9_.\-/]/g, '_').replace(/_{2,}/g, '_').slice(0, 120);
}

type ProcessDeps = {
  apifyToken: string;
  anthropicApiKey: string;
  cloudinary?: { cloudName: string; apiKey: string; apiSecret: string };
};

export async function processPendingApifyRuns(deps: ProcessDeps) {
  const pending = await db
    .select()
    .from(apifySeedRunSchema)
    .where(eq(apifySeedRunSchema.status, 'pending'));

  const results: Array<{ runId: string; outcome: string; fetched?: number; inserted?: number }> = [];

  for (const run of pending) {
    let statusData: { status: string; defaultDatasetId: string };
    try {
      statusData = await getRunStatus(run.id, deps.apifyToken);
    } catch (err) {
      results.push({ runId: run.id, outcome: 'status-check-failed' });
      continue;
    }

    if (statusData.status === 'RUNNING' || statusData.status === 'READY') {
      results.push({ runId: run.id, outcome: 'still-running' });
      continue;
    }

    if (statusData.status !== 'SUCCEEDED') {
      await db.update(apifySeedRunSchema)
        .set({ status: 'failed', errorMessage: statusData.status, completedAt: new Date() })
        .where(eq(apifySeedRunSchema.id, run.id));
      results.push({ runId: run.id, outcome: `failed:${statusData.status}` });
      continue;
    }

    let rawItems: unknown[];
    try {
      rawItems = await getDatasetItems(statusData.defaultDatasetId, deps.apifyToken);
    } catch (err) {
      results.push({ runId: run.id, outcome: 'dataset-fetch-failed' });
      continue;
    }

    let rawTemplates: RawTemplate[];
    switch (run.provider) {
      case 'instagram':
        rawTemplates = rawItems.map(mapInstagramItem).filter((t): t is RawTemplate => t !== null);
        break;
      case 'tiktok':
        rawTemplates = rawItems.map(mapTikTokItem).filter((t): t is RawTemplate => t !== null);
        break;
      case 'tiktok-slideshow':
        // Actor emits one row per photo — the grouping helper collapses
        // rows sharing a videoId into a single RawTemplate whose
        // thumbnailUrls[] is the ordered list of slide URLs.
        rawTemplates = groupTikTokSlideshowItems(rawItems);
        break;
      default:
        console.warn(`[ApifyAsync] unknown provider "${run.provider}" — skipping run ${run.id}`);
        results.push({ runId: run.id, outcome: `unknown-provider:${run.provider}` });
        continue;
    }

    if (deps.cloudinary) configureCloudinary(deps.cloudinary);

    // Slideshows are images; everything else is video. Moderation policy
    // is keyed on ('tiktok', 'image') vs ('tiktok', 'video'), and
    // 'tiktok-slideshow' isn't in the policy table (see moderation-policy.ts),
    // so we normalize the provider key here.
    const isSlideshow = run.provider === 'tiktok-slideshow';
    const policyProviderKey = isSlideshow ? 'tiktok' : run.provider;
    const resourceKind: 'image' | 'video' = isSlideshow ? 'image' : 'video';
    const moderationParam = getModerationForProvider(policyProviderKey, resourceKind);
    const notificationUrl = getModerationWebhookUrl();

    let inserted = 0;
    let rejected = 0;
    for (const raw of rawTemplates) {
      try {
        const enriched = await enrichTemplateWithAI(raw, deps.anthropicApiKey);

        let mediaUrl = enriched.mediaUrl;
        let thumbnailUrl = enriched.thumbnailUrl;
        let thumbnailUrls: string[] | Record<string, string> | undefined = enriched.thumbnailUrls;
        let cloudinaryPublicId: string | null = null;
        let moderationPublicIds: string[] = [];
        let moderationStatus: string | null = null;
        let moderationKind: string | null = null;
        let moderationLabels: unknown = [];

        if (isSlideshow && deps.cloudinary) {
          // Slideshow path: upload EACH slide as an image with per-slide
          // moderation. All publicIds are tracked in moderationPublicIds so
          // the webhook can flip the row on any rejection (see
          // src/app/api/webhooks/cloudinary-moderation/route.ts).
          const rawSlides = Array.isArray(enriched.thumbnailUrls)
            ? (enriched.thumbnailUrls as string[])
            : [];
          const slideUrls = rawSlides.filter(u => typeof u === 'string' && u.startsWith('http'));

          if (slideUrls.length === 0) {
            console.warn(
              `[ApifyAsync/${run.provider}] no slide URLs for videoId=${raw.sourceVideoId} — skipping`,
            );
            continue;
          }

          const uploadedUrls: string[] = [];
          const uploadedPublicIds: string[] = [];
          let uploadFailed = false;

          for (let i = 0; i < slideUrls.length; i++) {
            const publicId = sanitizePublicId(
              `tiktok_slide_${raw.sourceVideoId}_${i + 1}_${Date.now()}`,
            );
            try {
              const upload = await uploadImageFromUrl(slideUrls[i]!, publicId, {
                moderation: moderationParam,
                notificationUrl,
              });
              uploadedUrls.push(upload.secureUrl);
              uploadedPublicIds.push(upload.publicId);
              // Any per-slide sync verdict (aws_rek returns synchronously)
              // takes over the row-level fields. Rejection short-circuits.
              const slideStatus = upload.moderation?.status ?? null;
              if (slideStatus === 'rejected') {
                moderationStatus = 'rejected';
                moderationKind = upload.moderation?.kind ?? null;
                moderationLabels = upload.moderationAll;
                break;
              }
              if (slideStatus === 'pending') {
                moderationStatus = 'pending';
                moderationKind = upload.moderation?.kind ?? null;
              } else if (slideStatus === 'approved' && moderationStatus !== 'rejected') {
                moderationStatus = moderationStatus ?? 'approved';
                moderationKind = upload.moderation?.kind ?? null;
              }
            } catch (err) {
              console.error(
                `[ApifyAsync/${run.provider}] slide upload failed (${i + 1}/${slideUrls.length}):`,
                err,
              );
              uploadFailed = true;
              moderationStatus = 'pending';
              break;
            }
          }

          if (uploadedUrls.length > 0) {
            thumbnailUrls = uploadedUrls;
            thumbnailUrl = uploadedUrls[0]!;
            cloudinaryPublicId = uploadedPublicIds[0]!;
            moderationPublicIds = uploadedPublicIds;
          } else if (uploadFailed) {
            // No slides uploaded — skip DB write entirely so we don't store
            // a slideshow row pointing at raw TikTok CDN URLs (they expire).
            continue;
          }
        } else if (deps.cloudinary && mediaUrl) {
          const publicId = sanitizePublicId(`${run.provider}_${raw.sourceVideoId}_${Date.now()}`);
          try {
            const upload = await uploadVideoFromUrl(mediaUrl, publicId, {
              moderation: moderationParam,
              notificationUrl,
            });
            mediaUrl = upload.secureUrl;
            thumbnailUrl = upload.thumbnailUrl ?? thumbnailUrl;
            cloudinaryPublicId = upload.publicId;
            moderationPublicIds = [upload.publicId];
            moderationStatus = upload.moderation?.status ?? null;
            moderationKind = upload.moderation?.kind ?? null;
            moderationLabels = upload.moderationAll;
          } catch (err) {
            // keep original media/thumbnail URLs on upload failure — do not
            // silently insert as approved though; mark it pending so the row
            // stays hidden until a human reviews or the hydrator retries.
            console.error(`[ApifyAsync/${run.provider}] upload failed:`, err);
            moderationStatus = 'pending';
          }
        }

        // Reject → skip DB entirely. Cloudinary already refuses to deliver
        // rejected assets; storing them just risks re-upload and further AUP
        // strikes if a future backfill re-touches them.
        if (moderationStatus === 'rejected') {
          rejected++;
          console.warn(
            `[ApifyAsync/${run.provider}] rejected by ${moderationKind}: ${raw.sourceUrl}`,
          );
          continue;
        }

        // Approved (sync moderation, e.g. aws_rek on images) → visible.
        // Pending (async, e.g. aws_rek_video) → hidden until the webhook
        // flips it. Missing (moderation disabled/failed) → conservative:
        // treat like pending so we never silently expose un-moderated media.
        const isModerationApproved = moderationStatus === 'approved';
        const insertActive = isModerationApproved;
        const insertCurationStatus = isModerationApproved
          ? ((run.params as any)?.curationStatus ?? 'pending')
          : 'pending_moderation';

        await db.insert(contentTemplateSchema)
          .values({
            sourceUrl: enriched.sourceUrl,
            sourcePlatform: enriched.sourcePlatform,
            sourceCreator: enriched.sourceCreator,
            sourceVideoId: enriched.sourceVideoId,
            mediaUrl,
            thumbnailUrl: thumbnailUrl ?? '',
            thumbnailUrls: (thumbnailUrls as any) ?? {},
            durationSeconds: enriched.durationSeconds,
            contentType: (enriched as any).contentType ?? 'unknown',
            niches: (enriched as any).niches ?? [],
            angles: (enriched as any).angles ?? [],
            structure: (enriched as any).structure ?? {},
            viewCount: (enriched as any).viewCount,
            likeCount: (enriched as any).likeCount,
            shareCount: (enriched as any).shareCount,
            commentCount: (enriched as any).commentCount,
            curationStatus: insertCurationStatus,
            isActive: insertActive,
            cloudinaryPublicId,
            moderationPublicIds,
            moderationApprovedIds: [],
            moderationStatus,
            moderationKind,
            moderationLabels: moderationLabels as any,
            moderationCheckedAt: moderationStatus ? new Date() : null,
          })
          .onConflictDoUpdate({
            target: contentTemplateSchema.sourceUrl,
            set: {
              mediaUrl,
              thumbnailUrl: thumbnailUrl ?? '',
              thumbnailUrls: (thumbnailUrls as any) ?? {},
              cloudinaryPublicId,
              moderationPublicIds,
              moderationApprovedIds: [],
              moderationStatus,
              moderationKind,
              moderationLabels: moderationLabels as any,
              moderationCheckedAt: moderationStatus ? new Date() : null,
              // If moderation is pending on a re-ingested row, hide it again
              // until the webhook re-confirms.
              isActive: insertActive,
              lastRefreshedAt: new Date(),
            },
          });
        inserted++;
      } catch (err) {
        console.error(`[ApifyAsync/${run.provider}] item failed:`, err);
      }
    }
    if (rejected > 0) {
      console.warn(
        `[ApifyAsync/${run.provider}] moderation rejected ${rejected}/${rawTemplates.length} items`,
      );
    }

    await db.update(apifySeedRunSchema)
      .set({
        status: 'processed',
        completedAt: new Date(),
        processedAt: new Date(),
        itemsFetched: rawTemplates.length,
        itemsInserted: inserted,
      })
      .where(eq(apifySeedRunSchema.id, run.id));

    results.push({ runId: run.id, outcome: 'processed', fetched: rawTemplates.length, inserted });
  }

  return results;
}