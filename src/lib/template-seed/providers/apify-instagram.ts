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
import {
  asNumber,
  fetchApifyDataset,
  startApifyRun,
  waitForApifyRun,
} from './apify-shared';

export type ApifyInstagramOptions = {
  /** Apify API token. Falls back to APIFY_TOKEN env var. */
  apifyToken?: string;
  /** Hashtags to scrape (with or without the # prefix — normalised internally). */
  hashtags?: string[];
  /** Max reels to fetch per run. */
  limit?: number;
  /** Minimum like count to include a reel. */
  minLikes?: number;
};

const ACTOR_ID = 'apify~instagram-reel-scraper';

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

function pickContentType(caption: string, hasCarousel: boolean): ContentType {
  if (hasCarousel) {
    return 'carousel';
  }
  const t = caption.toLowerCase();
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
  const candidates: unknown[] = [
    ...(Array.isArray(item.carouselMedia) ? item.carouselMedia : []),
    ...(Array.isArray(item.carousel_media) ? item.carousel_media : []),
    ...(Array.isArray(item.media) ? item.media : []),
    ...(Array.isArray(item.images) ? item.images : []),
  ];

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
      media.displayUrl ?? media.display_url ?? media.imageUrl ?? media.image_url ?? media.url ?? media.src ?? '',
    );
    if (url.startsWith('http')) {
      urls.push(url);
    }
  }

  return Array.from(new Set(urls));
}

function extractSlideCaptions(item: Record<string, unknown>): string[] {
  const captions: string[] = [];
  const allMedia = [
    ...(Array.isArray(item.carouselMedia) ? item.carouselMedia : []),
    ...(Array.isArray(item.carousel_media) ? item.carousel_media : []),
    ...(Array.isArray(item.media) ? item.media : []),
  ];

  for (const media of allMedia) {
    if (!media || typeof media !== 'object') {
      continue;
    }
    const caption = String((media as Record<string, unknown>).caption ?? (media as Record<string, unknown>).text ?? '');
    if (caption) {
      captions.push(caption);
    }
  }

  return captions;
}

function mapItem(item: Record<string, unknown>): RawTemplate | null {
  // The reel scraper returns shortCode or id
  const id = String(item.id ?? item.shortCode ?? '').trim();
  if (!id) {
    return null;
  }

  const caption = String(item.caption ?? item.text ?? '');
  const title = caption.slice(0, 120) || 'Instagram Reel';

  const ownerUsername = String(item.ownerUsername ?? item.username ?? '');

  const sourceUrl = String(item.url ?? item.permalink ?? `https://www.instagram.com/reel/${id}/`);

  // Video URL — actor exposes videoUrl for reels
  const mediaUrl = String(item.videoUrl ?? item.video_url ?? '');

  // Thumbnail — various field names across actor versions
  const thumbnailUrl = String(
    item.displayUrl ?? item.thumbnailUrl ?? item.thumbnail_url ?? item.displaySrc ?? '',
  );

  const slideUrls = extractSlideUrls(item);
  const isCarousel = slideUrls.length > 1;

  if (!mediaUrl && !thumbnailUrl) {
    return null;
  }

  return {
    sourceUrl,
    sourcePlatform: 'instagram' as SourcePlatform,
    sourceCreator: ownerUsername || null,
    sourceVideoId: id,
    sourcePostId: id,
    mediaUrl: mediaUrl || null,
    thumbnailUrl: slideUrls[0] || thumbnailUrl,
    thumbnailUrls: slideUrls.length > 0 ? slideUrls : {},
    slideCaptions: extractSlideCaptions(item),
    durationSeconds: asNumber(item.videoDuration ?? item.video_duration),
    contentType: pickContentType(caption, isCarousel),
    viewCount: asNumber(item.videoViewCount ?? item.video_view_count ?? item.playsCount),
    likeCount: asNumber(item.likesCount ?? item.likes_count ?? item.diggCount),
    title,
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

    const rawHashtags: string[] = Array.isArray(options.hashtags)
      ? (options.hashtags as string[])
      : DEFAULT_HASHTAGS;

    // Normalise — actor expects them without the # prefix
    const hashtags = rawHashtags.map(h => h.replace(/^#/, ''));

    const limit = Math.min(typeof options.limit === 'number' ? options.limit : 30, 200);
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

      const run = await startApifyRun(ACTOR_ID, token, input);
      console.log(`[Apify/Instagram] Run started: ${run.id}`);

      await waitForApifyRun(run.id, token);
      console.log('[Apify/Instagram] Run complete. Fetching dataset...');

      const items = await fetchApifyDataset<Record<string, unknown>>(
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
