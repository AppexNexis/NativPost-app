/**
 * Instagram Basic Display / Graph API provider for the trending content seed pipeline.
 *
 * Uses INSTAGRAM_ACCESS_TOKEN and (optionally) INSTAGRAM_ACCOUNT_ID to fetch
 * recent reels/media. If credentials are missing, returns an empty array.
 */

import type { ContentType, RawTemplate, SourcePlatform, ViralSourceProvider } from '../types';

export interface InstagramOptions {
  accessToken: string;
  accountId?: string;
  limit?: number;
}

interface InstagramMediaItem {
  id: string;
  caption?: string;
  media_type?: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'REELS' | string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  username?: string;
  like_count?: number;
  comments_count?: number;
}

interface InstagramMediaResponse {
  data?: InstagramMediaItem[];
  paging?: { next?: string };
}

function parseDuration(_iso: string): number | null {
  // Instagram Graph API does not return video duration on the standard media
  // edge. Return null so callers can fall back to defaults.
  return null;
}

function pickContentType(caption: string): ContentType {
  const text = (caption || '').toLowerCase();
  if (text.includes('tutorial') || text.includes('how to') || text.includes('tips')) return 'video_hook_demo';
  if (text.includes('story') || text.includes(' slideshow') || text.includes('photo')) return 'slideshow';
  if (text.includes('meme') || text.includes('green screen')) return 'green_screen_meme';
  if (text.includes('ugc') || text.includes('review') || text.includes('unboxing')) return 'ugc';
  if (text.includes('talk') || text.includes('advice') || text.includes('reminder')) return 'talking_head';
  return 'wall_of_text';
}

function mapMediaItem(item: InstagramMediaItem): RawTemplate | null {
  const sourceUrl = item.permalink || `https://instagram.com/p/${item.id}`;
  const isVideo = item.media_type === 'VIDEO' || item.media_type === 'REELS';
  const mediaUrl = isVideo && item.media_url ? item.media_url : null;

  if (!mediaUrl && !item.thumbnail_url) return null;

  const thumbnailUrl =
    item.thumbnail_url || item.media_url || `https://instagram.com/p/${item.id}/media/?size=l`;

  return {
    sourceUrl,
    sourcePlatform: 'instagram' as SourcePlatform,
    sourceCreator: item.username || null,
    sourceVideoId: item.id,
    mediaUrl,
    thumbnailUrl,
    durationSeconds: item.timestamp ? parseDuration(item.timestamp) : null,
    contentType: pickContentType(item.caption || ''),
    viewCount: null,
    likeCount: typeof item.like_count === 'number' ? item.like_count : null,
    title: (item.caption || '').slice(0, 120),
    description: item.caption || '',
  };
}

export const instagramProvider: ViralSourceProvider = {
  name: 'instagram',
  async fetch(options): Promise<RawTemplate[]> {
    const accessToken = options.accessToken as string | undefined;
    const accountId = options.accountId as string | undefined;
    const limit = typeof options.limit === 'number' ? options.limit : 20;

    if (!accessToken) {
      console.warn('[Instagram] Skipping: INSTAGRAM_ACCESS_TOKEN is not configured.');
      return [];
    }

    const fields = [
      'id',
      'caption',
      'media_type',
      'media_url',
      'thumbnail_url',
      'permalink',
      'timestamp',
      'username',
      'like_count',
      'comments_count',
    ].join(',');

    const baseUrl = accountId
      ? `https://graph.facebook.com/v22.0/${accountId}/media`
      : 'https://graph.instagram.com/me/media';

    const url = new URL(baseUrl);
    url.searchParams.set('fields', fields);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('access_token', accessToken);

    try {
      const res = await fetch(url.toString());
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.warn(`[Instagram] API returned ${res.status}: ${body.slice(0, 200)}`);
        return [];
      }

      const data = (await res.json()) as InstagramMediaResponse;
      const items = Array.isArray(data?.data) ? data.data : [];

      return items
        .map((item) => mapMediaItem(item))
        .filter((template): template is RawTemplate => template !== null);
    } catch (err) {
      console.error('[Instagram] Failed to fetch recent media:', err);
      return [];
    }
  },
};
