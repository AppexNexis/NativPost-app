import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/libs/DB';
import { contentTemplateSchema } from '@/models/Schema';
import { runSeedPipelineWithErrors } from '@/lib/template-seed/seed';
import type { SourcePlatform } from '@/lib/template-seed';

// Ensure the route runs inside the Node.js runtime environment 
export const runtime = 'nodejs';
// Prevent Vercel / Next.js from caching cron responses
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const db = await getDb();
  const authHeader = request.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  // 1. Guard check for security
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured on the server.' }, { status: 500 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized execution attempt.' }, { status: 401 });
  }

  // 2. Parse Dynamic Options from URL Query Strings (Falls back to default configurations)
  const { searchParams } = new URL(request.url);
  
  const sourcesParam = searchParams.get('sources') ?? 'tiktok,instagram,pexels,youtube';
  const sources = sourcesParam.split(',').map((s) => s.trim()) as SourcePlatform[];

  const autoApprove = searchParams.get('approve') === 'true';
  const limitPerSource = searchParams.get('limit') ? Number(searchParams.get('limit')) : 30;
  const concurrency = searchParams.get('concurrency') ? Number(searchParams.get('concurrency')) : 3;
  const offset = searchParams.get('offset') ? Number(searchParams.get('offset')) : 0;

  const now = new Date();
  console.log(`[Cron Seed Pipeline] Triggered execution at ${now.toISOString()}`);
  console.log(`[Cron Seed Pipeline] Core Config -> Sources: [${sources.join(', ')}], Limit: ${limitPerSource}, Offset: ${offset}, Auto-Approve: ${autoApprove}`);

  try {
    // 3. Resolve environmental variations gracefully
    const apifyToken = process.env.APIFY_TOKEN ?? process.env.APIFY_API_KEY;
    if ((sources.includes('tiktok') || sources.includes('instagram')) && !apifyToken) {
      throw new Error('Apify token missing from environment variables (APIFY_TOKEN or APIFY_API_KEY).');
    }

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) throw new Error('Missing ANTHROPIC_API_KEY for AI template enrichment.');

    // 4. Assemble pipeline payload matrix
    const seedOptions = {
      sources,
      tiktok: sources.includes('tiktok') ? {
        apifyToken,
        hashtags: ['viral', 'trending', 'smallbusiness', 'entrepreneur', 'africa'],
        limit: limitPerSource,
        offset,
        minViews: 10000,
      } : undefined,

      instagram: sources.includes('instagram') ? {
        apifyToken,
        hashtags: ['smallbusiness', 'entrepreneur', 'viral', 'africanbusiness'],
        limit: limitPerSource,
        offset,
        minLikes: 500,
      } : undefined,

      pexels: sources.includes('pexels') ? {
        apiKey: process.env.PEXELS_API_KEY ?? '',
        perPage: 10,
        // Pexels has 12 niche queries; each page returns 10 per query = ~120 per page-set.
        // Fetch enough page-sets to cover the requested offset + limit.
        pages: Math.max(1, Math.ceil((offset + limitPerSource) / 120)),
        minDuration: 3,
        maxDuration: 60,
      } : undefined,

      youtube: sources.includes('youtube') ? {
        apiKey: process.env.YOUTUBE_API_KEY ?? '',
        maxResults: 15,
        // Each page returns up to 15 shorts. Fetch enough pages to cover offset + limit.
        pages: Math.max(1, Math.ceil((offset + limitPerSource) / 15)),
        regionCode: process.env.YOUTUBE_REGION_CODE ?? 'US',
      } : undefined,

      cloudinary: process.env.CLOUDINARY_API_SECRET ? {
        cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? '',
        apiKey: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY ?? '',
        apiSecret: process.env.CLOUDINARY_API_SECRET,
      } : undefined,

      anthropicApiKey,
      skipUpload: !process.env.CLOUDINARY_API_SECRET,
      uploadConcurrency: concurrency,
      curationStatus: autoApprove ? ('approved' as const) : ('pending' as const),
      limitPerSource,
      offset,
      onProgress: (msg: string) => console.log(`  → [Pipeline Process]: ${msg}`),
    };

    // 5. Execute Core Pipeline Logic
    const { templates: seeded, errors: pipelineErrors, rawCount, nextOffset } = await runSeedPipelineWithErrors(seedOptions);
    console.log(`[Cron Seed Pipeline] Framework execution finalized. Captured: ${seeded.length} enriched templates.`);

    if (seeded.length === 0) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        scraped: rawCount,
        nextOffset,
        errors: pipelineErrors,
        message: rawCount === 0
          ? 'No raw templates found. Check API keys and sources.'
          : 'All templates in this offset window already exist or were skipped.',
      });
    }

    // 6. Map elements to table schema mapping
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
      curationStatus: autoApprove ? 'approved' : 'pending',
      curatedBy: autoApprove ? 'automated-cron' : null,
      curatedAt: autoApprove ? new Date() : null,
      remixCount: 0,
      publishCount: 0,
      avgRemixPerformance: null,
      isActive: true,
      trainingUsed: false,
    }));

    // 7. Persist records inside database instance via transactional upsert mechanics
    const inserted = await db
      .insert(contentTemplateSchema)
      .values(values as any)
      .onConflictDoNothing({ target: contentTemplateSchema.sourceUrl })
      .returning({ id: contentTemplateSchema.id });

    console.log(`[Cron Seed Pipeline] Success. Added ${inserted.length} fresh templates to database structure.`);

    return NextResponse.json({
      success: true,
      scraped: seeded.length,
      rawCount,
      inserted: inserted.length,
      status: autoApprove ? 'approved' : 'pending',
      nextOffset,
      errors: pipelineErrors.length ? pipelineErrors : undefined,
    });

  } catch (error: any) {
    console.error('[Cron Seed Pipeline Fatal Error]:', error);
    return NextResponse.json({ 
      success: false, 
      error: error?.message || 'An unexpected operational breakdown occurred during execution.' 
    }, { status: 500 });
  }
}