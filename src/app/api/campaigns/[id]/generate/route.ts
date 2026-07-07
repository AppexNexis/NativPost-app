import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { checkFeatureAccess, checkPostLimit, hasActiveSubscription } from '@/lib/billing';
import { BLITZ_ALLOWED_PLATFORMS, getConnectedPlatforms, NoConnectedChannelsError } from '@/lib/social/connected-platforms';
import { getDb } from '@/libs/DB';
import {
  campaignJobSchema,
  campaignSchema,
  contentItemSchema,
} from '@/models/Schema';

import { BASE_URL } from '../../utils';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/campaigns/[id]/generate
 *
 * Enqueues an async campaign generation job and returns immediately with the
 * job ID. Actual work happens in `POST /api/cron/campaigns/process` (drained
 * by GitHub Actions cron every 2 minutes, and also kicked immediately from
 * here so single-user starts feel instant).
 *
 * Response:
 *   { jobId, campaignId, status: 'queued' }
 *
 * Poll `GET /api/campaigns/[id]/generate/status` for progress.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const { id } = await params;

  try {
    // 1. Fetch campaign and validate ownership
    const [campaign] = await db
      .select()
      .from(campaignSchema)
      .where(and(eq(campaignSchema.id, id), eq(campaignSchema.orgId, orgId!)))
      .limit(1);

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (campaign.status === 'generating') {
      // Check if there's already an in-flight job — return its id so the
      // client can attach and poll instead of returning a hard 409.
      const [existing] = await db
        .select()
        .from(campaignJobSchema)
        .where(
          and(
            eq(campaignJobSchema.campaignId, id),
            eq(campaignJobSchema.status, 'queued'),
          ),
        )
        .orderBy(desc(campaignJobSchema.createdAt))
        .limit(1);

      if (existing) {
        return NextResponse.json(
          { jobId: existing.id, campaignId: id, status: 'queued', existing: true },
          { status: 200 },
        );
      }
      // No queued job but campaign is stuck in 'generating' — fall through to
      // requeue. Prevents a stuck state from becoming permanent.
    }

    if (campaign.status === 'active' || campaign.status === 'completed') {
      return NextResponse.json(
        { error: `Cannot generate posts for a ${campaign.status} campaign` },
        { status: 400 },
      );
    }

    // 2. Billing / quota checks
    const active = await hasActiveSubscription(orgId!);
    if (!active) {
      return NextResponse.json(
        { error: 'Your subscription has expired. Please subscribe to continue generating content.' },
        { status: 403 },
      );
    }

    const postLimit = await checkPostLimit(orgId!);
    if (!postLimit.allowed) {
      return NextResponse.json({ error: postLimit.reason }, { status: 403 });
    }

    const mix = (campaign.contentMix as Record<string, number>) || {};
    const hasImages = (mix.carousel ?? 0) > 0 || (mix.slideshow ?? 0) > 0;
    const hasVideo = (mix.videoHook ?? 0) > 0 || (mix.greenScreen ?? 0) > 0 || (mix.talkingHead ?? 0) > 0 || (mix.wallOfText ?? 0) > 0;

    if (hasImages) {
      const imageCheck = await checkFeatureAccess(orgId!, 'imagePosts');
      if (!imageCheck.allowed) {
        return NextResponse.json({ error: imageCheck.reason }, { status: 403 });
      }
    }
    if (hasVideo) {
      const videoCheck = await checkFeatureAccess(orgId!, 'videoGeneration');
      if (!videoCheck.allowed) {
        return NextResponse.json({ error: videoCheck.reason }, { status: 403 });
      }
    }

    // 2a. Connected-channel gate — hard-block if the org has no
    // FB / IG / TikTok connection. The client renders a "Connect a channel"
    // CTA on this errorCode instead of a generic error banner.
    try {
      const connected = await getConnectedPlatforms(db, orgId!, {
        restrictTo: BLITZ_ALLOWED_PLATFORMS as unknown as string[],
      });
      if (connected.length === 0) {
        return NextResponse.json(
          {
            error: 'Connect Facebook, Instagram, or TikTok before generating posts.',
            errorCode: 'NO_CONNECTED_CHANNELS',
          },
          { status: 200 },
        );
      }
    } catch (chanErr: any) {
      if (chanErr instanceof NoConnectedChannelsError) {
        return NextResponse.json(
          { error: chanErr.message, errorCode: 'NO_CONNECTED_CHANNELS' },
          { status: 200 },
        );
      }
      throw chanErr;
    }

    // 2b. Daily-limit check — the ONLY acceptable "empty state" for Blitz.
    // Count today's rows for this campaign in the reviewable states and
    // stop enqueueing once we hit postsPerDay. Client renders a
    // "You've reviewed today's Blitz" panel with the reset time.
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const nextResetAt = new Date(startOfDay);
    nextResetAt.setDate(nextResetAt.getDate() + 1);

    const todaysRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(contentItemSchema)
      .where(
        and(
          eq(contentItemSchema.campaignId, id),
          gte(contentItemSchema.createdAt, startOfDay),
          inArray(contentItemSchema.status, ['pending_review', 'approved', 'skipped']),
        ),
      );
    const todayCount = todaysRows[0]?.count ?? 0;
    const dailyLimit = campaign.postsPerDay || 3;
    if (todayCount >= dailyLimit) {
      return NextResponse.json(
        {
          dailyLimitReached: true,
          count: todayCount,
          limit: dailyLimit,
          nextResetAt: nextResetAt.toISOString(),
        },
        { status: 200 },
      );
    }

    // 2c. No-templates: NOT a hard block. Blitz must always work per user
    // directive — the only acceptable empty state is `dailyLimitReached`.
    // When no approved templates match the mix the insert loop in
    // `utils.ts` falls back to `generateMediaForContentItem`, so posts
    // still land in Blitz. We keep a soft warning in the response for
    // observability but no early return.

    // 3. Read optional overrides from request body
    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch { /* no body is fine */ }

    const topicOverride = (body.topic as string) || null;
    const targetPlatformsOverride = Array.isArray(body.targetPlatforms)
      ? (body.targetPlatforms as string[])
      : null;

    // 4. Insert job row + flip campaign to generating
    const [job] = await db
      .insert(campaignJobSchema)
      .values({
        orgId: orgId!,
        campaignId: id,
        status: 'queued',
        progress: 0,
        step: 'starting',
        topicOverride,
        targetPlatformsOverride: targetPlatformsOverride as any,
      })
      .returning();

    await db.update(campaignSchema)
      .set({ status: 'generating', updatedAt: new Date() })
      .where(eq(campaignSchema.id, id));

    // 5. Kick the processor immediately so the user doesn't wait for the
    //    cron tick. Fire-and-forget — the process endpoint is idempotent and
    //    the cron drain will pick it up if this fetch fails.
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      fetch(`${BASE_URL}/api/cron/campaigns/process`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cronSecret}`,
          'Content-Type': 'application/json',
        },
        // Signal by jobId so the initial kick targets the just-queued job
        // directly instead of racing for whichever queued job is first.
        body: JSON.stringify({ jobId: job!.id }),
      }).catch((kickErr: any) => {
        console.warn('[CampaignGenerate] Kick failed (cron will retry):', kickErr?.message);
      });
    }

    return NextResponse.json(
      { jobId: job!.id, campaignId: id, status: 'queued' },
      { status: 202 },
    );
  } catch (err: any) {
    console.error('[CampaignGenerate] Enqueue failed:', err);
    return NextResponse.json(
      { error: 'Failed to enqueue campaign generation', detail: err.message },
      { status: 500 },
    );
  }
}
