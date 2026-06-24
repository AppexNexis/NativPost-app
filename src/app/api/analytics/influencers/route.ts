import { eq, and, desc, gte } from 'drizzle-orm';
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
          engagementData: contentItemSchema.engagementData,
          contentType: contentItemSchema.contentType,
          publishedAt: contentItemSchema.publishedAt,
        })
        .from(contentItemSchema)
        .where(
          and(
            eq(contentItemSchema.orgId, orgId!),
            gte(contentItemSchema.createdAt, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)),
          ),
        )
      : [];

    const result = influencers.map((inf) => {
      // Match content items to this influencer via enrichmentData or a hypothetical match
      // In practice, you'd store influencerId on contentItem. For now, we aggregate all.
      const posts = contentItems.map((item) => {
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

      return {
        id: inf.id,
        name: inf.name,
        usageCount: inf.usageCount,
        avgEngagementRate,
        posts,
      };
    });

    return NextResponse.json({ influencers: result }, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch influencer analytics:', err);
    return NextResponse.json({ error: 'Failed to fetch influencer analytics' }, { status: 500 });
  }
}
