#!/usr/bin/env node
/**
 * Audit script: find published video posts that shipped wrong media.
 *
 * These are content items where graphicUrls[0] contains the raw source URL
 * (e.g. a Pexels/TikTok clip or a screenshot still frame) instead of the
 * compiled Remotion output, because publish-bypassed the editor compile step.
 *
 * This script is READ-ONLY. It prints a structured report so the user can
 * decide per-item whether to delete + re-upload via each platform's UI.
 *
 * Usage:
 *   dotenv -c production -- npx tsx scripts/audit-published-wrong-media.ts
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { desc, isNotNull } from 'drizzle-orm';
import { Pool } from 'pg';

import * as schema from '../src/models/Schema';
import { VIDEO_CONTENT_TYPES } from '../src/types/v2';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required. Run with: dotenv -c production -- npx tsx scripts/audit-published-wrong-media.ts');
  process.exit(1);
}

const VIDEO_TYPES = [...VIDEO_CONTENT_TYPES] as string[];

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  const db = drizzle(pool, { schema });

  try {
    // Fetch all published video content items
    const items = await db
      .select({
        id: schema.contentItemSchema.id,
        caption: schema.contentItemSchema.caption,
        contentType: schema.contentItemSchema.contentType,
        status: schema.contentItemSchema.status,
        publishedAt: schema.contentItemSchema.publishedAt,
        graphicUrls: schema.contentItemSchema.graphicUrls,
        enrichmentData: schema.contentItemSchema.enrichmentData,
      })
      .from(schema.contentItemSchema)
      .where(
        isNotNull(schema.contentItemSchema.publishedAt),
      )
      .orderBy(desc(schema.contentItemSchema.publishedAt));

    const affected: Array<Record<string, unknown>> = [];

    for (const item of items) {
      // Only video types
      if (!VIDEO_TYPES.includes(item.contentType ?? '')) continue;

      const enrichment = (item.enrichmentData ?? {}) as Record<string, unknown>;
      const isCompiled = enrichment.isCompiled === true;

      if (!isCompiled) {
        const platforms = (enrichment.publishedPlatforms as string[] | undefined) ?? [];
        const sourceMediaSlotBg = (enrichment as any).sourceMediaSlots?.background as string | undefined;

        affected.push({
          id: item.id,
          caption: item.caption,
          contentType: item.contentType,
          status: item.status,
          publishedAt: item.publishedAt?.toISOString() ?? null,
          graphicUrls: item.graphicUrls,
          platforms,
          sourceMediaSlotBackground: sourceMediaSlotBg ?? null,
        });
      }
    }

    // ── Summary ──────────────────────────────────────────────────────────
    console.log('\n=== Audit: Published video posts with wrong media ===\n');
    console.log(`Total video posts audited: ${items.length}`);
    console.log(`Affected (isCompiled != true): ${affected.length}\n`);

    if (affected.length === 0) {
      console.log('No affected posts found. All published video items have isCompiled=true.\n');
      return;
    }

    // Platform breakdown
    const platformCounts: Record<string, number> = {};
    for (const a of affected) {
      const plats = (a.platforms as string[]) ?? [];
      for (const p of plats) {
        platformCounts[p] = (platformCounts[p] ?? 0) + 1;
      }
    }

    console.log('By platform:');
    for (const [plat, count] of Object.entries(platformCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${plat}: ${count}`);
    }
    console.log();

    // Content type breakdown
    const typeCounts: Record<string, number> = {};
    for (const a of affected) {
      const ct = (a.contentType as string) ?? 'unknown';
      typeCounts[ct] = (typeCounts[ct] ?? 0) + 1;
    }

    console.log('By content type:');
    for (const [ct, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${ct}: ${count}`);
    }
    console.log();

    // Print each affected item as JSON
    console.log('Affected items (JSON):');
    console.log(JSON.stringify(affected, null, 2));
    console.log();

    console.log(`\nDone. ${affected.length} affected items found.`);
    console.log('To fix: delete + re-upload each post via the platform\'s native UI.');
    console.log('After backfill, set enrichmentData.isCompiled = true to clear from this audit.\n');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
