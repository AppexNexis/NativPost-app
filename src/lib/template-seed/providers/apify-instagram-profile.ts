/**
 * Profile-based Instagram carousel discovery via Apify.
 *
 * Actor: apify/instagram-scraper (flagship, supports profile URLs +
 *        returns all post types with a `type` discriminator).
 * Docs:  https://apify.com/apify/instagram-scraper
 *
 * Complements the URL-based apify-instagram-post-scraper: this provider
 * takes creator handles ("sahilbloom", "@thepsychnp", …) and pulls their
 * recent posts, then filters server-side to carousels only ("Sidecar" in
 * Instagram's internal type vocabulary; 2+ slide media).
 *
 * Output rows are shaped identically to tiktok-slideshow rows so the
 * per-slide Cloudinary upload block in apify-async.ts handles both.
 *
 * Env var required: APIFY_TOKEN
 */

import type { RawTemplate, SourcePlatform } from '../types';
import { asNumber } from './apify-shared';

export type ApifyInstagramProfileOptions = {
  /** Apify API token. Falls back to APIFY_TOKEN env var. */
  apifyToken?: string;
  /** Instagram usernames (with or without leading @). */
  usernames: string[];
  /** Max posts to fetch PER PROFILE. */
  limit?: number;
};

export const INSTAGRAM_PROFILE_ACTOR_ID = 'apify~instagram-scraper';

/**
 * Build the actor input shape for `apify/instagram-scraper`.
 * Uses profile URLs (not usernames) since `directUrls` is the actor's
 * canonical entry point and works uniformly for profile/hashtag/post.
 */
export function buildInstagramProfileInput(
  usernames: string[],
  limit: number,
): Record<string, unknown> {
  const directUrls = usernames
    .map(u => u.replace(/^@/, '').trim())
    .filter(Boolean)
    .map(u => `https://www.instagram.com/${u}/`);
  return {
    directUrls,
    resultsType: 'posts',
    resultsLimit: limit,
    searchType: 'user',
    addParentData: false,
  };
}

/**
 * Recognize a carousel post across actor-version variations. Instagram's
 * internal name for carousel is "Sidecar"; some versions of the scraper
 * emit "Carousel", "carousel", or just leave `type` blank when the media
 * array has 2+ children.
 */
function isCarousel(item: Record<string, unknown>): boolean {
  const raw = String(item.type ?? item.__typename ?? '').toLowerCase();
  if (raw === 'sidecar' || raw === 'carousel' || raw.includes('carousel')) {
    return true;
  }
  // Fallback: multi-child post regardless of type label.
  if (Array.isArray(item.childPosts) && item.childPosts.length > 1) return true;
  if (Array.isArray(item.images) && item.images.length > 1) return true;
  if (Array.isArray(item.carouselMedia) && item.carouselMedia.length > 1) return true;
  return false;
}

/**
 * Extract slide image URLs from a carousel item. The actor emits carousel
 * media under several field names depending on version; try each in order.
 */
function extractSlideUrls(item: Record<string, unknown>): string[] {
  const candidates: unknown[] = [];
  if (Array.isArray(item.childPosts)) candidates.push(...item.childPosts);
  if (Array.isArray(item.carouselMedia)) candidates.push(...item.carouselMedia);
  if (Array.isArray(item.carousel_media)) candidates.push(...item.carousel_media);
  if (Array.isArray(item.images)) candidates.push(...item.images);
  if (Array.isArray(item.displayUrls)) candidates.push(...item.displayUrls);
  if (Array.isArray(item.display_urls)) candidates.push(...item.display_urls);

  const urls: string[] = [];
  for (const c of candidates) {
    if (typeof c === 'string') {
      if (c.startsWith('http')) urls.push(c);
    } else if (c && typeof c === 'object') {
      const o = c as Record<string, unknown>;
      const candidateUrl = String(
        o.displayUrl
          ?? o.display_url
          ?? o.imageUrl
          ?? o.image_url
          ?? o.url
          ?? o.src
          ?? '',
      );
      if (candidateUrl.startsWith('http')) urls.push(candidateUrl);
    }
  }
  // De-duplicate while preserving order.
  return Array.from(new Set(urls));
}

function extractHashtags(caption: string): string[] {
  const matches = caption.match(/#[\w\u00C0-\u024F]+/g) ?? [];
  return matches.map(m => m.slice(1));
}

/**
 * Filter items to carousels only and map each to a slideshow RawTemplate.
 * Exported so `apify-async.ts` can reuse it for the async processor path.
 */
export function groupInstagramCarousels(items: unknown[]): RawTemplate[] {
  const templates: RawTemplate[] = [];

  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    if (!isCarousel(item)) continue;

    const slideUrls = extractSlideUrls(item);
    if (slideUrls.length < 2) continue; // not truly a carousel

    const shortCode = String(
      item.shortCode ?? item.short_code ?? item.code ?? '',
    ).trim();
    const id = String(item.id ?? item.pk ?? shortCode).trim();
    if (!shortCode && !id) continue;

    const ownerUsername = String(
      item.ownerUsername ?? item.owner_username ?? item.username ?? '',
    ).trim();
    const caption = String(item.caption ?? item.text ?? '');

    const canonicalUrl = shortCode
      ? `https://www.instagram.com/p/${shortCode}/`
      : String(item.url ?? '');
    if (!canonicalUrl) continue;

    templates.push({
      sourceUrl: canonicalUrl,
      sourcePlatform: 'instagram' as SourcePlatform,
      sourceCreator: ownerUsername || null,
      sourceVideoId: id || shortCode,
      sourcePostId: shortCode || id,
      mediaUrl: null,
      thumbnailUrl: slideUrls[0]!,
      thumbnailUrls: slideUrls,
      slideCaptions: [],
      durationSeconds: null,
      contentType: 'slideshow',
      viewCount: asNumber(item.videoViewCount ?? item.video_view_count),
      likeCount: asNumber(item.likesCount ?? item.likes_count),
      commentCount: asNumber(item.commentsCount ?? item.comments_count),
      title: caption.split('\n')[0]?.slice(0, 120) || 'Instagram carousel',
      description: caption.slice(0, 2000),
      hashtags: extractHashtags(caption),
      timestamp: item.timestamp ?? item.taken_at_timestamp ?? null,
    } as unknown as RawTemplate);
  }

  return templates;
}
