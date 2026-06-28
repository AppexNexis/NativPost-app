/**
 * TikTok slideshow downloader via Apify.
 *
 * Actor: maximedupre/tiktok-slideshow-downloader
 * Docs:  https://apify.com/maximedupre/tiktok-slideshow-downloader/api
 *
 * This provider targets TikTok photo-slideshow URLs and extracts the image
 * assets plus background audio. Slideshows are mapped to the 'slideshow'
 * content type with all slide URLs in thumbnailUrls.
 *
 * Env var required: APIFY_TOKEN
 */

import type { RawTemplate, SourcePlatform } from '../types';
import {
  asNumber,
  fetchApifyDataset,
  startApifyRun,
  waitForApifyRun,
} from './apify-shared';

export type ApifyTikTokSlideshowOptions = {
  /** Apify API token. Falls back to APIFY_TOKEN env var. */
  apifyToken?: string;
  /** TikTok slideshow URLs to scrape. */
  urls: string[];
  /** Max items to fetch. */
  limit?: number;
};

const ACTOR_ID = 'maximedupre~tiktok-slideshow-downloader';

function extractSlideUrls(item: Record<string, unknown>): string[] {
  const candidates: unknown[] = [
    ...(Array.isArray(item.images) ? item.images : []),
    ...(Array.isArray(item.slides) ? item.slides : []),
    ...(Array.isArray(item.photos) ? item.photos : []),
    ...(Array.isArray(item.imageUrls) ? item.imageUrls : []),
    ...(Array.isArray(item.image_urls) ? item.image_urls : []),
    ...(Array.isArray(item.slideUrls) ? item.slideUrls : []),
    ...(Array.isArray(item.slide_urls) ? item.slide_urls : []),
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
      media.url ?? media.imageUrl ?? media.image_url ?? media.src ?? media.displayUrl ?? media.display_url ?? '',
    );
    if (url.startsWith('http')) {
      urls.push(url);
    }
  }

  // Some actor versions return a single images object with indexed keys
  if (urls.length === 0 && item.images && typeof item.images === 'object' && !Array.isArray(item.images)) {
    const imageMap = item.images as Record<string, unknown>;
    for (const value of Object.values(imageMap)) {
      if (typeof value === 'string' && value.startsWith('http')) {
        urls.push(value);
      }
    }
  }

  return Array.from(new Set(urls));
}

function mapItem(item: Record<string, unknown>): RawTemplate | null {
  const id = String(item.id ?? item.videoId ?? item.video_id ?? item.awemeId ?? item.aweme_id ?? '').trim();
  if (!id) {
    return null;
  }

  const description = String(item.text ?? item.desc ?? item.description ?? item.caption ?? '');
  const authorName = String(
    item.author ?? item.username ?? item.authorName ?? item.author_name ?? item.nickname ?? '',
  );

  const slideUrls = extractSlideUrls(item);
  const thumbnailUrl
    = slideUrls[0]
      || String(item.coverUrl ?? item.cover ?? item.thumbnailUrl ?? item.thumbnail_url ?? '');

  // The slideshow downloader often exposes the original background audio URL
  const mediaUrl = String(item.musicUrl ?? item.music_url ?? item.audioUrl ?? item.audio_url ?? '');

  if (!thumbnailUrl) {
    return null;
  }

  const sourceUrl = String(
    item.webVideoUrl ?? item.videoUrl ?? item.url ?? `https://www.tiktok.com/@${authorName}/video/${id}`,
  );

  return {
    sourceUrl,
    sourcePlatform: 'tiktok' as SourcePlatform,
    sourceCreator: authorName || null,
    sourceVideoId: null,
    sourcePostId: id,
    mediaUrl: mediaUrl || null,
    thumbnailUrl,
    thumbnailUrls: slideUrls.length > 0 ? slideUrls : {},
    slideCaptions: [],
    durationSeconds: asNumber(item.duration ?? item.videoDuration ?? item.video_duration),
    contentType: 'slideshow',
    viewCount: asNumber(item.playCount ?? item.views ?? item.viewCount),
    likeCount: asNumber(item.diggCount ?? item.likesCount ?? item.likes),
    title: description.slice(0, 120) || 'TikTok slideshow',
    description,
  };
}

export async function scrapeTikTokSlideshows(
  options: ApifyTikTokSlideshowOptions,
): Promise<RawTemplate[]> {
  const token = options.apifyToken ?? process.env.APIFY_TOKEN ?? '';
  if (!token) {
    console.warn('[Apify/TikTokSlideshow] Skipping: APIFY_TOKEN is not configured.');
    return [];
  }

  const urls = (options.urls || []).filter(u => u.startsWith('http'));
  if (urls.length === 0) {
    return [];
  }

  const limit = Math.min(typeof options.limit === 'number' ? options.limit : urls.length * 2, 200);

  console.log(`[Apify/TikTokSlideshow] Scraping ${urls.length} slideshow(s)`);

  try {
    const input = {
      directUrls: urls,
      resultsLimit: limit,
    };

    const run = await startApifyRun(ACTOR_ID, token, input);
    console.log(`[Apify/TikTokSlideshow] Run started: ${run.id}`);

    await waitForApifyRun(run.id, token, { maxMs: 300_000 });
    console.log('[Apify/TikTokSlideshow] Run complete. Fetching dataset...');

    const items = await fetchApifyDataset<Record<string, unknown>>(run.defaultDatasetId, token, limit);
    console.log(`[Apify/TikTokSlideshow] Raw items: ${items.length}`);

    const templates = items.map(mapItem).filter((t): t is RawTemplate => t !== null);
    console.log(`[Apify/TikTokSlideshow] Mapped templates: ${templates.length}`);
    return templates;
  } catch (err) {
    console.error('[Apify/TikTokSlideshow] Failed:', err instanceof Error ? err.message : err);
    return [];
  }
}
