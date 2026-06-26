import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

import { getDb } from '@/libs/DB';
import { contentTemplateSchema } from '@/models/Schema';
import { runSeedPipelineWithErrors } from '@/lib/template-seed/seed';
import type { SourcePlatform } from '@/lib/template-seed';

const VALID_SOURCES: SourcePlatform[] = ['pexels', 'youtube', 'tiktok', 'instagram'];

/**
 * NativPost admin guard — same check as other admin routes.
 * Must be org:admin AND the org must be the NativPost team org.
 */
async function requireAdmin() {
  const { userId, orgId, orgRole } = await auth();

  if (!userId || !orgId) {
    return {
      error: NextResponse.json(
        { error: 'Unauthorized — sign in and select an organization' },
        { status: 401 },
      ),
      orgId: null,
    };
  }

  const teamOrgId = process.env.NEXT_PUBLIC_NATIVPOST_TEAM_ORG_ID;
  const isNativPostStaff = !!(
    teamOrgId && orgId === teamOrgId && orgRole === 'org:admin'
  );

  if (!isNativPostStaff) {
    return {
      error: NextResponse.json(
        { error: 'Forbidden — NativPost admin access required' },
        { status: 403 },
      ),
      orgId: null,
    };
  }

  return { error: null, orgId };
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const db = await getDb();

  try {
    const body = (await req.json()) as {
      sources?: SourcePlatform[];
      limitPerSource?: number;
    };

    if (!Array.isArray(body.sources) || body.sources.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request: sources must be a non-empty array' },
        { status: 400 },
      );
    }

    const invalidSources = body.sources.filter(
      (s) => !VALID_SOURCES.includes(s),
    );
    if (invalidSources.length > 0) {
      return NextResponse.json(
        { error: `Invalid sources: ${invalidSources.join(', ')}` },
        { status: 400 },
      );
    }

    const limitPerSource =
      typeof body.limitPerSource === 'number' && body.limitPerSource > 0
        ? Math.min(body.limitPerSource, 100)
        : undefined;

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY is not configured' },
        { status: 400 },
      );
    }

    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const cloudApiKey = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !cloudApiKey || !apiSecret) {
      return NextResponse.json(
        { error: 'Cloudinary credentials are not configured' },
        { status: 400 },
      );
    }

    const sources = body.sources;

    const { templates, errors } = await runSeedPipelineWithErrors({
      sources,
      limitPerSource,
      pexels: sources.includes('pexels')
        ? {
            apiKey: process.env.PEXELS_API_KEY ?? '',
            perPage: 8,
            minDuration: 3,
            maxDuration: 60,
          }
        : undefined,
      youtube: sources.includes('youtube')
        ? {
            apiKey: process.env.YOUTUBE_API_KEY ?? '',
            maxResults: limitPerSource ?? 25,
            regionCode: process.env.YOUTUBE_REGION_CODE ?? 'US',
          }
        : undefined,
      tiktokResearch: sources.includes('tiktok')
        ? {
            apiKey: process.env.TIKTOK_RESEARCH_API_KEY ?? '',
            endpoint: process.env.TIKTOK_RESEARCH_ENDPOINT,
            limit: limitPerSource ?? 20,
          }
        : undefined,
      instagram: sources.includes('instagram')
        ? {
            accessToken: process.env.INSTAGRAM_ACCESS_TOKEN ?? '',
            accountId: process.env.INSTAGRAM_ACCOUNT_ID,
            limit: limitPerSource ?? 20,
          }
        : undefined,
      tiktokCreativeCenter: sources.includes('tiktok')
        ? {
            limit: limitPerSource ?? 20,
          }
        : undefined,
      anthropicApiKey,
      cloudinary: {
        cloudName,
        apiKey: cloudApiKey,
        apiSecret,
      },
      skipUpload: false,
      uploadConcurrency: 3,
      curationStatus: 'pending',
      onProgress: (msg: string) => console.log(`[admin/seed] ${msg}`),
    });

    if (templates.length === 0) {
      return NextResponse.json({ seeded: 0, errors }, { status: 200 });
    }

    const values = templates.map((t) => ({
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
      curationStatus: 'pending' as const,
      curatedBy: null,
      curatedAt: null,
      remixCount: 0,
      publishCount: 0,
      avgRemixPerformance: null,
      isActive: true,
      trainingUsed: false,
    }));

    const inserted = await db
      .insert(contentTemplateSchema)
      .values(values)
      .returning({ id: contentTemplateSchema.id });

    return NextResponse.json(
      { seeded: inserted.length, errors },
      { status: 200 },
    );
  } catch (err) {
    console.error('Admin seed error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
