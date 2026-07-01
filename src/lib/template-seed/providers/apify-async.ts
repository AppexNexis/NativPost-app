import { db } from '@/lib/db'; // adjust to your actual db client path
import { apifySeedRunSchema, contentTemplateSchema } from './../../../models/Schema';
import { eq } from 'drizzle-orm';
import { enrichTemplateWithAI } from '../ai';
import { configureCloudinary, uploadVideoFromUrl } from '../cloudinary';
import { DEFAULT_USERNAMES as IG_DEFAULT_USERNAMES } from './apify-instagram';
import { DEFAULT_USERNAMES as TT_DEFAULT_USERNAMES } from './apify-tiktok';
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

    const mapper = run.provider === 'instagram' ? mapInstagramItem : mapTikTokItem;
    const rawTemplates = rawItems.map(mapper).filter((t): t is RawTemplate => t !== null);

    if (deps.cloudinary) configureCloudinary(deps.cloudinary);

    let inserted = 0;
    for (const raw of rawTemplates) {
      try {
        const enriched = await enrichTemplateWithAI(raw, deps.anthropicApiKey);

        let mediaUrl = enriched.mediaUrl;
        let thumbnailUrl = enriched.thumbnailUrl;

        if (deps.cloudinary && mediaUrl) {
          const publicId = sanitizePublicId(`${run.provider}_${raw.sourceVideoId}_${Date.now()}`);
          try {
            const upload = await uploadVideoFromUrl(mediaUrl, publicId);
            mediaUrl = upload.secureUrl;
            thumbnailUrl = upload.thumbnailUrl ?? thumbnailUrl;
          } catch {
            // keep original media/thumbnail URLs on upload failure
          }
        }

        await db.insert(contentTemplateSchema)
          .values({
            sourceUrl: enriched.sourceUrl,
            sourcePlatform: enriched.sourcePlatform,
            sourceCreator: enriched.sourceCreator,
            sourceVideoId: enriched.sourceVideoId,
            mediaUrl,
            thumbnailUrl: thumbnailUrl ?? '',
            durationSeconds: enriched.durationSeconds,
            contentType: (enriched as any).contentType ?? 'unknown',
            niches: (enriched as any).niches ?? [],
            angles: (enriched as any).angles ?? [],
            structure: (enriched as any).structure ?? {},
            viewCount: (enriched as any).viewCount,
            likeCount: (enriched as any).likeCount,
            shareCount: (enriched as any).shareCount,
            commentCount: (enriched as any).commentCount,
            curationStatus: (run.params as any)?.curationStatus ?? 'pending',
          })
          .onConflictDoUpdate({
            target: contentTemplateSchema.sourceUrl,
            set: {
              mediaUrl,
              thumbnailUrl: thumbnailUrl ?? '',
              lastRefreshedAt: new Date(),
            },
          });
        inserted++;
      } catch (err) {
        console.error(`[ApifyAsync/${run.provider}] item failed:`, err);
      }
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