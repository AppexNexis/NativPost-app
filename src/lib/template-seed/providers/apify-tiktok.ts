/**
 * TikTok trending content provider via Apify's TikTok scraper.
 *
 * Actor: clockworks/tiktok-scraper
 * Docs:  https://apify.com/clockworks/tiktok-scraper
 *
 * Replaces the TikTok Research API provider, which is gated to
 * academic/non-profit institutions and unavailable to commercial products.
 *
 * Env var required: APIFY_TOKEN
 */

import type { ContentType, RawTemplate, SourcePlatform, ViralSourceProvider } from '../types';

export interface ApifyTikTokOptions {
  /** Apify API token. Falls back to APIFY_TOKEN env var. */
  apifyToken?: string;
  /** Hashtags to scrape (without the # prefix). */
  hashtags?: string[];
  /** Max videos to fetch per run (capped at 200 by Apify pagination). */
  limit?: number;
  /** Minimum play/view count to include a video. */
  minViews?: number;
}

const ACTOR_ID = 'clockworks~tiktok-scraper';
const APIFY_BASE = 'https://api.apify.com/v2';

const DEFAULT_HASHTAGS = [
  'viral',
  'trending',
  'business',
  'smallbusiness',
  'entrepreneur',
  'africa',
  'marketing',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickContentType(text: string): ContentType {
  const t = text.toLowerCase();
  if (t.includes('tutorial') || t.includes('how to') || t.includes('tips')) return 'video_hook_demo';
  if (t.includes('story') || t.includes('slideshow') || t.includes('photo')) return 'slideshow';
  if (t.includes('meme') || t.includes('green screen')) return 'green_screen_meme';
  if (t.includes('ugc') || t.includes('review') || t.includes('unboxing')) return 'ugc';
  if (t.includes('talk') || t.includes('advice') || t.includes('reminder')) return 'talking_head';
  return 'wall_of_text';
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function mapItem(item: Record<string, unknown>): RawTemplate | null {
  const videoId = String(item.id ?? '').trim();
  if (!videoId) return null;

  const description = String(item.text ?? item.desc ?? '');
  const title = description.slice(0, 120) || 'TikTok trending video';

  // author can be nested or flat depending on actor version
  const authorName =
    typeof item.authorMeta === 'object' && item.authorMeta !== null
      ? String((item.authorMeta as Record<string, unknown>).name ?? '')
      : String(item.author ?? item.username ?? '');

  // cover/thumbnail — actor exposes several fields
  const thumbnailUrl =
    (typeof item.covers === 'object' && item.covers !== null
      ? String((item.covers as Record<string, unknown>).default ?? '')
      : '') ||
    String(item.coverUrl ?? item.cover ?? '');

  // playable URL — actor may or may not expose a direct download link
  const mediaUrl =
    String(item.videoUrl ?? item.downloadUrl ?? item.playAddr ?? '');

  const sourceUrl =
    String(item.webVideoUrl ?? item.videoUrl ?? `https://www.tiktok.com/@${authorName}/video/${videoId}`);

  // duration lives inside videoMeta or at top level
  const durationRaw =
    typeof item.videoMeta === 'object' && item.videoMeta !== null
      ? (item.videoMeta as Record<string, unknown>).duration
      : item.duration;

  return {
    sourceUrl,
    sourcePlatform: 'tiktok' as SourcePlatform,
    sourceCreator: authorName || null,
    sourceVideoId: videoId,
    mediaUrl: mediaUrl || null,
    thumbnailUrl,
    durationSeconds: asNumber(durationRaw),
    contentType: pickContentType(description),
    viewCount: asNumber(item.playCount ?? item.views),
    likeCount: asNumber(item.diggCount ?? item.likesCount ?? item.likes),
    title,
    description,
  };
}

// ---------------------------------------------------------------------------
// Apify run helpers (shared pattern with Instagram provider)
// ---------------------------------------------------------------------------

async function startRun(actorId: string, token: string, input: unknown): Promise<{ id: string; defaultDatasetId: string }> {
  const res = await fetch(`${APIFY_BASE}/acts/${actorId}/runs?token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Apify actor start failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as { data: { id: string; defaultDatasetId: string } };
  return json.data;
}

async function waitForRun(
  runId: string,
  token: string,
  { pollMs = 6_000, maxMs = 240_000 } = {},
): Promise<void> {
  const deadline = Date.now() + maxMs;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs));

    const res = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${token}`);
    if (!res.ok) continue; // transient error — keep polling

    const { data } = (await res.json()) as { data: { status: string } };

    if (data.status === 'SUCCEEDED') return;
    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(data.status)) {
      throw new Error(`Apify run ${runId} ended with status: ${data.status}`);
    }
    // RUNNING / READY → keep polling
  }

  throw new Error(`Apify run ${runId} timed out after ${maxMs / 1000}s`);
}

async function fetchDataset<T>(datasetId: string, token: string, limit: number): Promise<T[]> {
  const url = `${APIFY_BASE}/datasets/${datasetId}/items?token=${token}&limit=${limit}&clean=true`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch Apify dataset ${datasetId}: ${res.status}`);
  }

  return res.json() as Promise<T[]>;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const apifyTikTokProvider: ViralSourceProvider = {
  name: 'tiktok',

  async fetch(options): Promise<RawTemplate[]> {
    const token =
      (options.apifyToken as string | undefined) ??
      process.env.APIFY_TOKEN ??
      '';

    if (!token) {
      console.warn('[Apify/TikTok] Skipping: APIFY_TOKEN is not configured.');
      return [];
    }

    const hashtags: string[] =
      Array.isArray(options.hashtags)
        ? (options.hashtags as string[])
        : DEFAULT_HASHTAGS;

    const limit = Math.min(
      typeof options.limit === 'number' ? options.limit : 50,
      200,
    );

    const minViews = typeof options.minViews === 'number' ? options.minViews : 5_000;

    console.log(`[Apify/TikTok] Starting scrape — hashtags: [${hashtags.join(', ')}], limit: ${limit}`);

    try {
      const input = {
        hashtags,
        resultsPerPage: limit,
        maxRequestRetries: 3,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
        shouldDownloadSubtitles: false,
        shouldDownloadSlideshowImages: false,
      };

      const run = await startRun(ACTOR_ID, token, input);
      console.log(`[Apify/TikTok] Run started: ${run.id}`);

      await waitForRun(run.id, token);
      console.log(`[Apify/TikTok] Run complete. Fetching dataset...`);

      const items = await fetchDataset<Record<string, unknown>>(
        run.defaultDatasetId,
        token,
        limit * 2, // fetch a bit more to account for filtering
      );

      console.log(`[Apify/TikTok] Raw items: ${items.length}`);

      const templates = items
        .filter((item) => {
          const views = asNumber(item.playCount ?? item.views);
          return views === null || views >= minViews;
        })
        .map(mapItem)
        .filter((t): t is RawTemplate => t !== null);

      console.log(`[Apify/TikTok] Mapped templates after filter: ${templates.length}`);
      return templates;
    } catch (err) {
      console.error('[Apify/TikTok] Failed:', err instanceof Error ? err.message : err);
      return [];
    }
  },
};