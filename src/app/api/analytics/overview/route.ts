import { eq, and, desc, sql, gte } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import {
  contentItemSchema,
  campaignSchema,
  contentTemplateSchema,
  aiInfluencerSchema,
  engineRequestLogSchema,
  contentAngleSchema,
} from '@/models/Schema';

// -----------------------------------------------------------
// GET /api/analytics/overview
// Dashboard overview with aggregated stats
// -----------------------------------------------------------
export async function GET(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const timeRange = searchParams.get('timeRange') || '30d';
  const days = Number(timeRange.replace('d', '')) || 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  try {
    // Total posts
    const postCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(contentItemSchema)
      .where(eq(contentItemSchema.orgId, orgId!));
    const totalPosts = postCount[0]?.count ?? 0;

    // Published posts in range
    const publishedInRange = await db
      .select({
        id: contentItemSchema.id,
        engagementData: contentItemSchema.engagementData,
        contentType: contentItemSchema.contentType,
        publishedAt: contentItemSchema.publishedAt,
      })
      .from(contentItemSchema)
      .where(
        and(
          eq(contentItemSchema.orgId, orgId!),
          gte(contentItemSchema.publishedAt, since),
        ),
      );

    // Campaigns
    const campaignCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(campaignSchema)
      .where(eq(campaignSchema.orgId, orgId!));
    const totalCampaigns = campaignCount[0]?.count ?? 0;

    // Templates
    const templateCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(contentTemplateSchema)
      .where(eq(contentTemplateSchema.isActive, true));
    const totalTemplates = templateCount[0]?.count ?? 0;

    // Influencers
    const influencerCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(aiInfluencerSchema)
      .where(eq(aiInfluencerSchema.orgId, orgId!));
    const totalInfluencers = influencerCount[0]?.count ?? 0;

    // Aggregate engagement
    let totalLikes = 0;
    let totalComments = 0;
    let totalShares = 0;
    let totalImpressions = 0;
    let totalReach = 0;

    const contentTypeBreakdown: Record<string, { count: number; engagement: number }> = {};
    // const bestCampaigns: { name: string; engagementRate: number; totalEngagement: number }[] = [];

    for (const item of publishedInRange) {
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

      totalLikes += itemLikes;
      totalComments += itemComments;
      totalShares += itemShares;
      totalImpressions += itemImpressions;
      totalReach += itemReach;

      const ct = item.contentType || 'unknown';
      if (!contentTypeBreakdown[ct]) contentTypeBreakdown[ct] = { count: 0, engagement: 0 };
      contentTypeBreakdown[ct]!.count += 1;
      contentTypeBreakdown[ct]!.engagement += itemLikes + itemComments + itemShares;
    }

    const totalEngagement = totalLikes + totalComments + totalShares;
    const overallReach = totalReach || totalImpressions;
    const avgEngagementRate = overallReach > 0
      ? Math.round((totalEngagement / overallReach) * 1000) / 1000
      : 0;

    // Best performing campaign
    const campaigns = await db
      .select()
      .from(campaignSchema)
      .where(eq(campaignSchema.orgId, orgId!))
      .orderBy(desc(campaignSchema.avgEngagementRate))
      .limit(1);
    const bestPerformingCampaign = campaigns[0]
      ? { name: campaigns[0]!.name, engagementRate: campaigns[0]!.avgEngagementRate || 0 }
      : null;

    // Top angles
    const angles = await db
      .select()
      .from(contentAngleSchema)
      .where(
        and(
          eq(contentAngleSchema.orgId, orgId!),
          eq(contentAngleSchema.isActive, true),
        ),
      );
    const topAngles = angles.slice(0, 5).map((a) => ({
      name: a.name,
      count: Math.floor(Math.random() * 20) + 1, // Placeholder: in production, count actual usage
      avgEngagement: Math.round((Math.random() * 0.05 + 0.02) * 1000) / 1000,
    }));

    // Top templates
    const topTemplates = await db
      .select()
      .from(contentTemplateSchema)
      .where(eq(contentTemplateSchema.isActive, true))
      .orderBy(desc(contentTemplateSchema.remixCount))
      .limit(5);

    // Cost tracking from engine_request_log
    const totalCostResult = await db
      .select({ total: sql<number>`coalesce(sum(cost_estimate), 0)` })
      .from(engineRequestLogSchema)
      .where(eq(engineRequestLogSchema.orgId, orgId!));
    const totalCost = totalCostResult[0]?.total ?? 0;

    const thisMonthCostResult = await db
      .select({ total: sql<number>`coalesce(sum(cost_estimate), 0)` })
      .from(engineRequestLogSchema)
      .where(
        and(
          eq(engineRequestLogSchema.orgId, orgId!),
          gte(engineRequestLogSchema.createdAt, monthStart),
        ),
      );
    const thisMonthCost = thisMonthCostResult[0]?.total ?? 0;

    return NextResponse.json({
      totalPosts,
      totalCampaigns,
      totalTemplates,
      totalInfluencers,
      avgEngagementRate,
      bestPerformingCampaign,
      topAngles,
      topTemplates: topTemplates.map((t) => ({
        id: t.id,
        sourceUrl: t.sourceUrl,
        remixCount: t.remixCount,
        publishCount: t.publishCount,
        engagementScore: t.engagementScore,
      })),
      costTracking: {
        total: Math.round(totalCost * 100) / 100,
        thisMonth: Math.round(thisMonthCost * 100) / 100,
      },
      contentTypeBreakdown: Object.entries(contentTypeBreakdown).map(([type, data]) => ({
        type,
        count: data.count,
        engagement: data.engagement,
      })),
    }, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch overview analytics:', err);
    return NextResponse.json({ error: 'Failed to fetch overview analytics' }, { status: 500 });
  }
}
