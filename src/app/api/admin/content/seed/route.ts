import { auth } from '@clerk/nextjs/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import type { SourcePlatform } from '@/lib/template-seed';
import { runSeedPipelineWithErrors } from '@/lib/template-seed/seed';
import { getDb } from '@/libs/DB';
import { contentTemplateSchema } from '@/models/Schema';

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
  if (error) {
    return error;
  }

  const db = await getDb();

  try {
    const body = (await req.json()) as {
      sources?: SourcePlatform[];
      limitPerSource?: number;
      /** Optional override — falls back to each provider's curated SEED_ACCOUNTS list. */
      instagramUsernames?: string[];
      /** Optional override — falls back to each provider's curated SEED_ACCOUNTS list. */
      tiktokUsernames?: string[];
    };

    if (!Array.isArray(body.sources) || body.sources.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request: sources must be a non-empty array' },
        { status: 400 },
      );
    }

    const invalidSources = body.sources.filter(
      s => !VALID_SOURCES.includes(s),
    );
    if (invalidSources.length > 0) {
      return NextResponse.json(
        { error: `Invalid sources: ${invalidSources.join(', ')}` },
        { status: 400 },
      );
    }

    const limitPerSource
    = typeof body.limitPerSource === 'number' && body.limitPerSource > 0
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

    const apifyToken = process.env.APIFY_TOKEN;
    const sources = body.sources;

    // Verify apify credentials if viral platform scraping is triggered
    if ((sources.includes('tiktok') || sources.includes('instagram')) && !apifyToken) {
      return NextResponse.json(
        { error: 'APIFY_TOKEN is missing from environment setup' },
        { status: 400 },
      );
    }

    const { templates, errors } = await runSeedPipelineWithErrors({
      sources,
      limitPerSource,
      apifyToken,
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
      tiktok: sources.includes('tiktok')
        ? {
            apifyToken: apifyToken ?? '',
            // Providers fall back to the curated SEED_ACCOUNTS list
            // (apify-tiktok.ts / seed-accounts.ts) when usernames is omitted.
            usernames: body.tiktokUsernames,
            limit: limitPerSource ?? 15,
            minViews: 0,
          }
        : undefined,
      instagram: sources.includes('instagram')
        ? {
            apifyToken: apifyToken ?? '',
            // Providers fall back to the curated SEED_ACCOUNTS list
            // (apify-instagram.ts / seed-accounts.ts) when usernames is omitted.
            usernames: body.instagramUsernames,
            limit: limitPerSource ?? 15,
            minLikes: 0,
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

    // Drop moderation-rejected uploads entirely — Cloudinary won't deliver
    // them and keeping them just risks re-upload and further AUP strikes.
    const safe = templates.filter((t) => t.cloudinary?.moderation?.status !== 'rejected');
    const droppedByModeration = templates.length - safe.length;
    if (droppedByModeration > 0) {
      console.warn(`[admin/seed] moderation rejected ${droppedByModeration}/${templates.length} items`);
    }

    const values = safe.map((t) => {
      const moderationStatus = t.cloudinary?.moderation?.status ?? null;
      const moderationKind = t.cloudinary?.moderation?.kind ?? null;
      const isModerationApproved = moderationStatus === 'approved';
      // Sync-approved (aws_rek on images) → live.
      // Async-pending (aws_rek_video) → hidden until webhook flips.
      // No moderation run (skipUpload / add-on unset) → keep live for backward compat.
      const isActive = moderationStatus === null ? true : isModerationApproved;
      const curationStatus = moderationStatus === 'pending'
        ? 'pending_moderation'
        : ('pending' as const);
      return {
        sourceUrl: t.sourceUrl,
        sourcePlatform: t.sourcePlatform,
        sourceCreator: t.sourceCreator,
        sourceVideoId: t.sourceVideoId,
        sourcePostId: t.sourcePostId,
        mediaUrl: t.mediaUrl,
        thumbnailUrl: t.thumbnailUrl,
        thumbnailUrls: Array.isArray(t.thumbnailUrls) ? t.thumbnailUrls : {},
        slideCaptions: Array.isArray(t.slideCaptions) ? t.slideCaptions : {},
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
        curationStatus,
        curatedBy: null,
        curatedAt: null,
        remixCount: 0,
        publishCount: 0,
        avgRemixPerformance: null,
        isActive,
        trainingUsed: false,
        cloudinaryPublicId: t.cloudinary?.publicId ?? null,
        moderationStatus,
        moderationKind,
        moderationLabels: (t.cloudinary?.moderationAll ?? []) as any,
        moderationCheckedAt: moderationStatus ? new Date() : null,
      };
    });

    const inserted = await db
      .insert(contentTemplateSchema)
      .values(values)
      .onConflictDoNothing({ target: contentTemplateSchema.sourceUrl })
      .returning({ id: contentTemplateSchema.id });

    return NextResponse.json(
      { seeded: inserted.length, moderationRejected: droppedByModeration, errors },
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