import { and, eq, lte } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { enhanceImage } from '@/lib/cloudinary-enhance';
import { reconstructRenderInput } from '@/lib/editor/reconstruct-render-input';
import { renderEditorVideoServer, RenderTimeoutError } from '@/lib/editor/render-editor-video-server';
import { renderAllSlides } from '@/lib/editor/render-slide-image';
import { sendPublishedNotification } from '@/lib/email';
import { notifyPublishFailed, notifyPublishSucceeded } from '@/lib/notifications';
import { notifyPostFailed, notifyPostPublished } from '@/lib/notify-connect';
import { publishToplatform } from '@/lib/social-publish';
import { fireWebhook } from '@/lib/webhook-dispatcher';
import { getDb } from '@/libs/DB';
import {
  contentItemSchema,
  publishingQueueSchema,
  socialAccountSchema,
} from '@/models/Schema';
import { isVideoContentType } from '@/types/v2';

// Vercel Hobby cap; compile step for each video post needs budget
export const maxDuration = 300;

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || '';

/**
 * Human-readable org name for emails.
 *
 * `sendPublishedNotification`'s second argument is `brandName` and goes
 * straight into the subject line and the body. This cron used to pass
 * `item.orgId`, so every published-post email read "Content for
 * org_3CU4YYx3bZFlQbg81ni8aN6cZOa is now live". The manual publish route
 * always resolved the real name — only the scheduled path leaked the id.
 *
 * Cached per invocation: one run publishes many posts, usually all for the
 * same org, and this would otherwise be one Clerk call per post.
 *
 * Falls back to a generic word rather than the id — if the lookup fails, a
 * slightly vague email still beats showing an internal identifier.
 */
const orgNameCache = new Map<string, string>();

async function getOrgName(orgId: string): Promise<string> {
  const cached = orgNameCache.get(orgId);
  if (cached !== undefined) {
    return cached;
  }
  let name = 'your workspace';
  if (CLERK_SECRET_KEY) {
    try {
      const res = await fetch(`https://api.clerk.com/v1/organizations/${orgId}`, {
        headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data?.name === 'string' && data.name.trim()) {
          name = data.name.trim();
        }
      }
    } catch (err) {
      console.error('[Cron] Failed to resolve org name:', err);
    }
  }
  orgNameCache.set(orgId, name);
  return name;
}

