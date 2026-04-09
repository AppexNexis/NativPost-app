import { and, desc, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { db } from '@/libs/DB';
import { contentItemSchema, publishingQueueSchema } from '@/models/Schema';

// -----------------------------------------------------------
// GET /api/analytics
// Returns aggregated analytics for the current org.
// Joins published content with publishing queue to surface
// per-platform engagement data and post-level stats.
// -----------------------------------------------------------
export async function GET(_request: NextRequest) {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  try {
    // 1. Fetch all published content items for this org
    const publishedItems = await db
      .select({
        id: contentItemSchema.id,
        caption: contentItemSchema.caption,
        contentType: contentItemSchema.contentType,
        targetPlatforms: contentItemSchema.targetPlatforms,
        engagementData: contentItemSchema.engagementData,
        publishedAt: contentItemSchema.publishedAt,
        antiSlopScore: contentItemSchema.antiSlopScore,
        graphicUrls: contentItemSchema.graphicUrls,
        updatedAt: contentItemSchema.updatedAt,
      })
      .from(contentItemSchema)
      .where(
        and(
          eq(contentItemSchema.orgId, orgId!),
          eq(contentItemSchema.status, 'published'),
        ),
      )
      .orderBy(desc(contentItemSchema.publishedAt));

    // 2. Fetch publishing queue entries for these items
    // (gives us platformPostId and per-platform publish status)
    const queueEntries = publishedItems.length > 0
      ? await db
        .select({
          contentItemId: publishingQueueSchema.contentItemId,
          platform: publishingQueueSchema.platform,
          platformPostId: publishingQueueSchema.platformPostId,
          status: publishingQueueSchema.status,
          publishedAt: publishingQueueSchema.publishedAt,
        })
        .from(publishingQueueSchema)
        .where(eq(publishingQueueSchema.status, 'published'))
      : [];

    // Group queue entries by content item
    const queueByItem = new Map<string, typeof queueEntries>();
    for (const entry of queueEntries) {
      const existing = queueByItem.get(entry.contentItemId) || [];
      existing.push(entry);
      queueByItem.set(entry.contentItemId, existing);
    }

    // 3. Find the most recent sync timestamp
    // (the most recently updated published item that has engagement data)
    let lastSyncedAt: string | null = null;
    for (const item of publishedItems) {
      const eng = item.engagementData as Record<string, unknown> || {};
      if (Object.keys(eng).length > 0) {
        lastSyncedAt = item.updatedAt.toISOString();
        break;
      }
    }

    // 4. Aggregate totals and build per-post data
    const platformTotals: Record<string, {
      posts: number;
      likes: number;
      comments: number;
      shares: number;
      impressions: number;
      reach: number;
      views: number;
    }> = {};

    let totalLikes = 0;
    let totalComments = 0;
    let totalShares = 0;
    let totalImpressions = 0;
    let totalReach = 0;
    let totalViews = 0;

    const posts = publishedItems.map((item) => {
      const eng = item.engagementData as Record<string, Record<string, number>> || {};
      const platforms = item.targetPlatforms as string[] || [];
      const queueItems = queueByItem.get(item.id) || [];

      // Per-platform metrics for this post
      const platformMetrics: Record<string, Record<string, number>> = {};
      let postLikes = 0;
      let postComments = 0;
      let postShares = 0;
      let postImpressions = 0;
      let postReach = 0;
      let postViews = 0;

      for (const platform of platforms) {
        const metrics = eng[platform] || {};

        // Count posts per platform
        if (!platformTotals[platform]) {
          platformTotals[platform] = { posts: 0, likes: 0, comments: 0, shares: 0, impressions: 0, reach: 0, views: 0 };
        }
        platformTotals[platform]!.posts += 1;

        const likes = metrics.likes || 0;
        const comments = metrics.comments || 0;
        const shares = metrics.shares || metrics.retweets || 0;
        const impressions = metrics.impressions || 0;
        const reach = metrics.reach || 0;
        const views = metrics.views || 0;

        platformTotals[platform]!.likes += likes;
        platformTotals[platform]!.comments += comments;
        platformTotals[platform]!.shares += shares;
        platformTotals[platform]!.impressions += impressions;
        platformTotals[platform]!.reach += reach;
        platformTotals[platform]!.views += views;

        postLikes += likes;
        postComments += comments;
        postShares += shares;
        postImpressions += impressions;
        postReach += reach;
        postViews += views;

        platformMetrics[platform] = metrics;
      }

      totalLikes += postLikes;
      totalComments += postComments;
      totalShares += postShares;
      totalImpressions += postImpressions;
      totalReach += postReach;
      totalViews += postViews;

      const totalEngagement = postLikes + postComments + postShares;
      const engagementRate = postImpressions > 0
        ? (totalEngagement / postImpressions) * 100
        : postReach > 0
          ? (totalEngagement / postReach) * 100
          : 0;

      return {
        id: item.id,
        caption: item.caption,
        contentType: item.contentType,
        platforms,
        platformMetrics,
        publishedAt: item.publishedAt?.toISOString() || null,
        antiSlopScore: item.antiSlopScore,
        hasEngagementData: Object.keys(eng).length > 0,
        // Queue info (for knowing if data exists per platform)
        publishedPlatforms: queueItems
          .filter(q => q.platformPostId)
          .map(q => q.platform),
        totals: {
          likes: postLikes,
          comments: postComments,
          shares: postShares,
          impressions: postImpressions,
          reach: postReach,
          views: postViews,
          engagement: totalEngagement,
          engagementRate: Math.round(engagementRate * 10) / 10,
        },
      };
    });

    // 5. Sort top posts by total engagement
    const topPosts = [...posts]
      .sort((a, b) => b.totals.engagement - a.totals.engagement)
      .slice(0, 5);

    // 6. Overall engagement rate
    const totalEngagement = totalLikes + totalComments + totalShares;
    const overallReach = totalReach || totalImpressions;
    const avgEngagementRate = overallReach > 0
      ? Math.round((totalEngagement / overallReach) * 1000) / 10
      : 0;

    return NextResponse.json({
      summary: {
        totalPublished: publishedItems.length,
        totalLikes,
        totalComments,
        totalShares,
        totalImpressions,
        totalReach,
        totalViews,
        totalEngagement,
        avgEngagementRate,
      },
      platformTotals,
      posts,
      topPosts,
      lastSyncedAt,
    });
  } catch (err) {
    console.error('[Analytics] Failed:', err);
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 });
  }
}
