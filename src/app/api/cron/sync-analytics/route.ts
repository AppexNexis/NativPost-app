import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { db } from '@/libs/DB';
import {
  contentItemSchema,
  publishingQueueSchema,
  socialAccountSchema,
} from '@/models/Schema';

// -----------------------------------------------------------
// GET /api/cron/sync-analytics
//
// For every published content item that has a platformPostId
// in the publishing queue, fetches current engagement metrics
// from each platform API and writes them back to
// contentItemSchema.engagementData as:
//
// {
//   "linkedin": { likes, comments, shares, impressions },
//   "youtube":  { views, likes, comments, avgViewDuration },
//   "instagram": { impressions, reach, likes, comments, saves },
//   "twitter":  { impressions, likes, retweets, replies },
//   "facebook": { impressions, likes, comments, shares },
// }
//
// Called by GitHub Actions every 6 hours.
// Protected by CRON_SECRET. No Clerk session required.
// -----------------------------------------------------------
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[Analytics Sync] CRON_SECRET env var not set');
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log(`[Analytics Sync] Starting at ${new Date().toISOString()}`);

  try {
    // 1. Find all published queue entries that have a platformPostId
    const publishedQueue = await db
      .select({
        contentItemId: publishingQueueSchema.contentItemId,
        platform: publishingQueueSchema.platform,
        platformPostId: publishingQueueSchema.platformPostId,
        socialAccountId: publishingQueueSchema.socialAccountId,
      })
      .from(publishingQueueSchema)
      .where(
        and(
          eq(publishingQueueSchema.status, 'published'),
          isNotNull(publishingQueueSchema.platformPostId),
        ),
      );

    if (publishedQueue.length === 0) {
      return NextResponse.json({ synced: 0, message: 'No published posts with platform IDs' });
    }

    // 2. Get unique content item IDs and load their current engagement data
    const contentItemIds = [...new Set(publishedQueue.map(q => q.contentItemId))];

    const contentItems = await db
      .select({
        id: contentItemSchema.id,
        orgId: contentItemSchema.orgId,
        engagementData: contentItemSchema.engagementData,
      })
      .from(contentItemSchema)
      .where(inArray(contentItemSchema.id, contentItemIds));

    const contentMap = new Map(contentItems.map(c => [c.id, c]));

    // 3. Get social accounts for token lookup
    const socialAccountIds = [...new Set(publishedQueue.map(q => q.socialAccountId))];
    const accounts = await db
      .select({
        id: socialAccountSchema.id,
        platform: socialAccountSchema.platform,
        platformUserId: socialAccountSchema.platformUserId,
        accessToken: socialAccountSchema.accessToken,
        refreshToken: socialAccountSchema.refreshToken,
      })
      .from(socialAccountSchema)
      .where(inArray(socialAccountSchema.id, socialAccountIds));

    const accountMap = new Map(accounts.map(a => [a.id, a]));

    // 4. Fetch metrics for each queue entry and merge into content item engagement data
    // Group queue entries by content item so we can write one DB update per content item
    const engagementUpdates = new Map<string, Record<string, unknown>>();

    for (const entry of publishedQueue) {
      const account = accountMap.get(entry.socialAccountId);
      const contentItem = contentMap.get(entry.contentItemId);

      if (!account?.accessToken || !entry.platformPostId || !contentItem) {
        continue;
      }

      const existing = engagementUpdates.get(entry.contentItemId)
        || (contentItem.engagementData as Record<string, unknown> || {});

      const metrics = await fetchPlatformMetrics(
        entry.platform,
        entry.platformPostId,
        account.accessToken,
        account.platformUserId || '',
      );

      if (metrics) {
        existing[entry.platform] = metrics;
        engagementUpdates.set(entry.contentItemId, existing);
        console.log(`[Analytics Sync] ${entry.platform} post ${entry.platformPostId}: fetched metrics`);
      }
    }

    // 5. Write all updates to the DB
    let synced = 0;
    for (const [contentItemId, engagementData] of engagementUpdates.entries()) {
      await db
        .update(contentItemSchema)
        .set({ engagementData, updatedAt: new Date() })
        .where(eq(contentItemSchema.id, contentItemId));
      synced++;
    }

    console.log(`[Analytics Sync] Done. Synced ${synced} content items.`);
    return NextResponse.json({
      synced,
      queueEntriesProcessed: publishedQueue.length,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Analytics Sync] Error:', err);
    return NextResponse.json({ error: 'Analytics sync failed' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// Platform metric fetchers
// Each returns a normalized metrics object or null on failure.
// -----------------------------------------------------------

type Metrics = Record<string, number>;

async function fetchPlatformMetrics(
  platform: string,
  postId: string,
  accessToken: string,
  platformUserId: string,
): Promise<Metrics | null> {
  try {
    console.log(`[Analytics Sync] Fetching ${platform} metrics for post ${postId} (user ${platformUserId})`);
    switch (platform) {
      case 'linkedin':
        return fetchLinkedInMetrics(postId, accessToken);
      case 'youtube':
        return fetchYouTubeMetrics(postId, accessToken);
      case 'instagram':
        return fetchInstagramMetrics(postId, accessToken);
      case 'twitter':
        return fetchTwitterMetrics(postId, accessToken);
      case 'facebook':
        return fetchFacebookMetrics(postId, accessToken);
      default:
        return null;
    }
  } catch (err) {
    console.error(`[Analytics Sync] Failed to fetch ${platform} metrics for ${postId}:`, err);
    return null;
  }
}

async function fetchLinkedInMetrics(postUrn: string, accessToken: string): Promise<Metrics | null> {
  // LinkedIn Social Metadata API
  const encodedUrn = encodeURIComponent(postUrn);
  const res = await fetch(
    `https://api.linkedin.com/v2/socialMetadata/${encodedUrn}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
    },
  );

  if (!res.ok) {
    // Fallback: try the UGC post stats endpoint
    const statsRes = await fetch(
      `https://api.linkedin.com/v2/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodedUrn}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      },
    );
    if (!statsRes.ok) {
      return null;
    }
    const statsData = await statsRes.json();
    const stats = statsData.elements?.[0]?.totalShareStatistics;
    if (!stats) {
      return null;
    }
    return {
      likes: stats.likeCount || 0,
      comments: stats.commentCount || 0,
      shares: stats.shareCount || 0,
      impressions: stats.impressionCount || 0,
      clicks: stats.clickCount || 0,
    };
  }

  const data = await res.json();
  return {
    likes: data.likesSummary?.totalLikes || 0,
    comments: data.commentsSummary?.totalFirstLevelComments || 0,
    shares: data.sharesSummary?.totalShares || 0,
    impressions: data.impressionCount || 0,
  };
}

async function fetchYouTubeMetrics(videoId: string, accessToken: string): Promise<Metrics | null> {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!res.ok) {
    return null;
  }
  const data = await res.json();
  const stats = data.items?.[0]?.statistics;
  if (!stats) {
    return null;
  }

  return {
    views: Number.parseInt(stats.viewCount || '0', 10),
    likes: Number.parseInt(stats.likeCount || '0', 10),
    comments: Number.parseInt(stats.commentCount || '0', 10),
    favorites: Number.parseInt(stats.favoriteCount || '0', 10),
  };
}

async function fetchInstagramMetrics(mediaId: string, accessToken: string): Promise<Metrics | null> {
  const metrics = 'impressions,reach,likes,comments,shares,saved';
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${mediaId}/insights?metric=${metrics}&access_token=${accessToken}`,
  );

  if (!res.ok) {
    return null;
  }
  const data = await res.json();
  if (!data.data) {
    return null;
  }

  const result: Metrics = {};
  for (const metric of data.data) {
    result[metric.name] = metric.values?.[0]?.value || 0;
  }
  return result;
}

async function fetchTwitterMetrics(tweetId: string, accessToken: string): Promise<Metrics | null> {
  const res = await fetch(
    `https://api.x.com/2/tweets/${tweetId}?tweet.fields=public_metrics`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!res.ok) {
    return null;
  }
  const data = await res.json();
  const metrics = data.data?.public_metrics;
  if (!metrics) {
    return null;
  }

  return {
    impressions: metrics.impression_count || 0,
    likes: metrics.like_count || 0,
    retweets: metrics.retweet_count || 0,
    replies: metrics.reply_count || 0,
    bookmarks: metrics.bookmark_count || 0,
  };
}

async function fetchFacebookMetrics(postId: string, accessToken: string): Promise<Metrics | null> {
  const metrics = 'post_impressions,post_impressions_unique,post_reactions_like_total,post_comments,post_shares';
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${postId}/insights?metric=${metrics}&access_token=${accessToken}`,
  );

  if (!res.ok) {
    return null;
  }
  const data = await res.json();
  if (!data.data) {
    return null;
  }

  const result: Metrics = {};
  for (const metric of data.data) {
    const key = metric.name
      .replace('post_impressions_unique', 'reach')
      .replace('post_impressions', 'impressions')
      .replace('post_reactions_like_total', 'likes')
      .replace('post_comments', 'comments')
      .replace('post_shares', 'shares');
    result[key] = metric.values?.[0]?.value || 0;
  }
  return result;
}
