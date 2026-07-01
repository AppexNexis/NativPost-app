/**
 * Instagram trending content provider via Apify.
 *
 * Actor: apify/instagram-hashtag-scraper
 * Docs:  https://apify.com/apify/instagram-hashtag-scraper
 *
 * Replaces the Instagram Basic Display API provider, which was permanently
 * shut down on December 4 2024. The Graph API replacement only exposes
 * content from accounts you own — it has no endpoint for discovering other
 * people's trending content.
 *
 * NOTE: This provider previously targeted apify/instagram-reel-scraper,
 * which does NOT support hashtag-based discovery — it requires a specific
 * username/profile/reel URL as input. instagram-hashtag-scraper is the
 * correct actor for hashtag-driven trending discovery; it accepts a list
 * of hashtags directly (confirmed via the actor's own Input > JSON tab).
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
  /** Max posts/reels to fetch per hashtag. */
  limit?: number;
  /** Skip the first N results (pagination). */
  offset?: number;
  /** Minimum like count to include an item. */
  minLikes?: number;
  /**
   * What to scrape per hashtag. The actor's Content-type dropdown maps to
   * this field. Defaults to 'posts' to match the actor's own default —
   * change to 'reels' if you want reel-only results once confirmed via a
   * live run.
   */
  resultsType?: 'posts' | 'reels';
};

const ACTOR_ID = 'apify~instagram-hashtag-scraper';

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
    return 'slideshow';
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
    ...(Array.isArray(item.childPosts) ? item.childPosts : []),
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
    ...(Array.isArray(item.childPosts) ? item.childPosts : []),
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
  const id = String(item.id ?? item.shortCode ?? item.short_code ?? '').trim();
  if (!id) {
    return null;
  }

  const caption = String(item.caption ?? item.text ?? item.description ?? '');
  const title = caption.slice(0, 120) || 'Instagram post';

  const ownerUsername = String(
    item.ownerUsername ?? item.owner_username ?? item.username ?? item.ownerFullName ?? '',
  );

  const sourceUrl = String(
    item.url ?? item.permalink ?? item.postUrl ?? `https://www.instagram.com/p/${id}/`,
  );

  // Video URL — reels/videos expose one of these; carousels/photos won't.
  const mediaUrl = String(item.videoUrl ?? item.video_url ?? '');

  // Thumbnail — various field names across actor response shapes.
  const thumbnailUrl = String(
    item.displayUrl ?? item.display_url ?? item.thumbnailUrl ?? item.thumbnail_url ?? item.images ?? '',
  );

  const slideUrls = extractSlideUrls(item);
  const isCarousel = slideUrls.length > 1;

  if (!mediaUrl && !thumbnailUrl && slideUrls.length === 0) {
    return null;
  }

  return {
    sourceUrl,
    sourcePlatform: 'instagram' as SourcePlatform,
    sourceCreator: ownerUsername || null,
    sourceVideoId: isCarousel ? null : id,
    sourcePostId: id,
    mediaUrl: mediaUrl || null,
    thumbnailUrl: slideUrls[0] || thumbnailUrl,
    thumbnailUrls: slideUrls.length > 0 ? slideUrls : {},
    slideCaptions: extractSlideCaptions(item),
    durationSeconds: asNumber(item.videoDuration ?? item.video_duration),
    contentType: pickContentType(caption, isCarousel),
    viewCount: asNumber(item.videoViewCount ?? item.video_view_count ?? item.videoPlayCount ?? item.playsCount),
    likeCount: asNumber(item.likesCount ?? item.likes_count ?? item.likeCount),
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
    const offset = Math.max(0, typeof options.offset === 'number' ? options.offset : 0);
    const minLikes = typeof options.minLikes === 'number' ? options.minLikes : 200;
    const resultsType = options.resultsType === 'reels' ? 'reels' : 'posts';

    console.log(`[Apify/Instagram] Starting scrape — hashtags: [${hashtags.join(', ')}], limit: ${limit}, type: ${resultsType}`);

    try {
      const input = {
        hashtags,
        keywordSearch: false,
        resultsLimit: limit,
        resultsType,
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
          const likes = asNumber(item.likesCount ?? item.likes_count ?? item.likeCount);
          return likes === null || likes >= minLikes;
        })
        .map(mapItem)
        .filter((t): t is RawTemplate => t !== null)
        .slice(offset);

      console.log(`[Apify/Instagram] Mapped templates after filter + offset ${offset}: ${templates.length}`);
      return templates;
    } catch (err) {
      console.error('[Apify/Instagram] Failed:', err instanceof Error ? err.message : err);
      return [];
    }
  },
};