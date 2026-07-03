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
import {
  buildInstagramProfileInput,
  groupInstagramCarousels,
  INSTAGRAM_PROFILE_ACTOR_ID,
} from './apify-instagram-profile';
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

type StartInstagramCarouselParams = {
  apifyToken: string;
  usernames: string[];
  limit?: number;
  curationStatus?: 'pending' | 'approved' | 'rejected';
};

export async function startInstagramCarouselIngest(
  params: StartInstagramCarouselParams,
) {
  const usernames = (params.usernames ?? [])
    .map(u => u.replace(/^@/, '').trim())
    .filter(Boolean);
  if (usernames.length === 0) {
    throw new Error('startInstagramCarouselIngest: no valid usernames provided');
  }
  const limit = params.limit ?? Math.min(usernames.length * 12, 200);

  const runId = await startActorRun(
    INSTAGRAM_PROFILE_ACTOR_ID,
    buildInstagramProfileInput(usernames, limit),
    params.apifyToken,
  );

  await db.insert(apifySeedRunSchema).values({
    id: runId,
    provider: 'instagram-carousel',
    actorId: INSTAGRAM_PROFILE_ACTOR_ID,
    status: 'pending',
    params: {
      usernames,
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

type ProcessDeps = {
  apifyToken: string;
  anthropicApiKey: string;
  cloudinary?: { cloudName: string; apiKey: string; apiSecret: string };
  /** Cap total items uploaded per invocation to stay under Vercel's 300s cap. */
  maxTemplatesPerInvocation?: number;
};

const CLOUDINARY_HOST_HINT = 'res.cloudinary.com';

// Skip templates whose sourceUrl already exists in DB with a Cloudinary-hosted
// media or thumbnail. Repeat /process calls re-fetch the same Apify dataset,
// so without this check we'd re-upload the same items every time and never
// drain the queue.
async function isAlreadyFullyProcessed(sourceUrl: string): Promise<boolean> {
  const existing = await db
    .select({
      mediaUrl: contentTemplateSchema.mediaUrl,
      thumbnailUrl: contentTemplateSchema.thumbnailUrl,
    })
    .from(contentTemplateSchema)
    .where(eq(contentTemplateSchema.sourceUrl, sourceUrl))
    .limit(1);
  const row = existing[0];
  if (!row) return false;
  const media = (row.mediaUrl ?? '').toLowerCase();
  const thumb = (row.thumbnailUrl ?? '').toLowerCase();
  // Video path: mediaUrl on Cloudinary = done.
  // Slideshow path: mediaUrl is null by design; thumbnailUrl on Cloudinary = done.
  return media.includes(CLOUDINARY_HOST_HINT) || thumb.includes(CLOUDINARY_HOST_HINT);
}

export async function processPendingApifyRuns(deps: ProcessDeps) {
  const pending = await db
    .select()
    .from(apifySeedRunSchema)
    .where(eq(apifySeedRunSchema.status, 'pending'));

  const results: Array<{
    runId: string;
    outcome: string;
    fetched?: number;
    inserted?: number;
    remaining?: number;
    skippedExisting?: number;
    rejected?: number;
    noSlideUrls?: number;
    uploadFailed?: number;
    errored?: number;
  }> = [];

  // Vercel Hobby caps functions at 300s. Each Cloudinary upload takes
  // ~2-3s (image) or ~10-15s (video sync transcode). An IG carousel with
  // 8 slides = ~24s alone. Cap total per-invocation uploads so we always
  // return before the timeout; the caller can re-invoke to drain the rest.
  const maxTemplates = Math.max(1, deps.maxTemplatesPerInvocation ?? 6);
  let totalProcessedThisInvocation = 0;

  outer: for (const run of pending) {
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
      case 'instagram-carousel':
        // Profile scrape returns all post types; the grouping helper
        // filters to carousels (sidecar) only and normalizes slide URLs
        // into thumbnailUrls[] so the per-slide upload path handles it.
        rawTemplates = groupInstagramCarousels(rawItems);
        break;
      default:
        console.warn(`[ApifyAsync] unknown provider "${run.provider}" — skipping run ${run.id}`);
        results.push({ runId: run.id, outcome: `unknown-provider:${run.provider}` });
        continue;
    }

    if (deps.cloudinary) configureCloudinary(deps.cloudinary);

    // Slideshows (TikTok photo posts + Instagram carousels) are images;
    // everything else is video. Moderation policy is keyed on the base
    // provider ('tiktok' / 'instagram'), and the derived providers
    // ('tiktok-slideshow' / 'instagram-carousel') aren't in the policy table
    // (see moderation-policy.ts), so we normalize the provider key here.
    const isSlideshow =
      run.provider === 'tiktok-slideshow' || run.provider === 'instagram-carousel';
    let policyProviderKey: string;
    if (run.provider === 'tiktok-slideshow') {
      policyProviderKey = 'tiktok';
    } else if (run.provider === 'instagram-carousel') {
      policyProviderKey = 'instagram';
    } else {
      policyProviderKey = run.provider;
    }
    const resourceKind: 'image' | 'video' = isSlideshow ? 'image' : 'video';
    const rawModerationParam = getModerationForProvider(policyProviderKey, resourceKind);

    // Killswitch: MODERATION_BYPASS_VIDEO=true skips the aws_rek_video add-on
    // (e.g. when quota is exhausted) and forces the row into a 'pending_manual'
    // state so it stays hidden until a human approves it in admin.
    // Only applies to video uploads — slideshows use the image moderation
    // add-on which is on a separate quota.
    const bypassVideo =
      !isSlideshow && process.env.MODERATION_BYPASS_VIDEO === 'true';
    const moderationParam = bypassVideo ? undefined : rawModerationParam;
    const notificationUrl = bypassVideo ? undefined : getModerationWebhookUrl();

    let inserted = 0;
    let rejected = 0;
    let skippedExisting = 0;
    let noSlideUrls = 0;
    let uploadFailedCount = 0;
    let errored = 0;
    let hitCap = false;
    for (const raw of rawTemplates) {
      // Resume-safe: repeat /process invocations re-fetch the same Apify
      // dataset, so we must skip items we already uploaded to Cloudinary
      // on a prior invocation. Otherwise a large IG carousel run never
      // drains — every /process call re-uploads the first N items.
      if (await isAlreadyFullyProcessed(raw.sourceUrl)) {
        skippedExisting++;
        continue;
      }

      // Per-invocation cap so we return before Vercel's 300s timeout.
      // Leave the run in 'pending' status; the next /process call resumes.
      if (totalProcessedThisInvocation >= maxTemplates) {
        hitCap = true;
        break;
      }

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
              `[ApifyAsync/${run.provider}] no slide URLs for videoId=${raw.sourceVideoId} — enriched.thumbnailUrls type=${typeof enriched.thumbnailUrls} isArray=${Array.isArray(enriched.thumbnailUrls)} rawLen=${rawSlides.length}`,
            );
            noSlideUrls++;
            continue;
          }

          const uploadedUrls: string[] = [];
          const uploadedPublicIds: string[] = [];
          let uploadFailed = false;

          for (let i = 0; i < slideUrls.length; i++) {
            const publicId = sanitizePublicId(
              `${run.provider}_slide_${raw.sourceVideoId}_${i + 1}_${Date.now()}`,
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
                `[ApifyAsync/${run.provider}] slide upload failed (${i + 1}/${slideUrls.length}): ${formatCloudinaryError(err)}`,
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
            uploadFailedCount++;
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
            // Bypass mode: no moderation ran → force manual review state.
            // The insert logic below already hides anything not 'approved',
            // so 'pending_manual' rows stay isActive=false + hidden until
            // an admin approves them.
            if (bypassVideo) {
              moderationStatus = 'pending_manual';
              moderationKind = 'bypass';
            }
          } catch (err) {
            // keep original media/thumbnail URLs on upload failure — do not
            // silently insert as approved though; mark it pending so the row
            // stays hidden until a human reviews or the hydrator retries.
            console.error(`[ApifyAsync/${run.provider}] upload failed: ${formatCloudinaryError(err)}`);
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
        totalProcessedThisInvocation++;
      } catch (err) {
        errored++;
        console.error(`[ApifyAsync/${run.provider}] item failed:`, err);
      }
    }
    if (rejected > 0) {
      console.warn(
        `[ApifyAsync/${run.provider}] moderation rejected ${rejected}/${rawTemplates.length} items`,
      );
    }

    // Only flip run → 'processed' when we drained every item. If we hit the
    // per-invocation cap, leave it 'pending' so the next /process call
    // picks up remaining items (isAlreadyFullyProcessed skips finished ones).
    const remaining = rawTemplates.length - skippedExisting - inserted - rejected;
    if (hitCap && remaining > 0) {
      results.push({
        runId: run.id,
        outcome: 'partial',
        fetched: rawTemplates.length,
        inserted,
        remaining,
      });
      // Break out of the outer run loop too — we've hit our compute budget.
      break outer;
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

    // Include every silent-drop counter so a "0 inserted" result is
    // self-explaining: dedup vs AI-reject vs empty-slides vs upload-fail
    // vs thrown-error are all now visible.
    results.push({
      runId: run.id,
      outcome: 'processed',
      fetched: rawTemplates.length,
      inserted,
      skippedExisting,
      rejected,
      noSlideUrls,
      uploadFailed: uploadFailedCount,
      errored,
    });
  }

  return results;
}