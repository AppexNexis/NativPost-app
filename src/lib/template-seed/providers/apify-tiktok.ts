/**
 * TikTok content provider via Apify's TikTok scraper — profile-based discovery.
 *
 * Actor: clockworks/tiktok-scraper
 * Docs:  https://apify.com/clockworks/tiktok-scraper
 *
 * Replaces the TikTok Research API provider, which is gated to
 * academic/non-profit institutions and unavailable to commercial products.
 *
 * NOTE: Switched from hashtag-based discovery to profile-based discovery.
 * Public hashtag feeds (#viral, #trending, #fyp) are dominated by low-effort
 * spam/caption-farming accounts with no reliable engagement signal — the
 * same problem diagnosed on the Instagram side. Pulling from a curated list
 * of known hook/UGC-style accounts (see seed-accounts.ts) gives real
 * engagement numbers and content that actually matches our target style.
 *
 * FLAG: The `profiles` input field and related options below match
 * clockworks/tiktok-scraper's documented profile-scrape mode, but this
 * hasn't been confirmed against a live Input > JSON tab the way the
 * Instagram hashtag scraper schema was. Recommend checking
 * console.apify.com/actors/<this-actor>/input → JSON toggle before running
 * at scale, same process used to fix the Instagram provider.
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

export type ApifyTikTokOptions = {
  /** Apify API token. Falls back to APIFY_TOKEN env var. */
  apifyToken?: string;
  /** TikTok usernames to pull videos from (without the @ prefix). */
  usernames?: string[];
  /** Max videos to fetch per profile. */
  limit?: number;
  /** Skip the first N results (pagination). */
  offset?: number;
  /** Minimum play/view count to include a video. */
  minViews?: number;
};

const ACTOR_ID = 'clockworks~tiktok-scraper';

export const DEFAULT_USERNAMES = Array.from(
  new Set(
    Object.values(SEED_ACCOUNTS).flatMap(niche => niche.tiktok),
  ),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickContentType(text: string, isSlideshow: boolean): ContentType {
  if (isSlideshow) {
    return 'slideshow';
  }
  const t = text.toLowerCase();
  if (t.includes('tutorial') || t.includes('how to') || t.includes('tips')) {
    return 'video_hook_demo';
  }
  if (t.includes('story') || t.includes('slideshow') || t.includes('photo')) {
    return 'slideshow';
  }
  if (t.includes('meme') || t.includes('green screen')) {
    return 'green_screen_meme';
  }
  if (t.includes('ugc') || t.includes('review') || t.includes('unboxing')) {
    return 'ugc';
  }
  if (t.includes('talk') || t.includes('advice') || t.includes('reminder')) {
    return 'talking_head';
  }
  return 'wall_of_text';
}

function extractSlideUrls(item: Record<string, unknown>): string[] {
  // The clockworks scraper returns slideshow images under imagePost when
  // shouldDownloadSlideshowImages is enabled.
  const candidates: unknown[] = [];

  const imagePost = item.imagePost ?? item.image_post ?? item.slideshow ?? item.carousel;
  if (imagePost && typeof imagePost === 'object') {
    const post = imagePost as Record<string, unknown>;
    candidates.push(
      ...(Array.isArray(post.images) ? post.images : []),
      ...(Array.isArray(post.imageUrls) ? post.imageUrls : []),
      ...(Array.isArray(post.image_urls) ? post.image_urls : []),
      ...(Array.isArray(post.slides) ? post.slides : []),
    );
  }

  candidates.push(
    ...(Array.isArray(item.images) ? item.images : []),
    ...(Array.isArray(item.imageUrls) ? item.imageUrls : []),
    ...(Array.isArray(item.image_urls) ? item.image_urls : []),
    ...(Array.isArray(item.slides) ? item.slides : []),
  );

  const urls: string[] = [];
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      if (candidate.startsWith('http')) {
        urls.push(candidate);
      }
      continue;
    }
    if (!candidate || typeof candidate !== 'object') {
      continue;
    }
    const media = candidate as Record<string, unknown>;
    const url = String(
      media.url ?? media.imageUrl ?? media.image_url ?? media.src ?? media.displayUrl ?? media.display_url ?? '',
    );
    if (url.startsWith('http')) {
      urls.push(url);
    }
  }

  return Array.from(new Set(urls));
}

