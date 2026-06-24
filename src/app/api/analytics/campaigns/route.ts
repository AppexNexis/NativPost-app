import { eq, and, desc, gte, inArray } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { campaignSchema, campaignContentSchema, contentItemSchema } from '@/models/Schema';

// -----------------------------------------------------------
// GET /api/analytics/campaigns
// Query: ?campaignId=... or ?orgId=...&timeRange=30d
// -----------------------------------------------------------
export async function GET(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get('campaignId');
  const timeRange = searchParams.get('timeRange') || '30d';

  const days = Number(timeRange.replace('d', '')) || 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const conditions = [eq(campaignSchema.orgId, orgId!)];
    if (campaignId) {
      conditions.push(eq(campaignSchema.id, campaignId));
    }

    const campaigns = await db
      .select()
      .from(campaignSchema)
      .where(and(...conditions))
      .orderBy(desc(campaignSchema.createdAt));

    const campaignIds = campaigns.map((c) => c.id);

    // Fetch campaign content items with engagement data
    const campaignContent = campaignIds.length > 0
      ? await db
        .select({
          campaignId: campaignContentSchema.campaignId,
          contentItemId: campaignContentSchema.contentItemId,
        })
        .from(campaignContentSchema)
        .where(inArray(campaignContentSchema.campaignId, campaignIds))
      : [];

    const contentItemIds = campaignContent.map((cc) => cc.contentItemId);

    const contentItems = contentItemIds.length > 0
      ? await db
        .select({
          id: contentItemSchema.id,
          engagementData: contentItemSchema.engagementData,
          contentType: contentItemSchema.contentType,
          publishedAt: contentItemSchema.publishedAt,
        })
        .from(contentItemSchema)
        .where(
          and(
            inArray(contentItemSchema.id, contentItemIds),
            gte(contentItemSchema.publishedAt, since),
          ),
        )
      : [];

    // Build result
    const result = campaigns.map((campaign) => {
      const items = campaignContent
        .filter((cc) => cc.campaignId === campaign.id)
        .map((cc) => contentItems.find((ci) => ci.id === cc.contentItemId))
        .filter(Boolean);

      const totalPosts = items.length;
      const publishedPosts = items.filter((i) => i?.publishedAt).length;

      let totalEngagement = 0;
      let totalImpressions = 0;
      let totalReach = 0;
      const angleStats: Record<string, { count: number; engagement: number }> = {};
      const contentTypeStats: Record<string, { count: number; engagement: number }> = {};
      const performanceOverTime: Record<string, { date: string; engagementRate: number; count: number }> = {};

      for (const item of items) {
        if (!item) continue;
        const eng = (item.engagementData as Record<string, any>) || {};
        let itemLikes = 0;
        let itemComments = 0;
        let itemShares = 0;
        let itemImpressions = 0;
        let itemReach = 0;

        for (const platform of Object.keys(eng)) {
          const metrics = eng[platform] || {};
          itemLikes += metrics.likes || 0;
          itemComments += metrics.comments || 0;
          itemShares += metrics.shares || metrics.retweets || 0;
          itemImpressions += metrics.impressions || 0;
          itemReach += metrics.reach || 0;
        }

        const engagement = itemLikes + itemComments + itemShares;
        totalEngagement += engagement;
        totalImpressions += itemImpressions;
        totalReach += itemReach;

        // Content type stats
        const ct = item.contentType || 'unknown';
        if (!contentTypeStats[ct]) contentTypeStats[ct] = { count: 0, engagement: 0 };
        contentTypeStats[ct]!.count += 1;
        contentTypeStats[ct]!.engagement += engagement;

        // Performance over time
        const date = item.publishedAt ? new Date(item.publishedAt).toISOString().split('T')[0] : null;
        if (date) {
          if (!performanceOverTime[date]) performanceOverTime[date] = { date, engagementRate: 0, count: 0 };
          performanceOverTime[date]!.count += 1;
          performanceOverTime[date]!.engagementRate += engagement;
        }
      }

      const avgEngagementRate = totalImpressions > 0
        ? Math.round((totalEngagement / totalImpressions) * 1000) / 1000
        : totalReach > 0
          ? Math.round((totalEngagement / totalReach) * 1000) / 1000
          : 0;

      // Best angle
      const bestAngle = Object.entries(angleStats)
        .sort((a, b) => b[1].engagement - a[1].engagement)[0];
      const bestAngleName = bestAngle ? bestAngle[0] : null;
      const bestAngleRate = bestAngle && totalImpressions > 0
        ? Math.round((bestAngle[1].engagement / totalImpressions) * 1000) / 1000
        : 0;

      // Best content type
      const bestContentType = Object.entries(contentTypeStats)
        .sort((a, b) => b[1].engagement - a[1].engagement)[0];
      const bestContentTypeName = bestContentType ? bestContentType[0] : null;
      const bestContentTypeRate = bestContentType && totalImpressions > 0
        ? Math.round((bestContentType[1].engagement / totalImpressions) * 1000) / 1000
        : 0;

      // Finalize performance over time
      const perfArray = Object.values(performanceOverTime).map((p) => ({
        date: p.date,
        engagementRate: p.count > 0 ? Math.round((p.engagementRate / p.count / (totalImpressions || 1)) * 1000) / 1000 : 0,
      })).sort((a, b) => a.date.localeCompare(b.date));

      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        totalPosts,
        publishedPosts,
        avgEngagementRate,
        bestAngle: bestAngleName ? { name: bestAngleName, engagementRate: bestAngleRate } : null,
        bestContentType: bestContentTypeName ? { type: bestContentTypeName, engagementRate: bestContentTypeRate } : null,
        performanceOverTime: perfArray,
      };
    });

    return NextResponse.json({ campaigns: result }, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch campaign analytics:', err);
    return NextResponse.json({ error: 'Failed to fetch campaign analytics' }, { status: 500 });
  }
}
