/**
 * Instagram post scraper via Apify.
 *
 * Actor: apify/instagram-post-scraper
 * Docs:  https://apify.com/apify/instagram-post-scraper
 *
 * This provider targets individual Instagram post URLs and extracts both
 * single-video Reels and multi-image carousel posts. Carousels are mapped
 * to the 'slideshow' content type with all slide URLs in thumbnailUrls.
 *
 * Env var required: APIFY_TOKEN
 */

import type { ContentType, RawTemplate, SourcePlatform } from '../types';
import {
  asNumber,
  fetchApifyDataset,
  startApifyRun,
  waitForApifyRun,
} from './apify-shared';

export type ApifyInstagramPostOptions = {
  /** Apify API token. Falls back to APIFY_TOKEN env var. */
  apifyToken?: string;
  /** Direct Instagram post URLs to scrape. */
  urls: string[];
  /** Max items to fetch (each URL can produce one post). */
  limit?: number;
};

const ACTOR_ID = 'apify~instagram-post-scraper';

function pickContentType(caption: string, hasCarousel: boolean): ContentType {
  if (hasCarousel) {
    return 'slideshow';
  }
  const t = caption.toLowerCase();
  if (t.includes('tutorial') || t.includes('how to') || t.includes('tips')) {
    return 'video_hook_demo';
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
  // The Instagram Post Scraper returns carousel media in several shapes
  // depending on the actor version. Try the most common ones.
  const candidates: unknown[] = [];

  if (Array.isArray(item.carouselMedia)) {
    candidates.push(...item.carouselMedia);
  }
  if (Array.isArray(item.carousel_media)) {
    candidates.push(...item.carousel_media);
  }
  if (Array.isArray(item.media)) {
    candidates.push(...item.media);
  }
  if (Array.isArray(item.images)) {
    candidates.push(...item.images);
  }
  if (Array.isArray(item.displayUrls)) {
    candidates.push(...item.displayUrls);
  }
  if (Array.isArray(item.display_urls)) {
    candidates.push(...item.display_urls);
  }

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
    const url
      = String(media.displayUrl ?? media.display_url ?? media.imageUrl ?? media.image_url ?? media.url ?? media.src ?? '');
    if (url.startsWith('http')) {
      urls.push(url);
    }
  }

  // Deduplicate while preserving order
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
  const id = String(item.id ?? item.shortCode ?? item.short_code ?? item.postId ?? item.post_id ?? '').trim();
  if (!id) {
    return null;
  }

  const caption = String(item.caption ?? item.text ?? item.description ?? '');
  const ownerUsername = String(item.ownerUsername ?? item.username ?? item.owner ?? item.author ?? '');

  const sourceUrl = String(
    item.url ?? item.permalink ?? `https://www.instagram.com/p/${id}/`,
  );

  const slideUrls = extractSlideUrls(item);
  const isCarousel = slideUrls.length > 1;

  // Primary thumbnail — prefer first carousel slide or the main display URL
  const thumbnailUrl
    = slideUrls[0]
      || String(item.displayUrl ?? item.thumbnailUrl ?? item.thumbnail_url ?? item.displaySrc ?? '');

  // For Reels the actor may expose a videoUrl; for carousels there is no single video.
  const mediaUrl = String(item.videoUrl ?? item.video_url ?? '');

  if (!thumbnailUrl) {
    return null;
  }

  return {
    sourceUrl,
    sourcePlatform: 'instagram' as SourcePlatform,
    sourceCreator: ownerUsername || null,
    sourceVideoId: isCarousel ? null : id,
    sourcePostId: id,
    mediaUrl: mediaUrl || null,
    thumbnailUrl,
    thumbnailUrls: slideUrls.length > 0 ? slideUrls : {},
    slideCaptions: extractSlideCaptions(item),
    durationSeconds: asNumber(item.videoDuration ?? item.video_duration),
    contentType: pickContentType(caption, isCarousel),
    viewCount: asNumber(item.videoViewCount ?? item.video_view_count ?? item.playsCount ?? item.viewsCount),
    likeCount: asNumber(item.likesCount ?? item.likes_count ?? item.diggCount ?? item.likeCount),
    title: caption.slice(0, 120) || 'Instagram post',
    description: caption,
  };
}

export async function scrapeInstagramPosts(
  options: ApifyInstagramPostOptions,
): Promise<RawTemplate[]> {
  const token = options.apifyToken ?? process.env.APIFY_TOKEN ?? '';
  if (!token) {
    console.warn('[Apify/InstagramPost] Skipping: APIFY_TOKEN is not configured.');
    return [];
  }

  const urls = (options.urls || []).filter(u => u.startsWith('http'));
  if (urls.length === 0) {
    return [];
  }

  const limit = Math.min(typeof options.limit === 'number' ? options.limit : urls.length * 2, 200);

  console.log(`[Apify/InstagramPost] Scraping ${urls.length} post(s)`);

  try {
    const input = {
      directUrls: urls,
      resultsLimit: limit,
    };

    const run = await startApifyRun(ACTOR_ID, token, input);
    console.log(`[Apify/InstagramPost] Run started: ${run.id}`);

    await waitForApifyRun(run.id, token);
    console.log('[Apify/InstagramPost] Run complete. Fetching dataset...');

    const items = await fetchApifyDataset<Record<string, unknown>>(run.defaultDatasetId, token, limit);
    console.log(`[Apify/InstagramPost] Raw items: ${items.length}`);

    const templates = items.map(mapItem).filter((t): t is RawTemplate => t !== null);
    console.log(`[Apify/InstagramPost] Mapped templates: ${templates.length}`);
    return templates;
  } catch (err) {
    console.error('[Apify/InstagramPost] Failed:', err instanceof Error ? err.message : err);
    return [];
  }
}