function mapItem(item: Record<string, unknown>): RawTemplate | null {
  const videoId = String(item.id ?? '').trim();
  if (!videoId) {
    return null;
  }

  const description = String(item.text ?? item.desc ?? '');
  const title = description.slice(0, 120) || 'TikTok video';

  // author can be nested or flat depending on actor version
  const authorName
    = typeof item.authorMeta === 'object' && item.authorMeta !== null
      ? String((item.authorMeta as Record<string, unknown>).name ?? '')
      : String(item.author ?? item.username ?? '');

  // cover/thumbnail — actor exposes several fields
  const thumbnailUrl
    = (typeof item.covers === 'object' && item.covers !== null
      ? String((item.covers as Record<string, unknown>).default ?? '')
      : '')
    || String(item.coverUrl ?? item.cover ?? '');

  // playable URL — actor may or may not expose a direct download link
  const mediaUrl = String(item.videoUrl ?? item.downloadUrl ?? item.playAddr ?? '');

  const sourceUrl = String(
    item.webVideoUrl ?? item.videoUrl ?? `https://www.tiktok.com/@${authorName}/video/${videoId}`,
  );

  // duration lives inside videoMeta or at top level
  const durationRaw
    = typeof item.videoMeta === 'object' && item.videoMeta !== null
      ? (item.videoMeta as Record<string, unknown>).duration
      : item.duration;

  const slideUrls = extractSlideUrls(item);
  const isSlideshow = slideUrls.length > 0;

  return {
    sourceUrl,
    sourcePlatform: 'tiktok' as SourcePlatform,
    sourceCreator: authorName || null,
    sourceVideoId: isSlideshow ? null : videoId,
    sourcePostId: videoId,
    mediaUrl: isSlideshow ? null : mediaUrl || null,
    thumbnailUrl: slideUrls[0] || thumbnailUrl,
    thumbnailUrls: slideUrls.length > 0 ? slideUrls : {},
    slideCaptions: [],
    durationSeconds: asNumber(durationRaw),
    contentType: pickContentType(description, isSlideshow),
    viewCount: asNumber(item.playCount ?? item.views),
    likeCount: asNumber(item.diggCount ?? item.likesCount ?? item.likes),
    title,
    description,
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const apifyTikTokProvider: ViralSourceProvider = {
  name: 'tiktok',

  async fetch(options): Promise<RawTemplate[]> {
    const token
      = (options.apifyToken as string | undefined)
        ?? process.env.APIFY_TOKEN
        ?? '';

    if (!token) {
      console.warn('[Apify/TikTok] Skipping: APIFY_TOKEN is not configured.');
      return [];
    }

    const usernames: string[] = Array.isArray(options.usernames) && options.usernames.length > 0
      ? (options.usernames as string[])
      : DEFAULT_USERNAMES;

    const limit = Math.min(typeof options.limit === 'number' ? options.limit : 15, 100);
    const offset = Math.max(0, typeof options.offset === 'number' ? options.offset : 0);
    const minViews = typeof options.minViews === 'number' ? options.minViews : 0;

    console.log(`[Apify/TikTok] Starting profile scrape — accounts: [${usernames.join(', ')}], limit/account: ${limit}`);

    try {
      const input = {
        profiles: usernames,
        resultsPerPage: limit,
        profileScrapeSections: ['videos'],
        profileSorting: 'latest',
        maxRequestRetries: 3,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
        shouldDownloadSubtitles: false,
        // Enable slideshow image extraction so photo posts import as slideshows
        shouldDownloadSlideshowImages: true,
      };

      const run = await startApifyRun(ACTOR_ID, token, input);
      console.log(`[Apify/TikTok] Run started: ${run.id}`);

      await waitForApifyRun(run.id, token);
      console.log('[Apify/TikTok] Run complete. Fetching dataset...');

      const items = await fetchApifyDataset<Record<string, unknown>>(
        run.defaultDatasetId,
        token,
        usernames.length * limit * 2,
      );

      console.log(`[Apify/TikTok] Raw items: ${items.length}`);

      const templates = items
        .filter((item) => {
          const views = asNumber(item.playCount ?? item.views);
          return views === null || views >= minViews;
        })
        .map(mapItem)
        .filter((t): t is RawTemplate => t !== null)
        .slice(offset);

      console.log(`[Apify/TikTok] Mapped templates after filter + offset ${offset}: ${templates.length}`);
      return templates;
    } catch (err) {
      console.error('[Apify/TikTok] Failed:', err instanceof Error ? err.message : err);
      return [];
    }
  },
};