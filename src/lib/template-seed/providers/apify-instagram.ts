/**
 * Instagram Reels trending content provider via Apify.
 *
 * Actor: apify/instagram-reel-scraper
 * Docs:  https://apify.com/apify/instagram-reel-scraper
 *
 * Replaces the Instagram Basic Display API provider, which was permanently
 * shut down on December 4 2024. The Graph API replacement only exposes
 * content from accounts you own — it has no endpoint for discovering other
 * people's trending content. Apify's scraper solves both problems.
 *
 * Env var required: APIFY_TOKEN
 */

import type { ContentType, RawTemplate, SourcePlatform, ViralSourceProvider } from '../types';

export interface ApifyInstagramOptions {
  /** Apify API token. Falls back to APIFY_TOKEN env var. */
  apifyToken?: string;
  /** Hashtags to scrape (with or without the # prefix — normalised internally). */
  hashtags?: string[];
  /** Max reels to fetch per run. */
  limit?: number;
  /** Minimum like count to include a reel. */
  minLikes?: number;
}

const ACTOR_ID = 'apify~instagram-reel-scraper';
const APIFY_BASE = 'https://api.apify.com/v2';

const DEFAULT_HASHTAGS = [
  'smallbusiness',
  'entrepreneur',
  'viral',
  'businesstips',
  'africanbusiness',
  'marketing',
  'trending',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickContentType(caption: string): ContentType {
  const t = caption.toLowerCase();
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
  // The reel scraper returns shortCode or id
  const id = String(item.id ?? item.shortCode ?? '').trim();
  if (!id) return null;

  const caption = String(item.caption ?? item.text ?? '');
  const title = caption.slice(0, 120) || 'Instagram Reel';

  const ownerUsername = String(item.ownerUsername ?? item.username ?? '');

  const sourceUrl =
    String(item.url ?? item.permalink ?? `https://www.instagram.com/reel/${id}/`);

  // Video URL — actor exposes videoUrl for reels
  const mediaUrl = String(item.videoUrl ?? item.video_url ?? '');

  // Thumbnail — various field names across actor versions
  const thumbnailUrl =
    String(item.displayUrl ?? item.thumbnailUrl ?? item.thumbnail_url ?? item.displaySrc ?? '');

  if (!mediaUrl && !thumbnailUrl) return null;

  return {
    sourceUrl,
    sourcePlatform: 'instagram' as SourcePlatform,
    sourceCreator: ownerUsername || null,
    sourceVideoId: id,
    mediaUrl: mediaUrl || null,
    thumbnailUrl,
    durationSeconds: asNumber(item.videoDuration ?? item.video_duration),
    contentType: pickContentType(caption),
    viewCount: asNumber(item.videoViewCount ?? item.video_view_count ?? item.playsCount),
    likeCount: asNumber(item.likesCount ?? item.likes_count ?? item.diggCount),
    title,
    description: caption,
  };
}

// ---------------------------------------------------------------------------
// Apify run helpers (same pattern as apify-tiktok.ts)
// ---------------------------------------------------------------------------

async function startRun(
  actorId: string,
  token: string,
  input: unknown,
): Promise<{ id: string; defaultDatasetId: string }> {
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
  { pollMs = 6_000, maxMs = 300_000 } = {},
): Promise<void> {
  const deadline = Date.now() + maxMs;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs));

    const res = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${token}`);
    if (!res.ok) continue;

    const { data } = (await res.json()) as { data: { status: string } };

    if (data.status === 'SUCCEEDED') return;
    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(data.status)) {
      throw new Error(`Apify run ${runId} ended with status: ${data.status}`);
    }
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

export const apifyInstagramProvider: ViralSourceProvider = {
  name: 'instagram',

  async fetch(options): Promise<RawTemplate[]> {
    const token =
      (options.apifyToken as string | undefined) ??
      process.env.APIFY_TOKEN ??
      '';

    if (!token) {
      console.warn('[Apify/Instagram] Skipping: APIFY_TOKEN is not configured.');
      return [];
    }

    const rawHashtags: string[] =
      Array.isArray(options.hashtags)
        ? (options.hashtags as string[])
        : DEFAULT_HASHTAGS;

    // Normalise — actor expects them without the # prefix
    const hashtags = rawHashtags.map((h) => h.replace(/^#/, ''));

    const limit = Math.min(
      typeof options.limit === 'number' ? options.limit : 30,
      200,
    );

    const minLikes = typeof options.minLikes === 'number' ? options.minLikes : 200;

    console.log(`[Apify/Instagram] Starting scrape — hashtags: [${hashtags.join(', ')}], limit: ${limit}`);

    try {
      const input = {
        hashtags,
        resultsLimit: limit,
        // Only pull content from the last 60 days so results are fresh
        onlyPostsNewerThan: '60 days',
        addParentData: false,
      };

      const run = await startRun(ACTOR_ID, token, input);
      console.log(`[Apify/Instagram] Run started: ${run.id}`);

      await waitForRun(run.id, token);
      console.log(`[Apify/Instagram] Run complete. Fetching dataset...`);

      const items = await fetchDataset<Record<string, unknown>>(
        run.defaultDatasetId,
        token,
        limit * 2,
      );

      console.log(`[Apify/Instagram] Raw items: ${items.length}`);

      const templates = items
        .filter((item) => {
          const likes = asNumber(item.likesCount ?? item.likes_count ?? item.diggCount);
          return likes === null || likes >= minLikes;
        })
        .map(mapItem)
        .filter((t): t is RawTemplate => t !== null);

      console.log(`[Apify/Instagram] Mapped templates after filter: ${templates.length}`);
      return templates;
    } catch (err) {
      console.error('[Apify/Instagram] Failed:', err instanceof Error ? err.message : err);
      return [];
    }
  },
};