async function getOrgAdminEmail(orgId: string): Promise<string | null> {
  if (!CLERK_SECRET_KEY) {
    return null;
  }
  try {
    const res = await fetch(
      `https://api.clerk.com/v1/organizations/${orgId}/memberships?limit=10`,
      {
        headers: {
          'Authorization': `Bearer ${CLERK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      },
    );
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    const memberships: any[] = data.data ?? data ?? [];
    const admin = memberships.find(m => m.role === 'org:admin') ?? memberships[0];
    if (!admin?.public_user_data?.user_id) {
      return null;
    }

    const userRes = await fetch(
      `https://api.clerk.com/v1/users/${admin.public_user_data.user_id}`,
      { headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` } },
    );
    if (!userRes.ok) {
      return null;
    }
    const user = await userRes.json();
    const primaryEmail = user.email_addresses?.find(
      (e: any) => e.id === user.primary_email_address_id,
    )?.email_address;
    return primaryEmail ?? null;
  } catch {
    return null;
  }
}

// -----------------------------------------------------------
// GET /api/cron/publish-scheduled
// Called by GitHub Actions every 5 minutes.
// -----------------------------------------------------------
export async function GET(request: NextRequest) {
  const db = await getDb();
  const authHeader = request.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[Cron] CRON_SECRET env var not set');
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.error('[Cron] Unauthorized attempt. Header:', authHeader?.slice(0, 20));
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const batchStartTime = Date.now();
  console.log(`[Cron] Running at ${now.toISOString()}`);

  try {
    // 0. Reclaim abandoned claims.
    // A run killed mid-publish (function timeout, deploy, crash) leaves its
    // post at 'publishing' with nothing coming back for it. Anything older
    // than this cutoff is returned to the queue so it isn't stranded
    // permanently. The window is comfortably longer than a worst-case publish
    // (300s compile + per-platform calls) so it can never steal a post from a
    // run that is still working on it — which would reintroduce the duplicate
    // this claim exists to prevent.
    const STALE_PUBLISH_MS = 15 * 60 * 1000;
    const staleCutoff = new Date(Date.now() - STALE_PUBLISH_MS);
    const reclaimed = await db
      .update(contentItemSchema)
      .set({ status: 'scheduled', updatedAt: new Date() })
      .where(
        and(
          eq(contentItemSchema.status, 'publishing'),
          lte(contentItemSchema.updatedAt, staleCutoff),
        ),
      )
      .returning({ id: contentItemSchema.id });
    if (reclaimed.length > 0) {
      console.warn(`[Cron] Reclaimed ${reclaimed.length} abandoned publish(es)`);
    }

    // 1. Find all due scheduled posts
    const duePosts = await db
      .select()
      .from(contentItemSchema)
      .where(
        and(
          eq(contentItemSchema.status, 'scheduled'),
          lte(contentItemSchema.scheduledFor, now),
        ),
      );

    if (duePosts.length === 0) {
      return NextResponse.json({ published: 0, message: 'No posts due' });
    }

    console.log(`[Cron] Found ${duePosts.length} post(s) due`);
    const results = [];

    for (const item of duePosts) {
      // ── Claim the post before publishing anything ─────────────────────────
      // WITHOUT THIS, POSTS PUBLISH TWICE OR THREE TIMES.
      //
      // The row stayed 'scheduled' for the WHOLE publish — video compile
      // (up to 300s) plus a network round trip per platform. This cron runs
      // every 5 minutes, so any publish slower than that was still holding a
      // 'scheduled' row when the next run selected it, and both published.
      // Several overlapping runs meant several duplicates on the real account.
      //
      // The conditional UPDATE is atomic: exactly one runner flips
      // 'scheduled' -> 'publishing' and gets a row back. Everyone else gets
      // nothing and skips. Same guard as `drainOneJob` uses for campaign jobs.
      const claimed = await db
        .update(contentItemSchema)
        .set({ status: 'publishing', updatedAt: new Date() })
        .where(
          and(
            eq(contentItemSchema.id, item.id),
            eq(contentItemSchema.status, 'scheduled'),
          ),
        )
        .returning({ id: contentItemSchema.id });

      if (claimed.length === 0) {
        console.log(`[Cron] Post ${item.id} already claimed by another run — skipping`);
        continue;
      }

      console.log(`[Cron] Publishing post ${item.id} for org ${item.orgId}`);

      try {
        const platforms = (item.targetPlatforms as string[]) || [];
        if (platforms.length === 0) {
          results.push({ id: item.id, success: false, error: 'No target platforms' });
          continue;
        }

        // 2. Get connected social accounts for this org
        const accounts = await db
          .select()
          .from(socialAccountSchema)
          .where(
            and(
              eq(socialAccountSchema.orgId, item.orgId),
              eq(socialAccountSchema.isActive, true),
            ),
          );

        const platformResults: Array<{
          platform: string;
          success: boolean;
          platformPostId?: string;
          error?: string;
          /** Handle posted to — surfaced in the notification email. */
          accountName?: string | null;
          /** Direct link to the live post, when the platform returns one. */
          permalink?: string | null;
        }> = [];

        // ── Multi-slide image kinds / single_image: render slides via engine ──
        // slideshow / carousel share the per-slide caption bake; single_image
        // bakes one caption. All must go through the Puppeteer slide render so
        // published images are WYSIWYG with the editor preview.
        // data_story is a static image carousel (NOT a video type): it bakes
        // as slides here, same as slideshow/carousel, and is out of
        // VIDEO_CONTENT_TYPES (v2.ts) so publishers dispatch it as photos.
        const MULTI_SLIDE_IMAGE_KINDS = ['slideshow', 'carousel', 'data_story'];
        if (MULTI_SLIDE_IMAGE_KINDS.includes(item.contentType) || item.contentType === 'single_image') {
          const enrichment = (item.enrichmentData as Record<string, unknown> | null) ?? {};
          const editorScript = enrichment.editorScript as Record<string, unknown> | undefined;
          const sourceMediaSlots = enrichment.sourceMediaSlots as Record<string, unknown> | undefined;
          const editorStyle = enrichment.editorStyle as Record<string, unknown> | undefined;

          let slides: Array<{ url: string }> = [];
          let slideCopy: (string | null | undefined)[] = [];

          if (MULTI_SLIDE_IMAGE_KINDS.includes(item.contentType) && sourceMediaSlots?.slides && Array.isArray(sourceMediaSlots.slides)) {
            slides = sourceMediaSlots.slides.map((s: unknown) => {
              if (typeof s === 'string') {
                return { url: s };
              }
              if (s && typeof s === 'object') {
                return { url: (s as { url?: string }).url ?? '' };
              }
              return { url: '' };
            }).filter(s => s.url.length > 0);

            if (editorScript?.slideCopy && Array.isArray(editorScript.slideCopy)) {
              slideCopy = editorScript.slideCopy as (string | null | undefined)[];
            } else {
              const fallbackText = editorScript?.hookText as string || editorScript?.bodyText as string || null;
              slideCopy = slides.map(() => fallbackText);
            }
          } else if (item.contentType === 'single_image') {
            const bgUrl = sourceMediaSlots?.background && typeof sourceMediaSlots.background === 'object'
              ? (sourceMediaSlots.background as { url?: string }).url ?? ''
              : (item.graphicUrls as string[] | undefined)?.[0] ?? '';
            if (bgUrl) {
              slides = [{ url: bgUrl }];
            }
            slideCopy = [editorScript?.hookText as string || editorScript?.bodyText as string || null];
          }

          if (slides.length > 0) {
            console.log(`[Cron] Rendering ${slides.length} slide(s) with texts:`, JSON.stringify(slideCopy));

            // Enhance slide images before rendering
            const enhancedSlides = slides.map(s => ({ url: enhanceImage(s.url) }));

            const renderedUrls = await renderAllSlides(enhancedSlides, slideCopy, {
              aspectRatio: item.aspectRatio || '9:16',
              layout: (enrichment.editorLayout as string) || null,
              align: (editorStyle?.align as string) || null,
              backgroundDimming: (editorStyle?.backgroundDimming as number) ?? null,
              backgroundColor: (editorStyle?.backgroundColor as string) || null,
              fontSize: (editorStyle?.fontSize as number) || null,
              fontFamily: (editorStyle?.fontFamily as string) || null,
              color: (editorStyle?.color as string) || null,
              fontWeight: editorStyle?.weight === 'normal' ? 600 : (editorStyle?.weight ? 800 : null),
              italic: (editorStyle?.italic as boolean) ?? null,
              underline: (editorStyle?.underline as boolean) ?? null,
            });

            item.graphicUrls = renderedUrls as any;

            await db
              .update(contentItemSchema)
              .set({ graphicUrls: renderedUrls, updatedAt: new Date() })
              .where(eq(contentItemSchema.id, item.id));
          }
        }
        // ── End slide image rendering ───────────────────────────────────────

        // ── Compile-on-publish gate (cron) ─────────────────────────────────
        // Same logic as the user-triggered publish route, with retry
        // budget tracking (compileAttempts) and batch time budgeting.
        if (isVideoContentType(item.contentType) && item.contentType !== 'slideshow') {
          const enrichment = (item.enrichmentData as Record<string, unknown> | null) ?? {};

          if (!enrichment.isCompiled) {
            // Track retries — after 3 failed attempts, mark as failed so the
            // item stops churning every cron cycle.
            const attempts = (enrichment.compileAttempts as number) ?? 0;
            if (attempts >= 3) {
              await db
                .update(contentItemSchema)
                .set({
                  publishStatus: 'failed',
                  failureReason: 'compile-exhausted',
                  updatedAt: new Date(),
                } as any)
                .where(eq(contentItemSchema.id, item.id));

              results.push({ id: item.id, success: false, error: 'Video compile exhausted after 3 attempts' });
              continue;
            }

            // Budget check: defer if less than 60s remaining
            const batchElapsed = Date.now() - batchStartTime;
            const budgetRemaining = 300_000 - batchElapsed;
            if (budgetRemaining < 60_000) {
              console.log(`[Cron] Deferring item ${item.id} — only ${Math.round(budgetRemaining / 1000)}s budget remaining`);
              results.push({ id: item.id, success: false, error: 'Deferred — insufficient budget' });
              continue;
            }

            const reconstructed = reconstructRenderInput(
              item.enrichmentData as Record<string, unknown> | null | undefined,
              item.aspectRatio,
              item.contentType,
            );

            if (!reconstructed.ok) {
              console.warn(`[Cron] Cannot compile item ${item.id}: ${reconstructed.reason}`);
              // Increment attempts but don't exhaust — legacy item may need manual editor open
              await db
                .update(contentItemSchema)
                .set({
                  enrichmentData: {
                    ...enrichment,
                    compileAttempts: attempts + 1,
                    compileError: reconstructed.reason,
                  } as any,
                })
                .where(eq(contentItemSchema.id, item.id));
              continue;
            }

            let compiledUrl: string;
            try {
              compiledUrl = await renderEditorVideoServer(reconstructed.input, { abortMs: Math.min(240_000, budgetRemaining - 30_000) });
            } catch (compileErr) {
              const reason = compileErr instanceof RenderTimeoutError ? 'compile-timeout' : 'compile-failed';
              const message = compileErr instanceof Error ? compileErr.message : String(compileErr);
              console.warn(`[Cron] ${reason} for item ${item.id}: ${message}`);

              await db
                .update(contentItemSchema)
                .set({
                  enrichmentData: {
                    ...enrichment,
                    compileAttempts: attempts + 1,
                    compileError: message,
                  } as any,
                })
                .where(eq(contentItemSchema.id, item.id));

              // Do NOT mark as failed — let retries accumulate up to the 3-attempt limit
              continue;
            }

            // Persist the compiled URL
            await db
              .update(contentItemSchema)
              .set({
                graphicUrls: [compiledUrl],
                enrichmentData: {
                  ...enrichment,
                  isCompiled: true,
                  compiledAt: new Date().toISOString(),
                  compileAttempts: null,
                  compileError: null,
                } as any,
                updatedAt: new Date(),
              })
              .where(eq(contentItemSchema.id, item.id));

            // Update local reference so downstream reads the compiled URL
            item.graphicUrls = [compiledUrl] as any;
            item.enrichmentData = { ...enrichment, isCompiled: true } as any;
          }
        }
        // ── End compile gate ─────────────────────────────────────────────────

        const graphicUrls = (item.graphicUrls as string[]) || [];
        const platformCaptions = (item.platformSpecific as Record<string, unknown>) || {};

        // Account-level targeting, matching /api/content/[id]/publish. The
        // scheduler picks ONE account per platform for each post (cross-post
        // across platforms, rotate across a platform's pages) and records the
        // choice here. Without this the cron took `accounts.find(by platform)`
        // — the first active account — so choosing a specific page in the
        // campaign wizard had no effect on where the post actually landed.
        // Empty selection (legacy items, Blitz) keeps the old first-match
        // behaviour.
        const selectedAccountIds = (item.targetAccountIds as string[] | null) ?? [];

        // 3. Publish to each platform
        for (const platform of platforms) {
          let account = accounts.find(
            a => a.platform === platform
              && (selectedAccountIds.length === 0 || selectedAccountIds.includes(a.id)),
          );

          // Stale pinned-account recovery — same reasoning as the manual
          // publish route. `targetAccountIds` is a snapshot from campaign
          // build time; reconnecting an account mints a new social_account
          // row, so the pinned id dies while the platform stays connected.
          // TikTok is reconnected far more often than Meta (24h tokens), so
          // in practice this is what made scheduled campaign posts publish
          // everywhere except TikTok, with "No connected tiktok account".
          if (!account && selectedAccountIds.length > 0) {
            const fallback = accounts.find(a => a.platform === platform);
            if (fallback) {
              console.warn(
                `[Cron] Item ${item.id}: pinned ${platform} account(s) `
                + `[${selectedAccountIds.join(', ')}] no longer exist — falling back to `
                + `active ${platform} account ${fallback.id}.`,
              );
              account = fallback;
            }
          }

          if (!account) {
            platformResults.push({ platform, success: false, error: `No connected ${platform} account` });
            continue;
          }

          if (platform === 'twitter' && !account.accessToken) {
            platformResults.push({
              platform,
              success: false,
              error: 'X text connection missing. Please connect X (Text) in Connections.',
            });
            continue;
          }

          if (!account.accessToken && platform !== 'twitter') {
            platformResults.push({ platform, success: false, error: `${platform} access token missing` });
            continue;
          }

          // Resolve caption — guard against non-string values (e.g. youtube object)
          const platformCaption = platformCaptions[platform];
          const caption = (typeof platformCaption === 'string' && platformCaption.trim())
            ? platformCaption
            : item.caption;

          // ── Build merged platformSpecific ────────────────────────────────
          let mergedPlatformData: Record<string, unknown> = { ...platformCaptions };

          // TikTok: supply the account's saved defaults as the middle tier of
          // the settings hierarchy (campaign override → account default →
          // creator_info). Passed separately from the campaign's own config so
          // the resolver can tell an explicit choice from an inherited one.
          if (platform === 'tiktok') {
            const meta = (account.metadata ?? {}) as { tiktokDefaults?: Record<string, unknown> };
            if (meta.tiktokDefaults) {
              mergedPlatformData = {
                ...mergedPlatformData,
                tiktokAccountDefaults: meta.tiktokDefaults,
              };
            }
          }

          // WhatsApp: inject phoneNumberId from account metadata
          if (platform === 'whatsapp' && account.metadata) {
            const meta = account.metadata as { phoneNumberId?: string; wabaId?: string };
            if (meta.phoneNumberId) {
              mergedPlatformData = {
                ...mergedPlatformData,
                whatsapp: { phoneNumberId: meta.phoneNumberId, wabaId: meta.wabaId },
              };
            }
          }
          // ─────────────────────────────────────────────────────────────────

          const result = await publishToplatform(
            platform,
            account.accessToken!,
            account.platformUserId || '',
            caption,
            graphicUrls,
            account.refreshToken || undefined,
            async (newAccessToken: string, newRefreshToken: string) => {
              await db
                .update(socialAccountSchema)
                .set({
                  accessToken: newAccessToken,
                  refreshToken: newRefreshToken,
                  tokenExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
                })
                .where(eq(socialAccountSchema.id, account.id));
            },
            item.contentType,
            (account as any).oauthToken || undefined,
            (account as any).oauthTokenSecret || undefined,
            mergedPlatformData,
          );

          // accountName rides along so the notification email can say WHICH
          // account it posted to, not just the channel. An org with three
          // TikTok accounts got "published on tiktok" and had no way to tell
          // which one from the email alone.
          platformResults.push({
            platform,
            accountName: account.platformUsername || null,
            ...result,
          });

          // 4. Record in publishing queue
          await db.insert(publishingQueueSchema).values({
            contentItemId: item.id,
            socialAccountId: account.id,
            platform,
            scheduledFor: new Date(),
            status: result.success ? 'published' : 'failed',
            platformPostId: result.platformPostId || null,
            errorMessage: result.error || null,
            publishedAt: result.success ? new Date() : null,
          });
        }

        const someSucceeded = platformResults.some(r => r.success);

        // 5. Update content item status
        await db
          .update(contentItemSchema)
          .set({
            status: someSucceeded ? 'published' : 'approved',
            publishedAt: someSucceeded ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(eq(contentItemSchema.id, item.id));

        // 6. Email notification (non-blocking)
        if (someSucceeded) {
          const successPlatforms = platformResults
            .filter(r => r.success)
            .map(r => r.platform)
            .join(', ');

          Promise.all([getOrgAdminEmail(item.orgId), getOrgName(item.orgId)])
            .then(([email, orgName]) => {
              if (!email) {
                return;
              }
              return sendPublishedNotification(
                email,
                orgName,
                successPlatforms,
                item.caption,
                platformResults
                  .filter(r => r.success)
                  .map(r => ({
                    platform: r.platform,
                    accountName: r.accountName ?? null,
                    permalink: r.permalink ?? null,
                  })),
              );
            })
            .catch(err => console.error(`[Cron] Email notification failed for post ${item.id}:`, err));
        }

        // 7. Connect notifications
        if (someSucceeded) {
          const successPlatforms = platformResults
            .filter(r => r.success)
            .map(r => r.platform);

          void notifyPostPublished(
            item.orgId,
            successPlatforms[0] ?? 'platform',
            item.caption,
            item.id,
          );

          // In-app notification (navbar bell)
          void notifyPublishSucceeded(
            item.orgId,
            successPlatforms.join(', ') || 'platform',
            item.caption,
            item.id,
          );
        }

        const failedPlatforms = platformResults.filter(r => !r.success);
        for (const failed of failedPlatforms) {
          void notifyPostFailed(item.orgId, failed.platform, failed.error ?? 'Unknown error');
          void notifyPublishFailed(
            item.orgId,
            failed.platform,
            failed.error ?? 'Unknown error',
            item.id,
          );
        }

        // ── Webhook emission ────────────────────────────────────────────────
        // Fire ONE aggregate event per content item after the platform loop
        // resolves. The payload includes every attempted platform so receivers
        // can render per-platform status without a second API call.
        if (someSucceeded) {
          fireWebhook(item.orgId, 'content.published', {
            content: { id: item.id, object: 'content' as const },
            published_at: new Date().toISOString(),
            platforms: platformResults.map(r => ({
              platform: r.platform,
              success: r.success,
              platform_post_id: r.platformPostId ?? null,
              error: r.error ?? null,
            })),
          });
        } else {
          fireWebhook(item.orgId, 'content.publish_failed', {
            content: { id: item.id, object: 'content' as const },
            failed_at: new Date().toISOString(),
            platforms: platformResults.map(r => ({
              platform: r.platform,
              success: r.success,
              error: r.error ?? null,
            })),
          });
        }
        // ── End webhook emission ────────────────────────────────────────────

        results.push({ id: item.id, success: someSucceeded, platforms: platformResults });
        console.log(`[Cron] Post ${item.id}: ${someSucceeded ? 'published' : 'failed'}`);
      } catch (err) {
        console.error(`[Cron] Error publishing post ${item.id}:`, err);
        results.push({ id: item.id, success: false, error: String(err) });
      }
    }

    const succeeded = results.filter(r => r.success).length;

    return NextResponse.json({
      published: succeeded,
      failed: results.length - succeeded,
      results,
    });
  } catch (err) {
    console.error('[Cron] Scheduler error:', err);
    return NextResponse.json({ error: 'Scheduler failed' }, { status: 500 });
  }
}
