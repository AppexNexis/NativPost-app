/**
 * Core seed orchestrator for trending content templates.
 *
 * Combines multiple viral source providers (Pexels, YouTube, TikTok Research,
 * Instagram, TikTok Creative Center), AI enrichment, Cloudinary uploads, and
 * DB persistence into one pipeline.
 */

import { configureCloudinary, uploadVideoFromUrl, type UploadResult } from './cloudinary';
import { enrichTemplateWithAI } from './ai';
import { fetchPexelsTemplates, type PexelsImporterOptions } from './providers/pexels';
import { searchYouTubeShorts, type YouTubeImporterOptions } from './providers/youtube';
import { tiktokResearchProvider, type TikTokResearchOptions } from './providers/tiktok-research';
import { instagramProvider, type InstagramOptions } from './providers/instagram';
import { tiktokCreativeCenterProvider, type TikTokCreativeCenterOptions } from './providers/tiktok-creative-center';
import type { EnrichedTemplate, RawTemplate, SourcePlatform, ViralSourceProvider } from './types';

export interface SeedOptions {
  /** Which sources to pull from. */
  sources: SourcePlatform[];
  /** Pexels API options. */
  pexels?: PexelsImporterOptions;
  /** YouTube API options. */
  youtube?: YouTubeImporterOptions;
  /** TikTok Research API options. */
  tiktokResearch?: TikTokResearchOptions;
  /** Instagram Basic Display / Graph API options. */
  instagram?: InstagramOptions;
  /** Experimental TikTok Creative Center scraping fallback. */
  tiktokCreativeCenter?: TikTokCreativeCenterOptions;
  /** Anthropic API key for AI enrichment. */
  anthropicApiKey: string;
  /** Cloudinary config. */
  cloudinary: {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
  };
  /** Skip uploading media to Cloudinary. */
  skipUpload?: boolean;
  /** Max concurrent Cloudinary uploads. */
  uploadConcurrency?: number;
  /** Set curation status on inserted rows. */
  curationStatus?: 'pending' | 'approved' | 'rejected';
  /** Max templates to import per source. */
  limitPerSource?: number;
  /** Callback for progress updates. */
  onProgress?: (message: string) => void;
}

export interface SeededTemplate extends EnrichedTemplate {
  cloudinary?: UploadResult;
}

export interface SeedPipelineResult {
  templates: SeededTemplate[];
  errors: string[];
  rawCount: number;
}

function sanitizePublicId(input: string): string {
  // Cloudinary public IDs can only contain: a-z, A-Z, 0-9, _, -, /, .
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_.\-/]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 120);
}

async function withConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const executing: Promise<void>[] = [];

  for (let i = 0; i < items.length; i++) {
    const promise = (async (index: number) => {
      results[index] = await fn(items[index]!, index);
    })(i);

    executing.push(promise);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
      executing.splice(
        executing.findIndex((p) => p === promise),
        1,
      );
    }
  }

  await Promise.all(executing);
  return results;
}

interface ProviderJob {
  provider: ViralSourceProvider;
  options: Record<string, unknown>;
  label: string;
}

async function fetchRawTemplates(
  options: SeedOptions,
): Promise<{ raw: RawTemplate[]; errors: string[] }> {
  const jobs: ProviderJob[] = [];

  if (options.sources.includes('pexels') && options.pexels) {
    jobs.push({
      provider: {
        name: 'pexels',
        fetch: async (opts) => fetchPexelsTemplates(opts as unknown as PexelsImporterOptions),
      },
      options: options.pexels as unknown as Record<string, unknown>,
      label: 'Pexels',
    });
  }

  if (options.sources.includes('youtube') && options.youtube) {
    jobs.push({
      provider: {
        name: 'youtube',
        fetch: async (opts) => searchYouTubeShorts(opts as unknown as YouTubeImporterOptions),
      },
      options: options.youtube as unknown as Record<string, unknown>,
      label: 'YouTube',
    });
  }

  if (options.sources.includes('tiktok')) {
    if (options.tiktokResearch) {
      jobs.push({
        provider: tiktokResearchProvider,
        options: { ...options.tiktokResearch, limit: options.limitPerSource ?? options.tiktokResearch.limit } as Record<string, unknown>,
        label: 'TikTok Research',
      });
    }
    if (options.tiktokCreativeCenter) {
      jobs.push({
        provider: tiktokCreativeCenterProvider,
        options: { ...options.tiktokCreativeCenter, limit: options.limitPerSource ?? options.tiktokCreativeCenter.limit } as Record<string, unknown>,
        label: 'TikTok Creative Center',
      });
    }
  }

  if (options.sources.includes('instagram') && options.instagram) {
    jobs.push({
      provider: instagramProvider,
      options: { ...options.instagram, limit: options.limitPerSource ?? options.instagram.limit } as Record<string, unknown>,
      label: 'Instagram',
    });
  }

  if (jobs.length === 0) {
    return { raw: [], errors: [] };
  }

  const results = await Promise.allSettled(
    jobs.map(async (job) => {
      options.onProgress?.(`Fetching templates from ${job.label}...`);
      const items = await job.provider.fetch(job.options);
      options.onProgress?.(`Fetched ${items.length} templates from ${job.label}.`);
      return items;
    }),
  );

  const all: RawTemplate[] = [];
  const errors: string[] = [];

  results.forEach((result, index) => {
    const job = jobs[index]!;
    const label = job.label;
    if (result.status === 'fulfilled') {
      all.push(...result.value);
    } else {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push(`${label}: ${message}`);
      console.error(`[Seed] Provider ${label} failed:`, result.reason);
    }
  });

  // Deduplicate by sourceVideoId, falling back to sourceUrl.
  const seen = new Set<string>();
  const deduped: RawTemplate[] = [];

  for (const template of all) {
    const key = template.sourceVideoId ?? template.sourceUrl;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(template);
  }

  return { raw: deduped, errors };
}

