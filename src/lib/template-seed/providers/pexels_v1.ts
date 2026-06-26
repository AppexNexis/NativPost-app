/**
 * Pexels video importer for seed trending templates.
 * Pexels provides free royalty-free stock videos we can use as
 * "UGC-style" or "hook/demo" templates.
 */

import type { ContentType, NicheTag, RawTemplate } from '../types';

const PEXELS_API_BASE = 'https://api.pexels.com/videos';

export interface PexelsImporterOptions {
  apiKey: string;
  perPage?: number;
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
  next_page: string;
  videos: PexelsVideo[];
}

const NICHE_QUERIES: { query: string; contentType: ContentType; defaultNiche: NicheTag }[] = [
  { query: 'business person working laptop', contentType: 'talking_head', defaultNiche: 'b2b_saas' },
  { query: 'entrepreneur office startup', contentType: 'talking_head', defaultNiche: 'agency' },
  { query: 'online shopping ecommerce', contentType: 'video_hook_demo', defaultNiche: 'ecommerce' },
  { query: 'fitness workout gym', contentType: 'ugc', defaultNiche: 'fitness' },
  { query: 'person talking camera selfie', contentType: 'talking_head', defaultNiche: 'personal_brand' },
  { query: 'healthy food cooking', contentType: 'video_hook_demo', defaultNiche: 'health' },
  { query: 'fashion model clothing', contentType: 'ugc', defaultNiche: 'fashion' },
  { query: 'travel adventure explore', contentType: 'slideshow', defaultNiche: 'travel' },
  { query: 'student learning education', contentType: 'video_hook_demo', defaultNiche: 'education' },
  { query: 'african business professional', contentType: 'talking_head', defaultNiche: 'africa_market' },
  { query: 'fintech money finance', contentType: 'video_hook_demo', defaultNiche: 'fintech' },
  { query: 'delicious restaurant food', contentType: 'video_hook_demo', defaultNiche: 'food' },
];

function pickBestVideoFile(files: PexelsVideoFile[]): PexelsVideoFile | null {
  const mp4s = files.filter((f) => f.file_type === 'video/mp4');
  if (mp4s.length === 0) return null;
  // Prefer 1080p or 720p, fallback to first.
  const preferred =
    mp4s.find((f) => f.quality === 'hd') ||
    mp4s.find((f) => f.quality === 'sd') ||
    mp4s[0];
  return preferred ?? null;
}

function mapAspectRatio(width: number, height: number): '9:16' | '1:1' | '16:9' {
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
  const templates: RawTemplate[] = [];

  for (const { query, contentType, defaultNiche } of NICHE_QUERIES) {
    try {
      const data = await searchPexels(query, options, 1);

      for (const video of data.videos) {
        if (video.duration < minDuration || video.duration > maxDuration) continue;

        const file = pickBestVideoFile(video.video_files);
        if (!file) continue;

        templates.push({
          sourceUrl: video.url,
          sourcePlatform: 'pexels',
          sourceCreator: video.user.name ?? null,
          sourceVideoId: String(video.id),
          mediaUrl: file.link,
          thumbnailUrl: video.image,
          durationSeconds: Math.round(video.duration),
          contentType: contentType as ContentType,
          viewCount: null,
          likeCount: null,
          title: `${query} template`,
          description: `Royalty-free ${query} clip from Pexels. Default niche: ${defaultNiche}.`,
        });
      }
    } catch (err) {
      console.error(`[Pexels] Failed query "${query}":`, err);
    }
  }

  return templates;
}

export { mapAspectRatio };
