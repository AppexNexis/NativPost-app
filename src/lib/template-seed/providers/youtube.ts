/**
 * YouTube Shorts trending importer for seed templates.
 * Uses YouTube Data API v3 to discover trending Shorts and store
 * metadata + thumbnails. We do NOT download the video files;
 * instead we link to the YouTube watch page and use the thumbnail
 * as the template preview.
 */

import type { ContentType, RawTemplate } from '../types';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

export interface YouTubeImporterOptions {
  apiKey: string;
  maxResults?: number;
  regionCode?: string;
  /** How many search pages to fetch. Default: 1. */
  pages?: number;
}

interface YouTubeSearchItem {
  id: { videoId: string };
  snippet: {
    title: string;
    description: string;
    channelTitle: string;
    thumbnails: Record<string, { url: string; width: number; height: number }>;
    publishedAt: string;
  };
}

interface YouTubeVideoStat {
  id: string;
  statistics: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
  contentDetails: {
    duration: string; // ISO 8601, e.g. PT15S
  };
}

function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const minutes = Number.parseInt(match[1] || '0', 10);
  const seconds = Number.parseInt(match[2] || '0', 10);
  return minutes * 60 + seconds;
}

function pickContentType(title: string, description: string): ContentType {
  const text = `${title} ${description}`.toLowerCase();
  if (text.includes('tutorial') || text.includes('how to') || text.includes('tips')) return 'video_hook_demo';
  if (text.includes('story') || text.includes(' slideshow') || text.includes('photo')) return 'slideshow';
  if (text.includes('meme') || text.includes('green screen')) return 'green_screen_meme';
  if (text.includes('ugc') || text.includes('review') || text.includes('unboxing')) return 'ugc';
  if (text.includes('talk') || text.includes('advice') || text.includes('reminder')) return 'talking_head';
  return 'wall_of_text';
}

export async function searchYouTubeShorts(
  options: YouTubeImporterOptions,
): Promise<RawTemplate[]> {
  const maxResults = options.maxResults ?? 25;
  const pages = Math.max(1, options.pages ?? 1);
  const allItems: YouTubeSearchItem[] = [];
  let pageToken: string | undefined;

  for (let page = 1; page <= pages; page++) {
    const searchUrl = new URL(`${YOUTUBE_API_BASE}/search`);
    searchUrl.searchParams.set('part', 'snippet');
    searchUrl.searchParams.set('type', 'video');
    searchUrl.searchParams.set('videoDuration', 'short');
    searchUrl.searchParams.set('order', 'viewCount');
    searchUrl.searchParams.set('q', 'trending shorts');
    searchUrl.searchParams.set('regionCode', options.regionCode ?? 'US');
    searchUrl.searchParams.set('maxResults', String(maxResults));
    searchUrl.searchParams.set('key', options.apiKey);
    if (pageToken) searchUrl.searchParams.set('pageToken', pageToken);

    const searchRes = await fetch(searchUrl.toString());
    if (!searchRes.ok) {
      throw new Error(`YouTube search error: ${searchRes.status} ${await searchRes.text()}`);
    }

    const searchData = await searchRes.json() as { items: YouTubeSearchItem[]; nextPageToken?: string };
    allItems.push(...searchData.items);
    pageToken = searchData.nextPageToken;

    if (!pageToken) break;
  }

  const videoIds = allItems.map((item) => item.id.videoId).filter(Boolean);

  if (videoIds.length === 0) return [];

  // Fetch stats + duration
  const statsUrl = new URL(`${YOUTUBE_API_BASE}/videos`);
  statsUrl.searchParams.set('part', 'statistics,contentDetails');
  statsUrl.searchParams.set('id', videoIds.join(','));
  statsUrl.searchParams.set('key', options.apiKey);

  const statsRes = await fetch(statsUrl.toString());
  if (!statsRes.ok) {
    throw new Error(`YouTube stats error: ${statsRes.status} ${await statsRes.text()}`);
  }

  const statsData = await statsRes.json() as { items: YouTubeVideoStat[] };
  const statsById = new Map(statsData.items.map((s) => [s.id, s]));

  return allItems.map((item) => {
    const stats = statsById.get(item.id.videoId);
    const bestThumbnail =
      item.snippet.thumbnails.maxres ||
      item.snippet.thumbnails.standard ||
      item.snippet.thumbnails.high ||
      item.snippet.thumbnails.medium ||
      item.snippet.thumbnails.default;

    return {
      sourceUrl: `https://www.youtube.com/shorts/${item.id.videoId}`,
      sourcePlatform: 'youtube' as const,
      sourceCreator: item.snippet.channelTitle ?? null,
      sourceVideoId: item.id.videoId,
      mediaUrl: `https://www.youtube.com/shorts/${item.id.videoId}`,
      thumbnailUrl: bestThumbnail?.url ?? '',
      durationSeconds: stats ? parseDuration(stats.contentDetails.duration) : null,
      contentType: pickContentType(item.snippet.title, item.snippet.description),
      viewCount: stats ? Number.parseInt(stats.statistics.viewCount || '0', 10) : null,
      likeCount: stats ? Number.parseInt(stats.statistics.likeCount || '0', 10) : null,
      title: item.snippet.title,
      description: item.snippet.description,
    };
  });
}