async function uploadToCloudinary(
  templates: EnrichedTemplate[],
  options: SeedOptions,
): Promise<Map<string, UploadResult>> {
  if (options.skipUpload) {
    return new Map();
  }

  configureCloudinary(options.cloudinary);

  const uploadable = templates.filter(
    (t) => t.sourcePlatform === 'pexels' && t.mediaUrl,
  );

  options.onProgress?.(`Uploading ${uploadable.length} videos to Cloudinary...`);

  const results = await withConcurrency(
    uploadable,
    options.uploadConcurrency ?? 3,
    async (template, index) => {
      try {
        const publicId = sanitizePublicId(
          `pexels_${template.sourceVideoId}_${Date.now()}`,
        );
        const result = await uploadVideoFromUrl(template.mediaUrl!, publicId);
        options.onProgress?.(`Uploaded ${index + 1}/${uploadable.length}: ${publicId}`);
        return { template, result };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        options.onProgress?.(`Upload failed for ${template.sourceVideoId}: ${message}`);
        return { template, result: null };
      }
    },
  );

  const map = new Map<string, UploadResult>();
  for (const { template, result } of results) {
    if (result) {
      map.set(template.sourceUrl, result);
    }
  }

  return map;
}

async function runEnrichment(
  templates: RawTemplate[],
  options: SeedOptions,
): Promise<EnrichedTemplate[]> {
  if (templates.length === 0) return [];

  options.onProgress?.(`Enriching ${templates.length} templates with AI...`);

  const enriched: EnrichedTemplate[] = [];
  for (let i = 0; i < templates.length; i++) {
    const template = templates[i]!;
    try {
      const item = await enrichTemplateWithAI(template, options.anthropicApiKey);
      enriched.push(item);
      options.onProgress?.(`Enriched ${i + 1}/${templates.length}: ${item.sourcePlatform}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      options.onProgress?.(`Enrichment failed for ${template.sourceUrl}: ${message}`);
    }
  }

  return enriched;
}

async function runSeedPipelineInternal(
  options: SeedOptions,
): Promise<SeedPipelineResult> {
  const { raw, errors } = await fetchRawTemplates(options);

  // Optional per-source limit
  let limited = raw;
  if (options.limitPerSource) {
    const counts = new Map<SourcePlatform, number>();
    limited = raw.filter((t) => {
      const count = counts.get(t.sourcePlatform) ?? 0;
      if (count >= options.limitPerSource!) return false;
      counts.set(t.sourcePlatform, count + 1);
      return true;
    });
  }

  if (limited.length === 0) {
    options.onProgress?.('No raw templates found. Check API keys and sources.');
    return { templates: [], errors, rawCount: raw.length };
  }

  const enriched = await runEnrichment(limited, options);
  const uploads = await uploadToCloudinary(enriched, options);

  const templates = enriched.map((template) => {
    const cloudinary = uploads.get(template.sourceUrl);
    return {
      ...template,
      cloudinary,
      // If we uploaded to Cloudinary, override media/thumbnail URLs.
      mediaUrl: cloudinary?.secureUrl ?? template.mediaUrl,
      thumbnailUrl: cloudinary?.thumbnailUrl ?? template.thumbnailUrl,
    };
  });

  return { templates, errors, rawCount: raw.length };
}

/**
 * Run the full seed pipeline and return enriched templates (without DB insertion).
 * Callers can persist the returned items however they want.
 *
 * @deprecated Use {@link runSeedPipelineWithErrors} if you need provider error details.
 */
export async function runSeedPipeline(
  options: SeedOptions,
): Promise<SeededTemplate[]> {
  const { templates } = await runSeedPipelineInternal(options);
  return templates;
}

/**
 * Run the full seed pipeline and return both the enriched templates and any
 * provider-level errors encountered along the way.
 */
export async function runSeedPipelineWithErrors(
  options: SeedOptions,
): Promise<SeedPipelineResult> {
  return runSeedPipelineInternal(options);
}
