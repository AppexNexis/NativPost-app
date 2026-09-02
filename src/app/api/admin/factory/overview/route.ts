// Content Factory API — Overview
// Provides dashboard metrics for the command center

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import {
  mediaAssetSchema,
  contentTypeSchema,
  generationJobSchema,
} from '@/models/Schema';
import { eq, and, count } from 'drizzle-orm';
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

// ─── GET /api/admin/factory/overview ─────────────────────────────────────────

export async function GET() {
  const { error, orgId } = await requireAdmin();
  if (error) return error;

  try {
    // 1. Asset counts by type
    const assetCounts = await db
      .select({
        assetType: mediaAssetSchema.assetType,
        count: count(),
      })
      .from(mediaAssetSchema)
      .where(eq(mediaAssetSchema.orgId, orgId!))
      .groupBy(mediaAssetSchema.assetType);

    const totalAssets = assetCounts.reduce((sum, r) => sum + r.count, 0);

    // 2. Quality pass rate
    const qualityResult = await db
      .select({
        count: count(),
      })
      .from(mediaAssetSchema)
      .where(
        and(
          eq(mediaAssetSchema.orgId, orgId!),
          eq(mediaAssetSchema.status, 'validated'),
        ),
      );

    const validatedCount = qualityResult[0]?.count ?? 0;
    const qualityPassRate = totalAssets > 0 ? validatedCount / totalAssets : 0;

    // 3. Quarantined assets
    const quarantinedResult = await db
      .select({ count: count() })
      .from(mediaAssetSchema)
      .where(
        and(
          eq(mediaAssetSchema.orgId, orgId!),
          eq(mediaAssetSchema.status, 'quarantined'),
        ),
      );

    const quarantinedCount = quarantinedResult[0]?.count ?? 0;

    // 4. Generation jobs status
    const jobStatuses = await db
      .select({
        status: generationJobSchema.status,
        count: count(),
      })
      .from(generationJobSchema)
      .where(eq(generationJobSchema.orgId, orgId!))
      .groupBy(generationJobSchema.status);

    const generationStats = {
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };

    for (const row of jobStatuses) {
      if (row.status === 'queued' || row.status === 'planned') generationStats.queued += row.count;
      else if (row.status === 'processing' || row.status === 'submitted') generationStats.processing += row.count;
      else if (row.status === 'completed') generationStats.completed += row.count;
      else if (row.status === 'failed') generationStats.failed += row.count;
    }

    // 5. Inventory coverage
    const inventoryEngine = getInventoryEngine();
    const inventoryStatuses = await inventoryEngine.getInventoryStatus(orgId!);
    const averageCoverage = inventoryStatuses.length > 0
      ? inventoryStatuses.reduce((sum, s) => sum + s.coverage, 0) / inventoryStatuses.length
      : 0;

    // 6. Diversity score
    const diversityEngine = getDiversityEngine();
    const diversityScore = await diversityEngine.calculateDiversityScore(orgId!);

    // 7. Duplicate rate (sample-based)
    const sampleAssets = await db
      .select({
        id: mediaAssetSchema.id,
        fileHash: mediaAssetSchema.fileHash,
        perceptualHash: mediaAssetSchema.perceptualHash,
      })
      .from(mediaAssetSchema)
      .where(eq(mediaAssetSchema.orgId, orgId!))
      .limit(1000);

    // Simple hash-based duplicate detection
    const hashMap = new Map<string, number>();
    for (const asset of sampleAssets) {
      const hash = asset.perceptualHash ?? asset.fileHash;
      if (hash) {
        hashMap.set(hash, (hashMap.get(hash) ?? 0) + 1);
      }
    }

    let duplicateCount = 0;
    for (const count of hashMap.values()) {
      if (count > 1) duplicateCount += count - 1;
    }

    const duplicateRate = sampleAssets.length > 0
      ? duplicateCount / sampleAssets.length
      : 0;

    // 8. Content types summary
    const contentTypes = await db
      .select()
      .from(contentTypeSchema)
      .where(eq(contentTypeSchema.isActive, true));

    return NextResponse.json({
      overview: {
        totalAssets,
        assetsByType: Object.fromEntries(assetCounts.map(r => [r.assetType, r.count])),
        qualityPassRate,
        quarantinedCount,
        duplicateRate,
        diversityScore: diversityScore.overall,
        averageCoverage,
      },
      generation: generationStats,
      inventory: inventoryStatuses.map(s => ({
        contentTypeId: s.contentTypeId,
        contentTypeName: s.contentTypeName,
        currentCount: s.currentCount,
        targetCount: s.targetCount,
        coverage: s.coverage,
        health: s.health,
      })),
      contentTypes: contentTypes.map(ct => ({
        id: ct.id,
        name: ct.name,
        minAssets: ct.minAssets,
        maxAssets: ct.maxAssets,
      })),
    });
  } catch (err) {
    console.error('Factory overview error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
