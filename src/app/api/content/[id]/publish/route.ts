import { clerkClient } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { sendPublishedNotification } from '@/lib/email';
import { publishToplatform } from '@/lib/social-publish';
import { getDb } from '@/libs/DB';
import { campaignContentSchema, campaignSchema, contentItemSchema, publishingQueueSchema, socialAccountSchema } from '@/models/Schema';
import { isVideoContentType } from '@/types/v2';
import { renderEditorVideoServer, RenderTimeoutError } from '@/lib/editor/render-editor-video-server';
import { reconstructRenderInput } from '@/lib/editor/reconstruct-render-input';

// Vercel Hobby cap; the compile step needs budget before publisher dispatch
export const maxDuration = 300;

type RouteParams = {
  params: Promise<{ id: string }>;
};

// -----------------------------------------------------------
// POST /api/content/[id]/publish
// -----------------------------------------------------------
export async function POST(request: NextRequest, { params }: RouteParams) {
  const db = await getDb();

  console.log({ request });
  const { error, orgId, userId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

  let requestBody: { tiktokSettings?: Record<string, unknown> } = {};
  try { requestBody = await request.json(); } catch { /* no body is fine */ }

  try {
    // 1. Fetch the content item
    const [item] = await db
      .select()
      .from(contentItemSchema)
      .where(and(eq(contentItemSchema.id, id), eq(contentItemSchema.orgId, orgId!)))
      .limit(1);

    if (!item) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
    }

    if (item.status !== 'approved' && item.status !== 'scheduled') {
      return NextResponse.json(
        { error: `Cannot publish content with status "${item.status}". Must be approved or scheduled.` },
        { status: 400 },
      );
    }

    // ── Compile-on-publish gate ─────────────────────────────────────────────
    // Video content items created outside the editor (Blitz, Campaigns, etc.)
    // carry raw source URLs in graphicUrls[0]. If enrichmentData.isCompiled is
    // not true, we render via the video engine before dispatching to platforms.
    if (isVideoContentType(item.contentType) && item.contentType !== 'slideshow') {
      const enrichment = (item.enrichmentData as Record<string, unknown> | null) ?? {};

      if (!enrichment.isCompiled) {
        // Check for an in-flight compile (within the last 5 minutes) to avoid
        // duplicating work on concurrent publish clicks.
        const compileInProgress = enrichment.compileInProgress as string | undefined;
        if (compileInProgress) {
          const fiveMinAgo = Date.now() - 5 * 60 * 1000;
          if (new Date(compileInProgress).getTime() > fiveMinAgo) {
            return NextResponse.json(
              { error: 'COMPILE_IN_PROGRESS', message: 'Video is already being compiled. Try again in a moment.' },
              { status: 409 },
            );
          }
        }

        // Mark in-progress so concurrent requests see it
        await db
          .update(contentItemSchema)
          .set({
            enrichmentData: {
              ...enrichment,
              compileInProgress: new Date().toISOString(),
            },
          } as any)
          .where(eq(contentItemSchema.id, id));

        const reconstructed = reconstructRenderInput(
          item.enrichmentData as Record<string, unknown> | null | undefined,
          item.aspectRatio,
          item.contentType,
        );

        if (!reconstructed.ok) {
          return NextResponse.json(
            { error: 'CANNOT_COMPILE', message: reconstructed.reason },
            { status: 400 },
          );
        }

        let compiledUrl: string;
        try {
          compiledUrl = await renderEditorVideoServer(reconstructed.input, { abortMs: 240_000 });
        } catch (compileErr) {
          // Clear the in-progress flag so the user can retry
          await db
            .update(contentItemSchema)
            .set({
              enrichmentData: {
                ...enrichment,
                compileInProgress: null,
              } as any,
            })
            .where(eq(contentItemSchema.id, id));

          if (compileErr instanceof RenderTimeoutError) {
            return NextResponse.json(
              { error: 'COMPILE_TIMEOUT', message: 'Video is still compiling. Retry in a moment.' },
              { status: 504 },
            );
          }
          return NextResponse.json(
            { error: 'COMPILE_FAILED', message: compileErr instanceof Error ? compileErr.message : String(compileErr) },
            { status: 500 },
          );
        }

        // Persist the compiled URL and flip the flag
        const updatedEnrichment = {
          ...enrichment,
          isCompiled: true,
          compiledAt: new Date().toISOString(),
          compileInProgress: null,
        };

        await db
          .update(contentItemSchema)
          .set({
            graphicUrls: [compiledUrl],
            enrichmentData: updatedEnrichment as any,
            updatedAt: new Date(),
          })
          .where(eq(contentItemSchema.id, id));

        // Re-read so downstream L153 uses the compiled URL
        // We update the local item object rather than a second SELECT
        item.graphicUrls = [compiledUrl] as any;
        item.enrichmentData = updatedEnrichment as any;
      }
    }
    // ── End compile gate ─────────────────────────────────────────────────────

    // 2. Get connected accounts
    const platforms = (item.targetPlatforms as string[]) || [];
    if (platforms.length === 0) {
      return NextResponse.json({ error: 'No target platforms specified' }, { status: 400 });
    }

    const accounts = await db
      .select()
      .from(socialAccountSchema)
      .where(and(eq(socialAccountSchema.orgId, orgId!), eq(socialAccountSchema.isActive, true)));

    // ── Blitz derive-on-read: filter disabled accounts ──────────────
    // For Blitz content, the user may have disabled specific accounts
    // via campaign.blitzDisabledAccountIds. We honor that here at
    // publish time so the effective account list mirrors what the UI
    // shows in the Blitz settings drawer. Disabled accounts are
    // silently skipped — they don't cause the post to fail.
    let effectiveAccounts = accounts;
    try {
      const [link] = await db
        .select({ campaignId: campaignContentSchema.campaignId })
        .from(campaignContentSchema)
        .where(eq(campaignContentSchema.contentItemId, id))
        .limit(1);
      if (link?.campaignId) {
        const [campaign] = await db
          .select({
            name: campaignSchema.name,
            blitzDisabledAccountIds: campaignSchema.blitzDisabledAccountIds,
          })
          .from(campaignSchema)
          .where(eq(campaignSchema.id, link.campaignId))
          .limit(1);
        if (campaign?.name === 'Today\'s Blitz') {
          const disabled = new Set(
            ((campaign.blitzDisabledAccountIds as string[] | null) ?? []),
          );
          effectiveAccounts = accounts.filter(a => !disabled.has(a.id));
        }
      }
    } catch (deriveErr) {
      console.warn('[publish] Blitz derive-on-read failed, falling back to raw accounts:', deriveErr);
    }

    const results: Array<{
      platform: string;
      success: boolean;
      platformPostId?: string;
      permalink?: string;
      error?: string;
    }> = [];

    // 3. Publish to each platform
    for (const platform of platforms) {
      const account = effectiveAccounts.find(a => a.platform === platform);

      if (!account) {
        // For Blitz posts, a missing account can mean the user disabled
        // it in the Blitz settings drawer after the post was scheduled.
        // We silently skip — per product decision, disabled accounts
        // must not mark a post as failed.
        const wasDisabledForBlitz = accounts.find(a => a.platform === platform) != null;
        if (wasDisabledForBlitz) {
          continue;
        }
        results.push({ platform, success: false, error: `No connected ${platform} account` });
        continue;
      }

      if (!account.accessToken) {
        results.push({ platform, success: false, error: `${platform} access token missing` });
        continue;
      }

      // Resolve caption
      const platformSpecificData = (item.platformSpecific as Record<string, unknown>) || {};
      const platformCaption = platformSpecificData[platform];
      const caption = (typeof platformCaption === 'string' && platformCaption.trim())
        ? platformCaption
        : item.caption;

      // ── Build merged platformSpecific ──────────────────────────────────────
      // Start with content-level data (YouTube title, TikTok settings, etc.)
      let mergedPlatformData: Record<string, unknown> = { ...platformSpecificData };

      // TikTok: inject user-confirmed settings from the publish modal
      if (platform === 'tiktok' && requestBody.tiktokSettings) {
        mergedPlatformData = { ...mergedPlatformData, tiktok: requestBody.tiktokSettings };
      }

      // WhatsApp: inject phoneNumberId from account metadata so the publisher
      // can identify which Cloud API number to send from
      if (platform === 'whatsapp' && account.metadata) {
        const meta = account.metadata as { phoneNumberId?: string; wabaId?: string };
        if (meta.phoneNumberId) {
          mergedPlatformData = {
            ...mergedPlatformData,
            whatsapp: { phoneNumberId: meta.phoneNumberId, wabaId: meta.wabaId },
          };
        }
      }
      // ──────────────────────────────────────────────────────────────────────

      const graphicUrls = (item.graphicUrls as string[]) || [];

      const result = await publishToplatform(
        platform,
        account.accessToken,
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
        account.platformUsername || undefined,
      );

      results.push({ platform, ...result });

      // 4. Record in publishing queue
      await db.insert(publishingQueueSchema).values({
        contentItemId: item.id,
        socialAccountId: account.id,
        platform,
        scheduledFor: new Date(),
        status: result.success ? 'published' : 'failed',
        platformPostId: result.platformPostId || null,
        permalink: result.permalink || null,
        errorMessage: result.error || null,
        publishedAt: result.success ? new Date() : null,
      });
    }

    // 5. Update content item status
    const someSucceeded = results.some(r => r.success);

    await db
      .update(contentItemSchema)
      .set({
        status: someSucceeded ? 'published' : 'approved',
        publishedAt: someSucceeded ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(contentItemSchema.id, id));

    // 6. Send email notification (non-blocking)
    if (someSucceeded) {
      const successPlatforms = results
        .filter(r => r.success)
        .map(r => r.platform)
        .join(', ');

      console.log({ successPlatforms, caption: item.caption });

      try {
        const clerk = await clerkClient();
        const [user, org] = await Promise.all([
          clerk.users.getUser(userId!),
          clerk.organizations.getOrganization({ organizationId: orgId! }),
        ]);
        const userEmail = user.emailAddresses[0]?.emailAddress;
        const orgName = org.name || orgId!;

        if (userEmail) {
          sendPublishedNotification(userEmail, orgName, successPlatforms, item.caption)
            .catch(err => console.error('[Email] sendPublishedNotification failed:', err));
        }
      } catch (emailErr) {
        console.error('[Email] Failed to send publish notification:', emailErr);
      }
    }

    return NextResponse.json({ published: someSucceeded, results });
  } catch (err) {
    console.error('Publish failed:', err);
    return NextResponse.json({ error: 'Publishing failed' }, { status: 500 });
  }
}