import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
// import { db } from '@/libs/DB';
import { getDb } from '@/libs/DB';
import { contentItemSchema, publishingQueueSchema, brandProfileSchema, socialAccountSchema } from '@/models/Schema';

// -----------------------------------------------------------
// GET /api/dashboard
// Returns all data needed for the dashboard in a single query.
// Replaces three separate /api/content calls on the old page.
// -----------------------------------------------------------
export async function GET(_request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  try {
    // Fetch all content items for this org in one query.
    // Archived items are excluded — they're leftover variants from an approval
    // decision, not something a user should see in recent activity or counts.
    const allItems = await db
      .select({
        id: contentItemSchema.id,
        caption: contentItemSchema.caption,
        status: contentItemSchema.status,
        targetPlatforms: contentItemSchema.targetPlatforms,
        contentType: contentItemSchema.contentType,
        scheduledFor: contentItemSchema.scheduledFor,
        publishedAt: contentItemSchema.publishedAt,
        createdAt: contentItemSchema.createdAt,
        engagementData: contentItemSchema.engagementData,
        antiSlopScore: contentItemSchema.antiSlopScore,
      })
      .from(contentItemSchema)
      .where(
        and(
          eq(contentItemSchema.orgId, orgId!),
          sql`${contentItemSchema.status} != 'archived'`,
        ),
      )
      .orderBy(desc(contentItemSchema.createdAt))
      .limit(200); // Enough for all meaningful stats

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const pending = allItems.filter(i => i.status === 'pending_review');
    const scheduled = allItems.filter(i => i.status === 'scheduled');
    const published = allItems.filter(i => i.status === 'published');
    const drafts = allItems.filter(i => i.status === 'draft');

    const publishedThisMonth = published.filter(
      i => i.publishedAt && new Date(i.publishedAt) >= startOfMonth,
    );

    // Recent activity feed — last 8 items across all statuses
    const recentActivity = allItems.slice(0, 8).map(item => ({
      id: item.id,
      caption: item.caption,
      status: item.status,
      targetPlatforms: item.targetPlatforms as string[],
      contentType: item.contentType,
      scheduledFor: item.scheduledFor?.toISOString() || null,
      publishedAt: item.publishedAt?.toISOString() || null,
      createdAt: item.createdAt.toISOString(),
    }));

    // Upcoming scheduled posts (next 5)
    const upcoming = scheduled
      .filter(i => i.scheduledFor)
      .sort((a, b) => new Date(a.scheduledFor!).getTime() - new Date(b.scheduledFor!).getTime())
      .slice(0, 5)
      .map(item => ({
        id: item.id,
        caption: item.caption,
        targetPlatforms: item.targetPlatforms as string[],
        contentType: item.contentType,
        scheduledFor: item.scheduledFor!.toISOString(),
      }));

    // Pending approvals — the primary action
    const pendingItems = pending.slice(0, 6).map(item => ({
      id: item.id,
      caption: item.caption,
      targetPlatforms: item.targetPlatforms as string[],
      contentType: item.contentType,
      createdAt: item.createdAt.toISOString(),
      antiSlopScore: item.antiSlopScore,
    }));

    // Recent failures from publishing queue
    const recentFailures = await db
      .select({
        contentItemId: publishingQueueSchema.contentItemId,
        platform: publishingQueueSchema.platform,
        errorMessage: publishingQueueSchema.errorMessage,
        createdAt: publishingQueueSchema.createdAt,
      })
      .from(publishingQueueSchema)
      .where(
        and(
          eq(publishingQueueSchema.status, 'failed'),
          gte(publishingQueueSchema.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
        ),
      )
      .orderBy(desc(publishingQueueSchema.createdAt))
      .limit(3);

    // ── Onboarding checklist ─────────────────────────────────────────────────
    // Derived live from real state rather than a separately-tracked progress
    // table — a step can never show "complete" while the underlying thing it
    // represents doesn't actually exist (e.g. brand profile deleted later).
    const [brandProfileRow] = await db
      .select({ id: brandProfileSchema.id })
      .from(brandProfileSchema)
      .where(eq(brandProfileSchema.orgId, orgId!))
      .limit(1);

    const [socialAccountRow] = await db
      .select({ id: socialAccountSchema.id })
      .from(socialAccountSchema)
      .where(
        and(
          eq(socialAccountSchema.orgId, orgId!),
          eq(socialAccountSchema.isActive, true),
        ),
      )
      .limit(1);

    const hasFirstPost = scheduled.length > 0 || published.length > 0;

    const onboarding = {
      steps: [
        { id: 'brand_profile', label: 'Set up your brand profile', completed: !!brandProfileRow },
        { id: 'connect_account', label: 'Connect a social account', completed: !!socialAccountRow },
        { id: 'first_post', label: 'Schedule or publish your first post', completed: hasFirstPost },
      ],
      isComplete: !!brandProfileRow && !!socialAccountRow && hasFirstPost,
    };
    // ── End onboarding checklist ──────────────────────────────────────────────

    return NextResponse.json({
      stats: {
        pendingApprovals: pending.length,
        scheduledPosts: scheduled.length,
        publishedThisMonth: publishedThisMonth.length,
        totalPublished: published.length,
        drafts: drafts.length,
      },
      pendingItems,
      upcoming,
      recentActivity,
      onboarding,
      recentFailures: recentFailures.map(f => ({
        contentItemId: f.contentItemId,
        platform: f.platform,
        errorMessage: f.errorMessage,
        createdAt: f.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error('[Dashboard] Failed:', err);
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 });
  }
}
