import { and, eq, lte } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { sendPublishedNotification } from '@/lib/email';
import { publishToplatform } from '@/lib/social-publish';
import { fireWebhook } from '@/lib/webhook-dispatcher';
import { getDb } from '@/libs/DB';
import {
  contentItemSchema,
  publishingQueueSchema,
  socialAccountSchema,
} from '@/models/Schema';
import { notifyPostFailed, notifyPostPublished } from '@/lib/notify-connect';
import { isVideoContentType } from '@/types/v2';
import { renderEditorVideoServer, RenderTimeoutError } from '@/lib/editor/render-editor-video-server';
import { reconstructRenderInput } from '@/lib/editor/reconstruct-render-input';
import { renderAllSlides } from '@/lib/editor/render-slide-image';

// Vercel Hobby cap; compile step for each video post needs budget
export const maxDuration = 300;

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || '';

async function getOrgAdminEmail(orgId: string): Promise<string | null> {
  if (!CLERK_SECRET_KEY) return null;
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
    if (!res.ok) return null;
    const data = await res.json();
    const memberships: any[] = data.data ?? data ?? [];
    const admin = memberships.find(m => m.role === 'org:admin') ?? memberships[0];
    if (!admin?.public_user_data?.user_id) return null;

    const userRes = await fetch(
      `https://api.clerk.com/v1/users/${admin.public_user_data.user_id}`,
      { headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` } },
    );
    if (!userRes.ok) return null;
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
        }> = [];

        // ── Slideshow / single_image: render slides via image-engine ──────
        if (item.contentType === 'slideshow' || item.contentType === 'single_image') {
          const enrichment = (item.enrichmentData as Record<string, unknown> | null) ?? {};
          const editorScript = enrichment.editorScript as Record<string, unknown> | undefined;
          const sourceMediaSlots = enrichment.sourceMediaSlots as Record<string, unknown> | undefined;
          const editorStyle = enrichment.editorStyle as Record<string, unknown> | undefined;

          let slides: Array<{ url: string }> = [];
          let slideCopy: (string | null | undefined)[] = [];

          if (item.contentType === 'slideshow' && sourceMediaSlots?.slides && Array.isArray(sourceMediaSlots.slides)) {
            slides = sourceMediaSlots.slides.map((s: unknown) => {
              if (typeof s === 'string') return { url: s };
              if (s && typeof s === 'object') return { url: (s as { url?: string }).url ?? '' };
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
            if (bgUrl) slides = [{ url: bgUrl }];
            slideCopy = [editorScript?.hookText as string || editorScript?.bodyText as string || null];
          }

          if (slides.length > 0) {
            console.log(`[Cron] Rendering ${slides.length} slide(s) with texts:`, JSON.stringify(slideCopy));

            const renderedUrls = await renderAllSlides(slides, slideCopy, {
              aspectRatio: item.aspectRatio || '9:16',
              layout: (enrichment.editorLayout as string) || null,
              align: (editorStyle?.align as string) || null,
              backgroundDimming: (editorStyle?.backgroundDimming as number) ?? null,
              backgroundColor: (editorStyle?.backgroundColor as string) || null,
              fontSize: (editorStyle?.fontSize as number) || null,
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

        // 3. Publish to each platform
        for (const platform of platforms) {
          const account = accounts.find(a => a.platform === platform);

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

          platformResults.push({ platform, ...result });

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

          getOrgAdminEmail(item.orgId)
            .then((email) => {
              if (!email) return;
              return sendPublishedNotification(email, item.orgId, successPlatforms, item.caption);
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
        }

        const failedPlatforms = platformResults.filter(r => !r.success);
        for (const failed of failedPlatforms) {
          void notifyPostFailed(item.orgId, failed.platform, failed.error ?? 'Unknown error');
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