/**
 * Instagram Reels content provider via Apify — profile-based discovery.
 *
 * Actor: apify/instagram-reel-scraper
 * Docs:  https://apify.com/apify/instagram-reel-scraper
 *
 * Switched from hashtag-based discovery (apify/instagram-hashtag-scraper) to
 * profile-based discovery. Public hashtag feeds are dominated by spam/caption
 * farming accounts with no reliable engagement signal (IG withholds real like
 * counts on scraped feed data — confirmed via a live hashtag-scraper run
 * that returned ~100 items, almost all with likesCount 0 or -1 and
 * "Access delayed" owner names). Pulling from a curated list of known
 * hook/UGC-style accounts gives real transcripts, real engagement numbers,
 * and actual downloaded video.
 *
 * Niche/category tagging is NOT done here — that's handled downstream by
 * enrichTemplateWithAI, same as before.
 *
 * Env var required: APIFY_TOKEN
 */

import type { ContentType, RawTemplate, SourcePlatform, ViralSourceProvider } from '../types';
import {
  asNumber,
  fetchApifyDataset,
  startApifyRun,
  waitForApifyRun,
} from './apify-shared';
import { SEED_ACCOUNTS } from './seed-accounts';

export type ApifyInstagramOptions = {
  apifyToken?: string;
  /** Instagram usernames/profile URLs to pull reels from. */
  usernames?: string[];
  /** Max reels per profile. */
  limit?: number;
  offset?: number;
  minLikes?: number;
};

const ACTOR_ID = 'apify~instagram-reel-scraper';

export const DEFAULT_USERNAMES = Array.from(
  new Set(
    Object.values(SEED_ACCOUNTS).flatMap(niche => niche.instagram),
  ),
);

function pickContentType(caption: string): ContentType {
  const t = caption.toLowerCase();
  if (t.includes('tutorial') || t.includes('how to') || t.includes('tips')) return 'video_hook_demo';
  if (t.includes('ugc') || t.includes('review') || t.includes('unboxing')) return 'ugc';
  if (t.includes('talk') || t.includes('advice') || t.includes('reminder')) return 'talking_head';
  return 'wall_of_text';
}

function mapItem(item: Record<string, unknown>): RawTemplate | null {
  const id = String(item.id ?? item.shortCode ?? item.short_code ?? '').trim();
  if (!id) return null;

  const caption = String(item.caption ?? item.text ?? '');
  const ownerUsername = String(item.ownerUsername ?? item.owner_username ?? item.username ?? '');
  const sourceUrl = String(item.url ?? item.webVideoUrl ?? `https://www.instagram.com/reel/${id}/`);
  const mediaUrl = String(item.videoUrl ?? item.video_url ?? item.downloadUrl ?? '');
  const thumbnailUrl = String(item.displayUrl ?? item.thumbnailUrl ?? item.coverUrl ?? '');

  if (!mediaUrl && !thumbnailUrl) return null;

  return {
    sourceUrl,
    sourcePlatform: 'instagram' as SourcePlatform,
    sourceCreator: ownerUsername || null,
    sourceVideoId: id,
    sourcePostId: id,
    mediaUrl: mediaUrl || null,
    thumbnailUrl,
    thumbnailUrls: {},
    slideCaptions: [],
    durationSeconds: asNumber(item.duration ?? item.videoDuration),
    contentType: pickContentType(caption),
    viewCount: asNumber(item.videoViewCount ?? item.playsCount ?? item.views),
    likeCount: asNumber(item.likesCount ?? item.likes),
    title: caption.slice(0, 120) || 'Instagram reel',
    description: caption,
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const apifyInstagramProvider: ViralSourceProvider = {
  name: 'instagram',

  async fetch(options): Promise<RawTemplate[]> {
    const token
      = (options.apifyToken as string | undefined)
        ?? process.env.APIFY_TOKEN
        ?? '';

    if (!token) {
      console.warn('[Apify/Instagram] Skipping: APIFY_TOKEN is not configured.');
      return [];
    }

    const usernames: string[] = Array.isArray(options.usernames) && options.usernames.length > 0
      ? (options.usernames as string[])
      : DEFAULT_USERNAMES;

    const limit = Math.min(typeof options.limit === 'number' ? options.limit : 15, 50);
    const offset = Math.max(0, typeof options.offset === 'number' ? options.offset : 0);
    const minLikes = typeof options.minLikes === 'number' ? options.minLikes : 0;

    console.log(`[Apify/Instagram] Starting reel scrape — accounts: [${usernames.join(', ')}], limit/account: ${limit}`);

    try {
      const input = {
        username: usernames,
        resultsLimit: limit,
      };

      const run = await startApifyRun(ACTOR_ID, token, input);
      console.log(`[Apify/Instagram] Run started: ${run.id}`);

      await waitForApifyRun(run.id, token);
      console.log('[Apify/Instagram] Run complete. Fetching dataset...');

      const items = await fetchApifyDataset<Record<string, unknown>>(
        run.defaultDatasetId,
        token,
        usernames.length * limit * 2,
      );

      console.log(`[Apify/Instagram] Raw items: ${items.length}`);

      const templates = items
        .filter((item) => {
          const likes = asNumber(item.likesCount ?? item.likes_count ?? item.likeCount);
          return likes === null || likes >= minLikes;
        })
        .map(mapItem)
        .filter((t): t is RawTemplate => t !== null)
        .slice(offset);

      console.log(`[Apify/Instagram] Mapped templates: ${templates.length}`);
      return templates;
    } catch (err) {
      console.error('[Apify/Instagram] Failed:', err instanceof Error ? err.message : err);
      return [];
    }
  },
};