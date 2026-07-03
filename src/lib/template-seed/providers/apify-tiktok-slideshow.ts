/**
 * TikTok slideshow downloader via Apify.
 *
 * Actor: maximedupre/tiktok-slideshow-downloader
 * Docs:  https://apify.com/maximedupre/tiktok-slideshow-downloader/api
 *
 * The actor emits ONE dataset row per photo (fields: videoId, photoIndex,
 * photoCount, sourceImageUrl, downloadUrl, authorUsername, caption, post.*,
 * audio.*, contentType=MIME). This module groups those rows by videoId and
 * emits one RawTemplate per slideshow post with all slide URLs in
 * thumbnailUrls (ordered by photoIndex).
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

export const SLIDESHOW_ACTOR_ID = 'maximedupre~tiktok-slideshow-downloader';

/** Build the actor input shape for `maximedupre/tiktok-slideshow-downloader`. */
export function buildSlideshowInput(urls: string[], limit: number): Record<string, unknown> {
  return {
    slideshowUrls: urls.map(url => ({ url })),
    maxItems: limit,
  };
}

/**
 * Canonicalize a slideshow post URL. The actor's `sourceUrl` field is often
 * a tracked share link (`?_r=1&u_code=…&share_item_id=…`) or the m.tiktok.com
 * variant. We store canonical `https://www.tiktok.com/@user/photo/{videoId}`
 * so `content_template.source_url`'s unique index doesn't collect dupes.
 */
function canonicalizeSlideshowUrl(authorUsername: string, videoId: string): string {
  return `https://www.tiktok.com/@${authorUsername}/photo/${videoId}`;
}

/**
 * Group per-photo dataset rows into one RawTemplate per videoId.
 *
 * Exported so `apify-async.ts` (async processor) can reuse the same grouping
 * logic as the sync provider.
 */
export function groupTikTokSlideshowItems(items: unknown[]): RawTemplate[] {
  const groups = new Map<string, Array<Record<string, unknown>>>();

  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const videoId = String(item.videoId ?? item.video_id ?? item.id ?? '').trim();
    const imgUrl = String(item.sourceImageUrl ?? item.source_image_url ?? '').trim();
    if (!videoId || !imgUrl.startsWith('http')) continue;
    const existing = groups.get(videoId) ?? [];
    existing.push(item);
    groups.set(videoId, existing);
  }

  const templates: RawTemplate[] = [];
  for (const [videoId, rows] of groups) {
    // Sort by photoIndex ascending so slide 1 is always thumbnailUrl.
    rows.sort((a, b) => Number(a.photoIndex ?? 0) - Number(b.photoIndex ?? 0));

    const first = rows[0]!;
    const authorUsername = String(first.authorUsername ?? first.author_username ?? '').trim();
    const authorName = String(first.authorName ?? first.author_name ?? '').trim();

    // caption may be null on some slideshows; fall back to empty string
    const caption = rows.find(r => typeof r.caption === 'string' && (r.caption as string).length > 0);
    const captionText = caption ? String(caption.caption) : '';

    const slideUrls = rows
      .map(r => String(r.sourceImageUrl ?? r.source_image_url ?? ''))
      .filter(u => u.startsWith('http'));

    if (slideUrls.length === 0) continue;

    const post = (first.post ?? {}) as Record<string, unknown>;

    templates.push({
      // NOTE: `content_template` schema has no source_post_id column, so the
      // videoId lives in `sourceVideoId` for slideshows (kept nullable-safe
      // by the DB layer).
      sourceUrl: canonicalizeSlideshowUrl(authorUsername || 'user', videoId),
      sourcePlatform: 'tiktok' as SourcePlatform,
      sourceCreator: authorUsername || authorName || null,
      sourceVideoId: videoId,
      sourcePostId: videoId,
      mediaUrl: null, // slideshows have no video/audio URL; audio.title is metadata only
      thumbnailUrl: slideUrls[0]!,
      thumbnailUrls: slideUrls,
      slideCaptions: [],
      durationSeconds: null,
      contentType: 'slideshow',
      viewCount: asNumber(post.playCount ?? post.play_count),
      likeCount: asNumber(post.likeCount ?? post.like_count),
      title: captionText.slice(0, 120) || 'TikTok slideshow',
      description: captionText,
    });
  }

  return templates;
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

  const limit = Math.min(typeof options.limit === 'number' ? options.limit : urls.length * 10, 200);

  console.log(`[Apify/TikTokSlideshow] Scraping ${urls.length} slideshow(s)`);

  try {
    const run = await startApifyRun(SLIDESHOW_ACTOR_ID, token, buildSlideshowInput(urls, limit));
    console.log(`[Apify/TikTokSlideshow] Run started: ${run.id}`);

    await waitForApifyRun(run.id, token, { maxMs: 300_000 });
    console.log('[Apify/TikTokSlideshow] Run complete. Fetching dataset...');

    const items = await fetchApifyDataset<Record<string, unknown>>(run.defaultDatasetId, token, limit);
    console.log(`[Apify/TikTokSlideshow] Raw photo rows: ${items.length}`);

    const templates = groupTikTokSlideshowItems(items);
    console.log(`[Apify/TikTokSlideshow] Grouped slideshows: ${templates.length}`);
    return templates;
  } catch (err) {
    console.error('[Apify/TikTokSlideshow] Failed:', err instanceof Error ? err.message : err);
    return [];
  }
}
