/**
 * Pexels video importer for seed trending templates.
 *
 * Pexels provides free royalty-free stock videos we can use as
 * "UGC-style" or "hook/demo" templates.
 *
 * Changes from original:
 * - Added optional `pages` option to fetch multiple pages per query
 *   (original only fetched page 1, capping results at ~100 total).
 * - mapAspectRatio exported for use by other modules.
 */

import type { ContentType, NicheTag, RawTemplate } from '../types';

const PEXELS_API_BASE = 'https://api.pexels.com/videos';

/**
 * Deterministic seeded PRNG (mulberry32). Same seed → same sequence,
 * so a given Pexels video ID always gets the same engagement numbers.
 */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate realistic-looking engagement metrics for Pexels content.
 * Pexels doesn't provide real view/like counts, so we synthesise them
 * using a deterministic PRNG keyed on the video ID.
 *
 * Distribution targets (based on real platform averages):
 *   - Views:  10K – 5M, log-uniform (most content lives in the lower tail)
 *   - Likes:  3 – 15 % of views
 *   - Comments: 0.5 – 3 % of likes
 */
function generateEngagement(videoId: number): { viewCount: number; likeCount: number; commentCount: number } {
  const rng = mulberry32(videoId * 2654435761);

  // Log-uniform views: 10^4 to 10^6.6 (~10K – ~5M)
  const logMin = 4;        // 10^4  = 10K
  const logMax = 6.7;      // 10^6.7 ≈ 5M
  const logViews = logMin + rng() * (logMax - logMin);
  const viewCount = Math.round(10 ** logViews);

  // Like rate: 3–15 %
  const likeRate = 0.03 + rng() * 0.12;
  const likeCount = Math.round(viewCount * likeRate);

  // Comment rate: 0.5–3 % of likes (so ~0.015–0.45 % of views)
  const commentRate = 0.005 + rng() * 0.025;
  const commentCount = Math.max(0, Math.round(likeCount * commentRate));

  return { viewCount, likeCount, commentCount };
}

export interface PexelsImporterOptions {
  apiKey: string;
  perPage?: number;
  /** How many pages to fetch per query. Default: 1. Increase to get more results. */
  pages?: number;
  minDuration?: number;
  maxDuration?: number;
}

interface PexelsVideoFile {
  id: number;
  quality: string;
  file_type: string;
  link: string;
  width: number;
  height: number;
}

interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  url: string;
  image: string;
  duration: number;
  user: {
    id: number;
    name: string;
    url: string;
  };
  video_files: PexelsVideoFile[];
  video_pictures: { id: number; picture: string; nr: number }[];
}

interface PexelsSearchResponse {
  page: number;
  per_page: number;
  total_results: number;
  next_page?: string;
  videos: PexelsVideo[];
}

const NICHE_QUERIES: { query: string; contentType: ContentType; defaultNiche: NicheTag }[] = [
  { query: 'professional portrait corporate headshot', contentType: 'talking_head', defaultNiche: 'personal_brand' },
  { query: 'person talking to camera vlog selfie',      contentType: 'ugc',          defaultNiche: 'personal_brand' },
  { query: 'gaming setup gameplay controller',          contentType: 'video_hook_demo', defaultNiche: 'gaming'       },
  { query: '3d printing hardware manufacturing',        contentType: 'custom',       defaultNiche: 'tech'          },
  { query: 'artificial intelligence technology',        contentType: 'video_hook_demo', defaultNiche: 'ai'            },
  { query: 'startup entrepreneur modern office',        contentType: 'talking_head', defaultNiche: 'agency'         },
  { query: 'coding programming software developer',     contentType: 'video_hook_demo', defaultNiche: 'tech'          },
  { query: 'ai robot futuristic technology',            contentType: 'video_hook_demo', defaultNiche: 'ai'            },
  { query: 'smart home gadgets technology',             contentType: 'video_hook_demo', defaultNiche: 'tech'          },
  { query: 'person using laptop modern workspace',      contentType: 'talking_head', defaultNiche: 'b2b_saas'       },
  { query: 'drone aerial camera technology',            contentType: 'custom',       defaultNiche: 'tech'          },
  { query: 'content creator filming setup',             contentType: 'ugc',          defaultNiche: 'personal_brand' },
];

function pickBestVideoFile(files: PexelsVideoFile[]): PexelsVideoFile | null {
  const mp4s = files.filter((f) => f.file_type === 'video/mp4');
  if (mp4s.length === 0) return null;
  return mp4s.find((f) => f.quality === 'hd') ?? mp4s.find((f) => f.quality === 'sd') ?? mp4s[0] ?? null;
}

export function mapAspectRatio(width: number, height: number): '9:16' | '1:1' | '16:9' {
  const ratio = width / height;
  if (ratio < 0.8) return '9:16';
  if (ratio > 1.2) return '16:9';
  return '1:1';
}

export async function searchPexels(
  query: string,
  options: PexelsImporterOptions,
  page = 1,
): Promise<PexelsSearchResponse> {
  const url = new URL(`${PEXELS_API_BASE}/search`);
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', String(options.perPage ?? 10));
  url.searchParams.set('page', String(page));
  url.searchParams.set('orientation', 'all');

  const res = await fetch(url.toString(), {
    headers: { Authorization: options.apiKey },
  });

  if (!res.ok) {
    throw new Error(`Pexels API error: ${res.status} ${await res.text()}`);
  }

  return res.json() as Promise<PexelsSearchResponse>;
}

export async function fetchPexelsTemplates(options: PexelsImporterOptions): Promise<RawTemplate[]> {
  const minDuration = options.minDuration ?? 3;
  const maxDuration = options.maxDuration ?? 60;
  const pages       = options.pages ?? 1;
  const templates: RawTemplate[] = [];

  for (const { query, contentType, defaultNiche } of NICHE_QUERIES) {
    try {
      for (let page = 1; page <= pages; page++) {
        const data = await searchPexels(query, options, page);

        for (const video of data.videos) {
          if (video.duration < minDuration || video.duration > maxDuration) continue;

          const file = pickBestVideoFile(video.video_files);
          if (!file) continue;

          const { viewCount, likeCount, commentCount } = generateEngagement(video.id);

          templates.push({
            sourceUrl:       video.url,
            sourcePlatform:  'pexels',
            sourceCreator:   video.user.name ?? null,
            sourceVideoId:   String(video.id),
            mediaUrl:        file.link,
            thumbnailUrl:    video.image,
            durationSeconds: Math.round(video.duration),
            contentType:     contentType as ContentType,
            viewCount,
            likeCount,
            commentCount,
            title:           `${query} template`,
            description:     `Royalty-free ${query} clip from Pexels. Default niche: ${defaultNiche}.`,
          });
        }

        // Stop paginating if Pexels says there are no more pages
        if (!data.next_page) break;
      }
    } catch (err) {
      console.error(`[Pexels] Failed query "${query}":`, err);
    }
  }

  return templates;
}