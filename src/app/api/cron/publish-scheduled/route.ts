import { and, eq, lte } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { sendPublishedNotification } from '@/lib/email';
import { publishToplatform } from '@/lib/social-publish';
// import { db } from '@/libs/DB';
import { getDb } from '@/libs/DB';
import {
  contentItemSchema,
  publishingQueueSchema,
  socialAccountSchema,
} from '@/models/Schema';

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || '';

/**
 * Fetch the admin email for an org via the Clerk Backend API.
 * Used in cron context where there is no active Clerk session.
 */
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
    // Prefer org:admin role; fall back to first member
    const admin = memberships.find(m => m.role === 'org:admin') ?? memberships[0];
    if (!admin?.public_user_data?.user_id) {
      return null;
    }

    const userRes = await fetch(
      `https://api.clerk.com/v1/users/${admin.public_user_data.user_id}`,
      {
        headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` },
      },
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
//
// Publishes all posts where status='scheduled' AND scheduledFor <= now
// Called by GitHub Actions every 5 minutes.
// Protected by CRON_SECRET header.
//
// IMPORTANT: This route publishes directly via DB — no Clerk session needed.
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

        const graphicUrls = (item.graphicUrls as string[]) || [];
        const platformCaptions = (item.platformSpecific as Record<string, string>) || {};

        // 3. Publish to each platform
        for (const platform of platforms) {
          const account = accounts.find(a => a.platform === platform);

          if (!account?.accessToken) {
            platformResults.push({
              platform,
              success: false,
              error: `No connected ${platform} account`,
            });
            continue;
          }

          const caption = platformCaptions[platform] || item.caption;

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

        // 6. Send published email notification (non-blocking)
        if (someSucceeded) {
          const successPlatforms = platformResults
            .filter(r => r.success)
            .map(r => r.platform)
            .join(', ');

          getOrgAdminEmail(item.orgId)
            .then((email) => {
              if (!email) {
                return;
              }
              return sendPublishedNotification(
                email,
                item.orgId,
                successPlatforms,
                item.caption,
              );
            })
            .catch(err => console.error(`[Cron] Email notification failed for post ${item.id}:`, err));
        }

        results.push({
          id: item.id,
          success: someSucceeded,
          platforms: platformResults,
        });

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
