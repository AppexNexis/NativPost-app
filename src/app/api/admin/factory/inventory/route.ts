// Content Factory API — Inventory
// Provides detailed inventory status for Asset Supply vs Content Supply

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { mediaAssetSchema, contentTypeSchema } from '@/models/Schema';
import { eq, and, count, sql } from 'drizzle-orm';
import { getInventoryEngine } from '@/lib/content-engine/inventory/inventory-engine';
import { getDiversityEngine } from '@/lib/content-engine/inventory/diversity-engine';

// ─── Admin Guard ─────────────────────────────────────────────────────────────

const NATIVPOST_TEAM_ORG_ID = process.env.NEXT_PUBLIC_NATIVPOST_TEAM_ORG_ID;

async function requireAdmin() {
  const { userId, orgId, orgRole } = await auth();

  if (!userId || !orgId) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      orgId: null,
    };
  }

  if (orgId !== NATIVPOST_TEAM_ORG_ID || orgRole !== 'org:admin') {
    return {
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      orgId: null,
    };
  }

  return { error: null, orgId };
}

// ─── GET /api/admin/factory/inventory ────────────────────────────────────────

export async function GET() {
  const { error, orgId } = await requireAdmin();
  if (error) return error;

  try {
    const inventoryEngine = getInventoryEngine();
    const diversityEngine = getDiversityEngine();

    // 1. Asset Supply — raw validated assets by type
    const assetSupply = await db
      .select({
        assetType: mediaAssetSchema.assetType,
        count: count(),
      })
      .from(mediaAssetSchema)
      .where(
        and(
          eq(mediaAssetSchema.orgId, orgId!),
          eq(mediaAssetSchema.status, 'validated'),
        ),
      )
      .groupBy(mediaAssetSchema.assetType);

    const totalAssetSupply = assetSupply.reduce((sum, r) => sum + r.count, 0);

    // 2. Content Supply — constructed library content by type
    const contentTypes = await db
      .select()
      .from(contentTypeSchema)
      .where(eq(contentTypeSchema.isActive, true));

    const contentSupply = [];
    let totalContentSupply = 0;

    for (const ct of contentTypes) {
      // Count compositions of this type
      const compositionResult = await db
        .select({ count: count() })
        .from(mediaAssetSchema)
        .where(
          and(
            eq(mediaAssetSchema.orgId, orgId!),
            eq(mediaAssetSchema.status, 'validated'),
          ),
        );

      const compositionCount = compositionResult[0]?.count ?? 0;
      totalContentSupply += compositionCount;

      contentSupply.push({
        contentTypeId: ct.id,
        contentTypeName: ct.name,
        count: compositionCount,
        target: 1000, // Default target
        coverage: compositionCount / 1000,
      });
    }

    // 3. Inventory health
    const inventoryStatuses = await inventoryEngine.getInventoryStatus(orgId!);

    // 4. Diversity dimensions
    const diversityScore = await diversityEngine.calculateDiversityScore(orgId!);

    // 5. Freshness distribution
    const freshnessResult = await db
      .select({
        ageBucket: sql<string>`
          CASE
            WHEN EXTRACT(DAY FROM NOW() - ${mediaAssetSchema.createdAt}) < 30 THEN 'fresh'
            WHEN EXTRACT(DAY FROM NOW() - ${mediaAssetSchema.createdAt}) < 90 THEN 'mature'
            WHEN EXTRACT(DAY FROM NOW() - ${mediaAssetSchema.createdAt}) < 180 THEN 'aging'
            WHEN EXTRACT(DAY FROM NOW() - ${mediaAssetSchema.createdAt}) < 365 THEN 'stale'
            ELSE 'expired'
          END
        `,
        count: count(),
      })
      .from(mediaAssetSchema)
      .where(eq(mediaAssetSchema.orgId, orgId!))
      .groupBy(sql`ageBucket`);

    const freshnessDistribution = Object.fromEntries(
      freshnessResult.map(r => [r.ageBucket, r.count]),
    );

    // 6. Quality distribution
    const qualityResult = await db
      .select({
        qualityBucket: sql<string>`
          CASE
            WHEN ${mediaAssetSchema.qualityScore} >= 0.8 THEN 'excellent'
            WHEN ${mediaAssetSchema.qualityScore} >= 0.6 THEN 'good'
            WHEN ${mediaAssetSchema.qualityScore} >= 0.4 THEN 'fair'
            WHEN ${mediaAssetSchema.qualityScore} IS NOT NULL THEN 'poor'
            ELSE 'unrated'
          END
        `,
        count: count(),
      })
      .from(mediaAssetSchema)
      .where(eq(mediaAssetSchema.orgId, orgId!))
      .groupBy(sql`qualityBucket`);

    const qualityDistribution = Object.fromEntries(
      qualityResult.map(r => [r.qualityBucket, r.count]),
    );

    return NextResponse.json({
      assetSupply: {
        total: totalAssetSupply,
        byType: Object.fromEntries(assetSupply.map(r => [r.assetType, r.count])),
      },
      contentSupply: {
        total: totalContentSupply,
        byType: contentSupply,
      },
      inventoryHealth: inventoryStatuses.map(s => ({
        contentTypeId: s.contentTypeId,
        contentTypeName: s.contentTypeName,
        currentCount: s.currentCount,
        targetCount: s.targetCount,
        coverage: s.coverage,
        health: s.health,
        freshnessScore: s.freshnessScore,
        averageAge: s.averageAge,
      })),
      diversity: {
        overall: diversityScore.overall,
        byDimension: diversityScore.byDimension,
        imbalances: diversityScore.imbalances.slice(0, 10),
      },
      freshness: freshnessDistribution,
      quality: qualityDistribution,
    });
  } catch (err) {
    console.error('Inventory error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
