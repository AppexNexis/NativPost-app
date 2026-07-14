#!/usr/bin/env node
/**
 * Backfill script: generate base_image_url for baseline influencer rows that
 * are missing a preview face.
 *
 * Targets is_system=true rows (Library tab) with base_image_url IS NULL.
 * Calls the NativPost image engine at NATIVPOST_IMAGE_URL/render/scene,
 * stores the returned Cloudinary URL to ai_influencer.base_image_url.
 *
 * Usage:
 *   npx dotenv -c production -- npx tsx scripts/backfill-influencer-images.ts
 *   npx dotenv -c production -- npx tsx scripts/backfill-influencer-images.ts --dry-run
 *   npx dotenv -c production -- npx tsx scripts/backfill-influencer-images.ts --limit 5
 *   npx dotenv -c production -- npx tsx scripts/backfill-influencer-images.ts --force   # regenerate even if already set
 *
 * Env vars required:
 *   DATABASE_URL              (via dotenv target)
 *   NATIVPOST_IMAGE_URL       (e.g. https://image.nativpost.com)
 *   NATIVPOST_ENGINE_API_KEY
 */

import { and, eq, isNull } from 'drizzle-orm';

import { buildInfluencerCaption, buildInfluencerPrompt, type InfluencerTraits } from '../src/lib/ai-influencers/build-prompt';
import { getDb } from '../src/libs/DB';
import { aiInfluencerSchema } from '../src/models/Schema';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force');
const LIMIT_ARG = args.find(a => a.startsWith('--limit'));
const LIMIT = LIMIT_ARG
  ? Number.parseInt(LIMIT_ARG.split('=')[1] || args[args.indexOf(LIMIT_ARG) + 1] || '0', 10)
  : 0;

const IMAGE_ENGINE_URL = process.env.NATIVPOST_IMAGE_URL || '';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

const DELAY_MS = 750; // gentle pacing between engine calls

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function generateFace(traits: InfluencerTraits): Promise<string> {
  const payload = {
    caption: buildInfluencerCaption(traits),
    scenePrompt: buildInfluencerPrompt(traits),
    formats: ['square'],
    imageStyle: 'professional',
    overlayStyle: 'none',
    brandName: 'NativPost',
    brandPrimary: '#864FFE',
    brandSecondary: '#0D0D0D',
    brandAccent: '#FFFFFF',
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);

  try {
    const res = await fetch(`${IMAGE_ENGINE_URL}/render/scene`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ENGINE_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Engine ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json() as { square?: string; vertical?: string };
    const url = data.square || data.vertical;
    if (!url) {
      throw new Error('Engine returned no image URL');
    }
    return url;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function main() {
  console.log('[backfill] Baseline Influencer Face Images');
  console.log('[backfill] Dry run:', DRY_RUN);
  console.log('[backfill] Force:  ', FORCE);
  console.log('[backfill] Limit:  ', LIMIT || 'none');
  console.log('[backfill] Engine: ', IMAGE_ENGINE_URL || '(unset!)');

  if (!IMAGE_ENGINE_URL || !ENGINE_API_KEY) {
    console.error('[backfill] Missing NATIVPOST_IMAGE_URL or NATIVPOST_ENGINE_API_KEY');
    process.exit(1);
  }

  const db = await getDb();

  const rows = await db
    .select()
    .from(aiInfluencerSchema)
    .where(
      FORCE
        ? eq(aiInfluencerSchema.isSystem, true)
        : and(eq(aiInfluencerSchema.isSystem, true), isNull(aiInfluencerSchema.baseImageUrl)),
    );

  const targets = LIMIT > 0 ? rows.slice(0, LIMIT) : rows;

  console.log(`[backfill] Candidates: ${targets.length}\n`);

  let ok = 0;
  let failed = 0;
  const failures: Array<{ name: string; error: string }> = [];

  for (let i = 0; i < targets.length; i++) {
    const row = targets[i]!;
    const label = `[${i + 1}/${targets.length}] ${row.name}`;

    if (DRY_RUN) {
      console.log(`${label}  -> would generate face`);
      continue;
    }

    try {
      const started = Date.now();
      const imageUrl = await generateFace({
        name: row.name,
        description: row.description,
        gender: row.gender,
        ageRange: row.ageRange,
        ethnicity: row.ethnicity,
        hairStyle: row.hairStyle,
        hairColor: row.hairColor,
        bodyType: row.bodyType,
        fashionStyle: row.fashionStyle,
        poseStyle: row.poseStyle,
        backgroundPreference: row.backgroundPreference,
      });

      await db
        .update(aiInfluencerSchema)
        .set({ baseImageUrl: imageUrl })
        .where(eq(aiInfluencerSchema.id, row.id));

      const took = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`${label}  OK  (${took}s)  ${imageUrl.slice(0, 80)}...`);
      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${label}  FAIL  ${msg}`);
      failures.push({ name: row.name, error: msg });
      failed++;
    }

    if (i < targets.length - 1) await sleep(DELAY_MS);
  }

  console.log('\n[backfill] Summary:');
  console.log(`[backfill]   generated: ${ok}`);
  console.log(`[backfill]   failed:    ${failed}`);
  if (failures.length > 0) {
    console.log('\n[backfill] Failures:');
    for (const f of failures) console.log(`[backfill]   - ${f.name}: ${f.error}`);
  }
  console.log(DRY_RUN ? '\n[backfill] (dry run — no changes committed)' : '\n[backfill] Done.');
  process.exit(failed > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error('[backfill] Fatal:', err);
  process.exit(1);
});
