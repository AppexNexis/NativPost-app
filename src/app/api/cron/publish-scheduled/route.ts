import { and, eq, lte } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { db } from '@/libs/DB';
import { contentItemSchema } from '@/models/Schema';

// -----------------------------------------------------------
// GET /api/cron/publish-scheduled
//
// Publishes all posts where:
//   status = 'scheduled'  AND  scheduledFor <= now
//
// Called by Render Cron Job every minute.
// Protected by a secret key so only Render (or you) can trigger it.
//
// Render cron config (render.yaml):
//   - type: cron
//     name: nativpost-scheduler
//     schedule: "* * * * *"   ← every minute
//     command: "curl -X GET https://app.nativpost.com/api/cron/publish-scheduled -H 'Authorization: Bearer $CRON_SECRET'"
// -----------------------------------------------------------
export async function GET(request: NextRequest) {
  // Verify the cron secret so this endpoint can't be called publicly
  const authHeader = request.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[Cron] CRON_SECRET env var not set');
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();

  try {
    // Find all posts that are scheduled and due
    const duePosts = await db
      .select({
        id: contentItemSchema.id,
        orgId: contentItemSchema.orgId,
        targetPlatforms: contentItemSchema.targetPlatforms,
        scheduledFor: contentItemSchema.scheduledFor,
      })
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
    // eslint-disable-next-line no-console
    console.log(`[Cron] Found ${duePosts.length} post(s) due for publishing`);

    const results = [];

    for (const post of duePosts) {
      try {
        // Call the existing publish endpoint internally
        // We use the full URL from the request origin so it works in any environment
        const origin = new URL(request.url).origin;
        const publishRes = await fetch(`${origin}/api/content/${post.id}/publish`, {
          method: 'POST',
          headers: {
            // Pass org context via a special internal header
            // The publish route uses getAuthContext() which reads Clerk session —
            // for cron, we bypass auth by calling a direct DB publish instead.
            'x-internal-cron': cronSecret,
            'x-org-id': post.orgId,
          },
        });

        if (publishRes.ok) {
          const data = await publishRes.json();
          results.push({ id: post.id, success: true, results: data.results });
          // eslint-disable-next-line no-console
          console.log(`[Cron] Published post ${post.id}`);
        } else {
          const err = await publishRes.text();
          results.push({ id: post.id, success: false, error: err });

          console.error(`[Cron] Failed to publish post ${post.id}:`, err);
        }
      } catch (err) {
        results.push({ id: post.id, success: false, error: String(err) });

        console.error(`[Cron] Error publishing post ${post.id}:`, err);
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
