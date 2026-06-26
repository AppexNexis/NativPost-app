/**
 * TikTok Research API provider for the trending content seed pipeline.
 *
 * Docs: https://developers.tiktok.com/doc/research-api-get-started
 * Requires a Research API access token (supplied via TIKTOK_RESEARCH_API_KEY).
 *
 * If credentials are missing or the API returns an error, this provider returns
 * an empty array and logs a warning so the pipeline keeps running.
 */

import type { ContentType, RawTemplate, SourcePlatform, ViralSourceProvider } from '../types';

export interface TikTokResearchOptions {
  apiKey: string;
  endpoint?: string;
  limit?: number;
  queries?: string[];
}

const DEFAULT_ENDPOINT = 'https://open-api.tiktok.com/research/v1/';

const DEFAULT_QUERIES = ['viral', 'trending', 'business'];

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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

function mapVideoItem(item: Record<string, unknown>): RawTemplate | null {
  const videoId = String(item.id || item.video_id || '');
  if (!videoId) return null;

  const sourceUrl =
    typeof item.embed_link === 'string' && item.embed_link.startsWith('http')
      ? item.embed_link
      : `https://www.tiktok.com/video/${videoId}`;

  const creator = typeof item.username === 'string' ? item.username : null;
  const mediaUrl =
    typeof item.embed_link === 'string' && item.embed_link.startsWith('http')
      ? item.embed_link
      : typeof item.video_url === 'string' && (item.video_url as string).startsWith('http')
        ? item.video_url
        : null;

  const thumbnailUrl =
    typeof item.cover_image_url === 'string' && (item.cover_image_url as string).startsWith('http')
      ? item.cover_image_url
      : typeof item.thumbnail_url === 'string' && (item.thumbnail_url as string).startsWith('http')
        ? item.thumbnail_url
        : '';

  const title =
    typeof item.title === 'string' ? item.title : typeof item.video_description === 'string'
      ? item.video_description.slice(0, 120)
      : 'TikTok trending video';

  const description = typeof item.video_description === 'string' ? item.video_description : '';

  return {
    sourceUrl,
    sourcePlatform: 'tiktok' as SourcePlatform,
    sourceCreator: creator,
    sourceVideoId: videoId,
    mediaUrl,
    thumbnailUrl,
    durationSeconds: asNumber(item.duration),
    contentType: pickContentType(title, description),
    viewCount: asNumber(item.view_count),
    likeCount: asNumber(item.like_count),
    title,
    description,
  };
}

export const tiktokResearchProvider: ViralSourceProvider = {
  name: 'tiktok',
  async fetch(options): Promise<RawTemplate[]> {
    const apiKey = options.apiKey as string | undefined;
    const endpoint = (options.endpoint as string) || process.env.TIKTOK_RESEARCH_ENDPOINT || DEFAULT_ENDPOINT;
    const limit = Math.min(typeof options.limit === 'number' ? options.limit : 20, 50);
    const queries = Array.isArray(options.queries)
      ? (options.queries as string[])
      : DEFAULT_QUERIES;

    if (!apiKey) {
      console.warn('[TikTok Research] Skipping: TIKTOK_RESEARCH_API_KEY is not configured.');
      return [];
    }

    const base = endpoint.replace(/\/+$/, '');
    const templates: RawTemplate[] = [];

    try {
      for (const query of queries.slice(0, 3)) {
        const url = `${base}/videos/search/`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            query: {
              and: [{ field: 'keyword', operator: 'CONTAINS', value: query }],
            },
            max_count: limit,
            fields: ['id', 'username', 'title', 'video_description', 'duration', 'view_count', 'like_count', 'share_count', 'cover_image_url', 'embed_link'].join(','),
          }),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          console.warn(`[TikTok Research] API returned ${res.status}: ${body.slice(0, 200)}`);
          continue;
        }

        const data = (await res.json()) as { data?: { videos?: unknown[] } };
        const videos = Array.isArray(data?.data?.videos) ? data.data.videos : [];

        for (const video of videos) {
          const item = typeof video === 'object' && video !== null ? (video as Record<string, unknown>) : {};
          const mapped = mapVideoItem(item);
          if (mapped) templates.push(mapped);
        }
      }
    } catch (err) {
      console.error('[TikTok Research] Failed to fetch trending videos:', err);
    }

    return templates;
  },
};
