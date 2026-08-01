import { waitUntil } from '@vercel/functions';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { checkFeatureAccess, checkPostLimit, getOrgBillingState, hasActiveSubscription } from '@/lib/billing';
import { drainOneJob } from '@/lib/campaigns/drain-job';
import { isBlitzCampaign } from '@/lib/campaigns/is-blitz';
import { CAMPAIGN_GENERATE_EVENT, inngest, isInngestConfigured } from '@/lib/inngest/client';
import { getConnectedPlatforms, NoConnectedChannelsError } from '@/lib/social/connected-platforms';
import { getDb } from '@/libs/DB';
import {
  campaignJobSchema,
  campaignSchema,
  contentItemSchema,
} from '@/models/Schema';

export const dynamic = 'force-dynamic';
// Match the drain budget — `waitUntil(drainOneJob)` needs headroom because
// the fresh-kick path runs the full generation in-process. GH Actions cron
// still handles the backlog if this invocation is cut short.
export const maxDuration = 300;

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/campaigns/[id]/generate
 *
 * Enqueues an async campaign generation job and returns immediately with
 * the job ID. The drain runs in-process via `waitUntil(drainOneJob)` so
 * the user doesn't wait for the next cron tick and the initial kick has
 * NO dependency on `CRON_SECRET` (a missing/mis-set secret used to
 * silently strand jobs at `attempts:0`). The GH Actions cron every 2min
 * still drains the backlog if a specific invocation is cut short.
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
        // Re-kick it. A job can be sitting at 'queued' because its runner
        // never picked it up — an unsynced Inngest app, or a chunk that parked
        // itself back on the queue between cron ticks. Returning the id
        // without a kick made pressing Generate again a no-op, so a stranded
        // job could only be rescued by waiting for the cron. The claim is
        // atomic, so this is harmless if a runner already has it.
        waitUntil(
          drainOneJob(db, { jobId: existing.id, sweepStale: false })
            .then(result => console.warn('[CampaignGenerate] Re-kick drain result:', JSON.stringify(result)))
            .catch((err: any) => console.warn('[CampaignGenerate] Re-kick threw:', err?.message)),
        );

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

    // ── Entitlement ────────────────────────────────────────────────────────
    // Blitz has its OWN allowance (`blitzPostsPerDay`) and is not gated by the
    // per-content-type flags. Those flags exist to keep Free "text only" for
    // ordinary campaigns; applying them to Blitz contradicted the plan, which
    // grants Free 2 Blitz posts a day. Because every Blitz content type is
    // video- or image-shaped, that gate rejected Blitz outright on Free with
    // "This feature is not available on your current plan" — while the billing
    // page advertised "Blitz mode · 2 posts/day". The daily cap is what bounds
    // the cost here, and it's already enforced on the Blitz surfaces.
    if (isBlitzCampaign(campaign)) {
      const billingState = await getOrgBillingState(orgId!);
      const blitzCap = billingState?.features?.blitzPostsPerDay ?? 0;
      if (blitzCap === 0) {
        return NextResponse.json(
          { error: 'Blitz is not available on your current plan. Upgrade to unlock it.' },
          { status: 403 },
        );
      }
    } else {
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
    }

    // 2a. Connected-channel gate — hard-block if the org has no eligible
    // channel. Campaigns support FB / IG / TikTok / YouTube (YouTube was
    // added to the wizard 2026-07-10; Blitz still restricts to the first
    // three via BLITZ_ALLOWED_PLATFORMS, so we use a local list here).
    const CAMPAIGN_PUBLISH_PLATFORMS = ['facebook', 'instagram', 'tiktok', 'youtube'];
    try {
      const connected = await getConnectedPlatforms(db, orgId!, {
        restrictTo: CAMPAIGN_PUBLISH_PLATFORMS,
      });
      if (connected.length === 0) {
        return NextResponse.json(
          {
            error: 'Connect Facebook, Instagram, TikTok, or YouTube before generating posts.',
            errorCode: 'NO_CONNECTED_CHANNELS',
          },
          { status: 400 },
        );
      }
    } catch (chanErr: any) {
      if (chanErr instanceof NoConnectedChannelsError) {
        return NextResponse.json(
          { error: chanErr.message, errorCode: 'NO_CONNECTED_CHANNELS' },
          { status: 400 },
        );
      }
      throw chanErr;
    }

    // 2a.1 Blitz-specific derive-on-read target check. Even when the org
    // has connected accounts, the user may have disabled all of them for
    // Blitz via campaign.blitzDisabledAccountIds. We compute the
    // effective target list here so the client renders the "connect an
    // account" CTA (via NO_CONNECTED_CHANNELS) instead of enqueuing a
    // job that would produce posts with nowhere to publish.
    if (isBlitzCampaign(campaign)) {
      const { resolveBlitzTargetAccounts } = await import('@/lib/blitz/resolve-target-accounts');
      const { socialAccountSchema } = await import('@/models/Schema');
      const socialAccounts = await db
        .select()
        .from(socialAccountSchema)
        .where(and(eq(socialAccountSchema.orgId, orgId!), eq(socialAccountSchema.isActive, true)));
      const resolve = resolveBlitzTargetAccounts({
        connectedAccounts: socialAccounts as any,
        blitzDisabledAccountIds: (campaign.blitzDisabledAccountIds as string[] | null | undefined) ?? null,
        legacyTargetAccounts: (campaign.targetAccounts as any[]) || null,
      });
      if (resolve.effectiveTargets.length === 0) {
        return NextResponse.json(
          {
            error: 'All Blitz publishing accounts are turned off. Enable at least one in Blitz settings, or connect a new account.',
            errorCode: 'NO_CONNECTED_CHANNELS',
            noTargets: true,
          },
          { status: 200 },
        );
      }
    }

    // 2b. Stale-item sweep — deactivate pending items that have no
    // sourceMediaSlots (from failed generation runs before the template
    // content-type mapping fix). Without this sweep, stale items:
    //   (a) count toward the daily limit, preventing new generation
    //   (b) sit at position 0 in the Blitz queue with a forever-spinner
    //   (c) block auto-generation on the client (items.length > 0)
    await db
      .update(contentItemSchema)
      .set({ status: 'failed' })
      .where(
        and(
          eq(contentItemSchema.campaignId, id),
          eq(contentItemSchema.status, 'pending_review'),
          sql`(enrichment_data->'sourceMediaSlots' IS NULL OR enrichment_data->'sourceMediaSlots' = '{}'::jsonb)`,
        ),
      );

    // 2c. Daily-limit check — the ONLY acceptable "empty state" for Blitz.
    // Count today's rows for this campaign in the reviewable states and
    // stop enqueueing once we hit postsPerDay. Client renders a
    // "You've reviewed today's Blitz" panel with the reset time.
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const nextResetAt = new Date(startOfDay);
    nextResetAt.setDate(nextResetAt.getDate() + 1);

    // Blitz ONLY. A campaign's quota is its whole window, not a day's worth —
    // applying this gate to campaigns meant the second generate of the day
    // returned `dailyLimitReached` for a campaign that had barely started.
    // `generateCampaignPosts` enforces the matching quota server-side; this is
    // just the fast path that avoids enqueuing a job with nothing to do.
    if (isBlitzCampaign(campaign)) {
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
      const dailyLimit = campaign.postsPerDay || 10;
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
    // Seed postsTotal from the campaign row up-front so the client's
    // first status poll shows a meaningful denominator instead of "0 of 0".
    // The drain will overwrite this with the final count when it finishes.
    const [job] = await db
      .insert(campaignJobSchema)
      .values({
        orgId: orgId!,
        campaignId: id,
        status: 'queued',
        progress: 0,
        step: 'starting',
        postsTotal: campaign.totalPosts || 0,
        topicOverride,
        targetPlatformsOverride: targetPlatformsOverride as any,
      })
      .returning();

    await db.update(campaignSchema)
      .set({ status: 'generating', updatedAt: new Date() })
      .where(eq(campaignSchema.id, id));

    // 5. Hand the job to a runner.
    //
    // PREFERRED — Inngest. The run is a sequence of durable chunk steps, so a
    // campaign of any size completes: no single invocation has to hold the
    // whole generation, a killed step is retried without redoing the ones
    // before it, and the work survives the user closing the tab (it never
    // depended on the tab, but it now no longer depends on this invocation
    // staying alive either).
    //
    // ALWAYS — the in-process kick, so generation starts NOW.
    //
    // This is deliberately NOT gated on whether Inngest is configured. Having
    // the keys set does not mean the app has been synced with Inngest, and an
    // unsynced app accepts the event and triggers nothing ("No functions
    // triggered by this event"). Gating the kick on `isInngestConfigured()`
    // therefore made a half-configured Inngest strictly WORSE than none:
    // generation sat untouched until a GitHub cron tick — minutes, and those
    // ticks run late — with the UI stuck on "Generating… 0 of N".
    //
    // Running both is safe by construction. `drainOneJob` claims via
    // `UPDATE … WHERE status='queued' RETURNING`, so exactly one runner wins;
    // the loser sees the job isn't claimable and no-ops. And because
    // `generateCampaignPosts` derives what's left from rows on disk, even a
    // perfect race cannot double-insert past the campaign's quota.
    waitUntil(
      drainOneJob(db, { jobId: job!.id, sweepStale: false })
        .then((result) => {
          console.warn('[CampaignGenerate] Kick drain result:', JSON.stringify(result));
        })
        .catch((kickErr: any) => {
          console.warn('[CampaignGenerate] Kick drain threw (cron will retry):', kickErr?.message);
        }),
    );

    // ALSO hand it to Inngest when configured. Once the app is synced, Inngest
    // drives the remaining chunks as durable steps — picking up wherever the
    // in-process kick ran out of budget, since a parked job goes back to
    // 'queued' with its progress intact. Until then this is a no-op and the
    // kick above (plus the 2-minute cron backstop) does the work.
    let dispatched = false;
    if (isInngestConfigured()) {
      try {
        await inngest.send({
          name: CAMPAIGN_GENERATE_EVENT,
          data: { jobId: job!.id, campaignId: id, orgId: orgId! },
        });
        dispatched = true;
      } catch (sendErr: any) {
        console.warn('[CampaignGenerate] Inngest send failed (kick already running):', sendErr?.message);
      }
    }

    return NextResponse.json(
      { jobId: job!.id, campaignId: id, status: 'queued', runner: dispatched ? 'inline+inngest' : 'inline' },
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
