/**
 * TikWM helper — resolves a public TikTok page URL to a direct playable .mp4
 * URL plus cover thumbnail.
 *
 * Why: Apify's clockworks/tiktok-scraper doesn't reliably return
 * `videoUrl`/`videoUrlNoWaterMark` on every item (especially without the
 * `shouldDownloadVideos` flag set), and Cloudinary can't ingest a
 * tiktok.com HTML page URL directly. TikWM's public API returns the raw
 * mp4 that we can then feed to Cloudinary's `uploadVideoFromUrl`.
 *
 * Endpoints:
 *   - Free public: https://www.tikwm.com/api/?url=<encoded>&hd=1  (no key,
 *     rate-limited to ~1 req/s, occasionally flaky)
 *   - Paid tikwmapi.com: set `TIKWM_API_KEY` env var. The key is sent as an
 *     `X-API-Key` header. If tikwmapi.com uses a different auth scheme,
 *     adjust `buildRequestInit()` below — the response body shape is the
 *     same.
 *
 * Response shape (both tiers):
 *   { code: 0, msg: 'success', data: { play, wmplay, hdplay, cover, duration, ... } }
 * `play` = watermark-free mp4, `hdplay` = HD version when available.
 */

export type TikWmResolution = {
  playUrl: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
};

const DEFAULT_BASE = 'https://www.tikwm.com/api/';

function buildRequestInit(apiKey: string | undefined): RequestInit {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }
  return {
    method: 'GET',
    headers,
    // 15s timeout — TikWM occasionally hangs on 404'd videos
    signal: AbortSignal.timeout(15_000),
  };
}

/**
 * Resolve a TikTok page URL to a playable mp4 URL and cover.
 * Returns null on any failure — caller should skip and continue.
 */
export async function resolveTikTokMedia(
  tiktokUrl: string,
  apiKey?: string,
  baseUrl: string = DEFAULT_BASE,
): Promise<TikWmResolution | null> {
  if (!tiktokUrl || !tiktokUrl.includes('tiktok.com')) {
    return null;
  }

  const endpoint = `${baseUrl}?url=${encodeURIComponent(tiktokUrl)}&hd=1`;

  try {
    const res = await fetch(endpoint, buildRequestInit(apiKey));
    if (!res.ok) {
      console.warn(`[TikWM] ${res.status} for ${tiktokUrl}`);
      return null;
    }
    const json = (await res.json()) as {
      code?: number;
      msg?: string;
      data?: {
        play?: string;
        wmplay?: string;
        hdplay?: string;
        cover?: string;
        origin_cover?: string;
        duration?: number;
      };
    };

    if (json.code !== 0 || !json.data) {
      console.warn(`[TikWM] non-zero code (${json.code}) msg="${json.msg}" url=${tiktokUrl}`);
      return null;
    }

    const play = json.data.hdplay || json.data.play || json.data.wmplay;
    if (!play || !play.startsWith('http')) {
      return null;
    }

    return {
      playUrl: play,
      thumbnailUrl: json.data.cover || json.data.origin_cover || null,
      durationSeconds: typeof json.data.duration === 'number' ? json.data.duration : null,
    };
  } catch (err) {
    console.warn(
      `[TikWM] fetch failed for ${tiktokUrl}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
