import { eq, and, desc, gte, inArray } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { aiInfluencerSchema, contentItemSchema } from '@/models/Schema';

// -----------------------------------------------------------
// GET /api/analytics/influencers
// Returns AI influencer analytics with engagement data
// -----------------------------------------------------------
export async function GET(_request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  try {
    const influencers = await db
      .select()
      .from(aiInfluencerSchema)
      .where(eq(aiInfluencerSchema.orgId, orgId!))
      .orderBy(desc(aiInfluencerSchema.usageCount));

    // Get content items that reference these influencers
    const influencerIds = influencers.map((inf) => inf.id);
    const contentItems = influencerIds.length > 0
      ? await db
        .select({
          id: contentItemSchema.id,
          influencerId: contentItemSchema.influencerId,
          engagementData: contentItemSchema.engagementData,
          contentType: contentItemSchema.contentType,
          publishedAt: contentItemSchema.publishedAt,
        })
        .from(contentItemSchema)
        .where(
          and(
            eq(contentItemSchema.orgId, orgId!),
            inArray(contentItemSchema.influencerId, influencerIds),
            gte(contentItemSchema.createdAt, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)),
          ),
        )
      : [];

    const result = influencers.map((inf) => {
      // Filter content items to only those referencing this influencer.
      const influencerItems = contentItems.filter((item) => item.influencerId === inf.id);
      const posts = influencerItems.map((item) => {
        const eng = (item.engagementData as Record<string, any>) || {};
        let likes = 0;
        let comments = 0;
        let shares = 0;
        let impressions = 0;

        for (const platform of Object.keys(eng)) {
          const metrics = eng[platform] || {};
          likes += metrics.likes || 0;
          comments += metrics.comments || 0;
          shares += metrics.shares || metrics.retweets || 0;
          impressions += metrics.impressions || 0;
        }

        const totalEngagement = likes + comments + shares;
        const engagementRate = impressions > 0 ? totalEngagement / impressions : 0;

        return {
          contentItemId: item.id,
          engagementRate: Math.round(engagementRate * 1000) / 1000,
          contentType: item.contentType,
          publishedAt: item.publishedAt,
        };
      }).filter((p) => p.engagementRate > 0);

      const avgEngagementRate = posts.length > 0
        ? Math.round((posts.reduce((sum, p) => sum + p.engagementRate, 0) / posts.length) * 1000) / 1000
        : 0;

      // Compute total engagement across all posts
      let totalEngagement = 0;
      const platformCounts: Record<string, number> = {};
      for (const p of influencerItems) {
        const eng = (p.engagementData as Record<string, any>) || {};
        for (const platform of Object.keys(eng)) {
          const metrics = eng[platform] || {};
          const postEng = (metrics.likes || 0) + (metrics.comments || 0) + (metrics.shares || metrics.retweets || 0);
          totalEngagement += postEng;
          platformCounts[platform] = (platformCounts[platform] || 0) + postEng;
        }
      }
      let topPlatform = '—';
      let topCount = 0;
      for (const [p, c] of Object.entries(platformCounts)) {
        if (c > topCount) { topPlatform = p; topCount = c; }
      }

      return {
        id: inf.id,
        name: inf.name,
        usageCount: inf.usageCount,
        avgEngagementRate,
        totalPosts: influencerItems.length,
        totalEngagement,
        topPlatform,
        posts,
      };
    });

    return NextResponse.json({ influencers: result }, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch influencer analytics:', err);
    return NextResponse.json({ error: 'Failed to fetch influencer analytics' }, { status: 500 });
  }
}
