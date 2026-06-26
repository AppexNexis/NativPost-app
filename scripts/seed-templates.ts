#!/usr/bin/env node
/**
 * Seed script: populate content_template with trending content.
 *
 * Usage:
 *   npx tsx scripts/seed-templates.ts
 *   npx tsx scripts/seed-templates.ts --dry-run
 *   npx tsx scripts/seed-templates.ts --sources=pexels
 *   npx tsx scripts/seed-templates.ts --skip-upload --approve
 *
 * With env file (recommended):
 *   dotenv -c production -- npx tsx scripts/seed-templates.ts
 */

import { getDb } from '../src/libs/DB';
import { contentTemplateSchema } from '../src/models/Schema';
import { runSeedPipeline } from '../src/lib/template-seed/seed';
import type { SourcePlatform } from '../src/lib/template-seed';

interface CliArgs {
  dryRun: boolean;
  skipUpload: boolean;
  approve: boolean;
  sources: SourcePlatform[];
  limitPerSource?: number;
  pexelsPerPage: number;
  youtubeMaxResults: number;
  concurrency: number;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const getFlag = (name: string): string | undefined => {
    const found = args.find((a) => a.startsWith(`--${name}=`));
    return found ? found.split('=')[1] : undefined;
  };
  const hasFlag = (name: string): boolean => args.includes(`--${name}`);

  const sources = (getFlag('sources') ?? 'pexels,youtube')
    .split(',')
    .map((s) => s.trim()) as SourcePlatform[];

  return {
    dryRun: hasFlag('dry-run'),
    skipUpload: hasFlag('skip-upload'),
    approve: hasFlag('approve'),
    sources,
    limitPerSource: getFlag('limit') ? Number(getFlag('limit')) : undefined,
    pexelsPerPage: Number(getFlag('pexels-per-page') ?? '8'),
    youtubeMaxResults: Number(getFlag('youtube-max') ?? '20'),
    concurrency: Number(getFlag('concurrency') ?? '3'),
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function main() {
  const args = parseArgs();

  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│  NativPost — Seed Trending Content Templates                │');
  console.log('└─────────────────────────────────────────────────────────────┘');
  console.log(`Sources:        ${args.sources.join(', ')}`);
  console.log(`Dry run:        ${args.dryRun}`);
  console.log(`Skip upload:    ${args.skipUpload}`);
  console.log(`Auto-approve:   ${args.approve}`);
  console.log(`Limit/source:   ${args.limitPerSource ?? 'unlimited'}`);
  console.log('');

  const anthropicApiKey = requireEnv('ANTHROPIC_API_KEY');

  const seedOptions = {
    sources: args.sources,
    pexels: args.sources.includes('pexels')
      ? {
        apiKey: requireEnv('PEXELS_API_KEY'),
        perPage: args.pexelsPerPage,
        minDuration: 3,
        maxDuration: 60,
      }
      : undefined,
    youtube: args.sources.includes('youtube')
      ? {
        apiKey: requireEnv('YOUTUBE_API_KEY'),
        maxResults: args.youtubeMaxResults,
        regionCode: process.env.YOUTUBE_REGION_CODE ?? 'US',
      }
      : undefined,
    anthropicApiKey,
    cloudinary: {
      cloudName: requireEnv('NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME'),
      apiKey: requireEnv('NEXT_PUBLIC_CLOUDINARY_API_KEY'),
      apiSecret: requireEnv('CLOUDINARY_API_SECRET'),
    },
    skipUpload: args.skipUpload,
    uploadConcurrency: args.concurrency,
    curationStatus: args.approve ? ('approved' as const) : ('pending' as const),
    limitPerSource: args.limitPerSource,
    onProgress: (msg: string) => console.log(`  → ${msg}`),
  };

  const seeded = await runSeedPipeline(seedOptions);

  console.log(`\nPipeline complete: ${seeded.length} templates enriched.`);

  if (args.dryRun) {
    console.log('\nDry run — no rows written to the database.');
    console.log('\nSample templates:');
    for (const t of seeded.slice(0, 3)) {
      console.log(`  • ${t.sourcePlatform} | ${t.contentType} | ${t.niches.join(', ')} | ${t.sourceUrl}`);
    }
    return;
  }

  if (seeded.length === 0) {
    console.log('No templates to insert.');
    return;
  }

  console.log('Inserting into database...');
  const db = await getDb();

  const values = seeded.map((t) => ({
    sourceUrl: t.sourceUrl,
    sourcePlatform: t.sourcePlatform,
    sourceCreator: t.sourceCreator,
    sourceVideoId: t.sourceVideoId,
    mediaUrl: t.mediaUrl,
    thumbnailUrl: t.thumbnailUrl,
    thumbnailUrls: {},
    durationSeconds: t.durationSeconds,
    contentType: t.contentType,
    niches: t.niches,
    angles: t.angles,
    structure: t.structure,
    engagementScore: t.engagementScore,
    viewCount: t.viewCount,
    likeCount: t.likeCount,
    shareCount: null,
    commentCount: null,
    curationStatus: args.approve ? 'approved' : 'pending',
    curatedBy: args.approve ? 'seed-script' : null,
    curatedAt: args.approve ? new Date() : null,
    remixCount: 0,
    publishCount: 0,
    avgRemixPerformance: null,
    isActive: true,
    trainingUsed: false,
  }));

  const inserted = await db
    .insert(contentTemplateSchema)
    .values(values as any)
    .returning({ id: contentTemplateSchema.id });

  console.log(`\n✅ Inserted ${inserted.length} templates into content_template.`);
  console.log(`   Curation status: ${args.approve ? 'approved' : 'pending'}`);
}

main().catch((err) => {
  console.error('\n❌ Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
