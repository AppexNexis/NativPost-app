/**
 * Experimental TikTok Creative Center scraping fallback.
 *
 * Attempts to fetch the public Creative Center inspiration page and parse any
 * embedded JSON (e.g. __NEXT_DATA__). This is brittle and may stop working at
 * any time; it is provided only as a no-credential fallback for demos.
 *
 * If the page cannot be fetched or parsed, returns an empty array.
 */

import type { RawTemplate, SourcePlatform, ViralSourceProvider } from '../types';

export interface TikTokCreativeCenterOptions {
  url?: string;
  limit?: number;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.replace(/[^\d]/g, ''), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractHashtagsFromPage(text: string): Array<{ name: string; publishCount?: number }> {
  // Best-effort extraction: look for JSON that contains hashtag-like objects.
  const hashtags: Array<{ name: string; publishCount?: number }> = [];
  const seen = new Set<string>();

  try {
    // Common pattern in Creative Center payloads:
    // {"hashtag":"Example","publish_cnt":"1.2M", ...}
    const regex = /\{"hashtag"\s*:\s*"([^"]+)"[^}]*\}/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const name = match[1] ?? '';
      if (!name || seen.has(name)) continue;
      seen.add(name);
      hashtags.push({ name });
    }
  } catch {
    // ignore extraction errors
  }

  return hashtags;
}

export const tiktokCreativeCenterProvider: ViralSourceProvider = {
  name: 'tiktok',
  async fetch(options): Promise<RawTemplate[]> {
    const url =
      (options.url as string) ||
      'https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en';
    const limit = Math.max(1, Math.min(typeof options.limit === 'number' ? options.limit : 20, 50));

    console.warn('[TikTok Creative Center] Experimental provider: results may be empty or unstable.');

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (!res.ok) {
        console.warn(`[TikTok Creative Center] Page returned ${res.status}.`);
        return [];
      }

      const html = await res.text();

      // Try to find __NEXT_DATA__ or similar JSON payloads.
      const nextDataMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
      if (nextDataMatch?.[1]) {
        try {
          const payload = JSON.parse(nextDataMatch[1].trim());
          // The shape is undocumented; attempt a few common locations.
          const hashtagList =
            payload?.props?.pageProps?.hashtagList ??
            payload?.props?.initialState?.hashtagList ??
            payload?.hashtagList;

          if (Array.isArray(hashtagList)) {
            return hashtagList
              .slice(0, limit)
              .reduce<RawTemplate[]>((acc, entry: unknown) => {
                const item = typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {};
                const name = asString(item.hashtag || item.name || item.tag);
                if (!name) return acc;
                acc.push({
                  sourceUrl: `https://www.tiktok.com/tag/${encodeURIComponent(name)}`,
                  sourcePlatform: 'tiktok' as SourcePlatform,
                  sourceCreator: null,
                  sourceVideoId: null,
                  mediaUrl: null,
                  thumbnailUrl: asString(item.cover) || `https://www.tiktok.com/tag/${encodeURIComponent(name)}`,
                  durationSeconds: null,
                  contentType: 'wall_of_text' as const,
                  viewCount: null,
                  likeCount: null,
                  title: `#${name} trending hashtag`,
                  description: `Popular TikTok hashtag from Creative Center (experimental). Publish count: ${asNumber(item.publishCount ?? item.publish_cnt) ?? 'unknown'}.`,
                });
                return acc;
              }, []);
          }
        } catch {
          // fall through to text extraction
        }
      }

      // Fallback: extract hashtag names from raw HTML.
      const hashtags = extractHashtagsFromPage(html).slice(0, limit);
      return hashtags.map((hashtag) => ({
        sourceUrl: `https://www.tiktok.com/tag/${encodeURIComponent(hashtag.name)}`,
        sourcePlatform: 'tiktok' as SourcePlatform,
        sourceCreator: null,
        sourceVideoId: null,
        mediaUrl: null,
        thumbnailUrl: '',
        durationSeconds: null,
        contentType: 'wall_of_text' as const,
        viewCount: null,
        likeCount: null,
        title: `#${hashtag.name} trending hashtag`,
        description: 'Popular TikTok hashtag from Creative Center (experimental).',
      }));
    } catch (err) {
      console.error('[TikTok Creative Center] Failed to scrape page:', err);
      return [];
    }
  },
};
