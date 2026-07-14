#!/usr/bin/env node
/**
 * Bootstrap script: generate 8 reference face images for each baseline (system)
 * influencer, then train a Flux-LoRA for face-locked consistency.
 *
 * Two-phase process:
 *   Phase 1 — Seed reference images: call /render/scene 8x per persona with
 *             varied seeds, collect Cloudinary URLs into referenceImageUrls.
 *   Phase 2 — Train LoRA: call /render/lora-train with the collected URLs,
 *             poll /render/lora-status every 60s until COMPLETED, save loraModelId.
 *   Phase 3 — Generate preview: call /render/lora-inference once to populate
 *             baseImageUrl with a fresh face-locked portrait.
 *
 * Usage:
 *   npx dotenv -c production -- npx tsx scripts/bootstrap-baseline-lora.ts
 *   npx dotenv -c production -- npx tsx scripts/bootstrap-baseline-lora.ts --dry-run
 *   npx dotenv -c production -- npx tsx scripts/bootstrap-baseline-lora.ts --limit 3
 *   npx dotenv -c production -- npx tsx scripts/bootstrap-baseline-lora.ts --concurrency 2
 *   npx dotenv -c production -- npx tsx scripts/bootstrap-baseline-lora.ts --phase 1  (images only)
 *   npx dotenv -c production -- npx tsx scripts/bootstrap-baseline-lora.ts --phase 2  (train only)
 *   npx dotenv -c production -- npx tsx scripts/bootstrap-baseline-lora.ts --skip-existing
 *
 * Env vars required:
 *   DATABASE_URL, NATIVPOST_IMAGE_URL, NATIVPOST_ENGINE_API_KEY
 */

import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { Pool as PgPool } from 'pg';

import { buildInfluencerPrompt } from '../src/lib/ai-influencers/build-prompt';
import { getDb } from '../src/libs/DB';
import { aiInfluencerSchema } from '../src/models/Schema';

// Separate short-lived pool for writes after long polling
function getWritePool(): PgPool {
  return new PgPool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 5_000,
  });
}

const IMAGE_ENGINE_URL = process.env.NATIVPOST_IMAGE_URL || 'http://localhost:4000';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

const REFERENCE_IMAGE_COUNT = 8;
const POLL_INTERVAL_MS = 60_000; // 60s between status polls
const MAX_TRAINING_WAIT_MS = 45 * 60_000; // 45 min per persona max
const DEFAULT_CONCURRENCY = 3;

function parseArgs(): {
  dryRun: boolean;
  limit: number;
  concurrency: number;
  phase: number;
  skipExisting: boolean;
} {
  const args = process.argv.slice(2);
  const getNum = (flag: string, fallback: number): number => {
    const idx = args.indexOf(flag);
    if (idx < 0) {
      return fallback;
    }
    return Number(args[idx + 1]!) || fallback;
  };
  return {
    dryRun: args.includes('--dry-run'),
    limit: getNum('--limit', 0),
    concurrency: getNum('--concurrency', DEFAULT_CONCURRENCY),
    phase: getNum('--phase', 0), // 0 = all phases
    skipExisting: args.includes('--skip-existing'),
  };
}

function sanitizeTriggerWord(name: string | null): string {
  if (!name) {
    return 'nativpost';
  }
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function generateReferenceImage(
  prompt: string,
  caption: string,
  seed: number,
): Promise<string> {
  const payload = {
    caption,
    scenePrompt: `${prompt} seed: ${seed}`,
    formats: ['square'],
    imageStyle: 'professional',
    overlayStyle: 'none',
    seed,
    brandName: 'NativPost',
    brandPrimary: '#864FFE',
    brandSecondary: '#0D0D0D',
    brandAccent: '#FFFFFF',
  };

  const res = await fetch(`${IMAGE_ENGINE_URL}/render/scene`, {
    method: 'POST',
    signal: AbortSignal.timeout(180_000),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ENGINE_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Scene gen failed HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json() as { square?: string | { url: string } };
  const raw = data.square;
  if (!raw) {
    throw new Error('Scene gen returned no image URL');
  }
  // /render/scene returns the full CloudinaryUploadResult object, not a bare URL
  return typeof raw === 'string' ? raw : raw.url;
}

async function generateReferenceImages(
  prompt: string,
  caption: string,
): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 0; i < REFERENCE_IMAGE_COUNT; i++) {
    const seed = i + 1;
    process.stdout.write(`  img ${i + 1}/${REFERENCE_IMAGE_COUNT} `);
    try {
      const url = await generateReferenceImage(prompt, caption, seed);
      urls.push(url);
      process.stdout.write('O');
    } catch (err) {
      process.stdout.write(`X(${String(err).slice(0, 30)})`);
    }
    process.stdout.write('\n');
    if (i < REFERENCE_IMAGE_COUNT - 1) {
      await sleep(750);
    }
  }
  return urls;
}

async function submitLoraTraining(
  refUrls: string[],
  triggerWord: string,
): Promise<string> {
  const res = await fetch(`${IMAGE_ENGINE_URL}/render/lora-train`, {
    method: 'POST',
    signal: AbortSignal.timeout(300_000),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ENGINE_API_KEY}`,
    },
    body: JSON.stringify({ referenceImageUrls: refUrls, triggerWord }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LoRA train failed HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const { requestId } = await res.json() as { requestId: string };
  return requestId;
}

async function pollLoraStatus(requestId: string): Promise<{ status: string; loraUrl?: string }> {
  const res = await fetch(
    `${IMAGE_ENGINE_URL}/render/lora-status?requestId=${encodeURIComponent(requestId)}`,
    {
      signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${ENGINE_API_KEY}` },
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Status poll failed HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json() as Promise<{ status: string; loraUrl?: string }>;
}

async function trainAndWait(requestId: string): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < MAX_TRAINING_WAIT_MS) {
    const { status, loraUrl } = await pollLoraStatus(requestId);
    const elapsed = Math.round((Date.now() - start) / 1000);
    process.stdout.write(`  ${status} (${elapsed}s) `);

    if (status === 'COMPLETED') {
      if (!loraUrl) {
        throw new Error('COMPLETED but no loraUrl returned');
      }
      return loraUrl;
    }
    if (status === 'FAILED') {
      throw new Error(`Training FAILED after ${elapsed}s`);
    }

    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Training timed out after ${MAX_TRAINING_WAIT_MS / 1000}s`);
}

async function generateFacePreview(
  loraUrl: string,
  triggerWord: string,
  prompt: string,
): Promise<string> {
  const res = await fetch(`${IMAGE_ENGINE_URL}/render/lora-inference`, {
    method: 'POST',
    signal: AbortSignal.timeout(180_000),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ENGINE_API_KEY}`,
    },
    body: JSON.stringify({ loraUrl, triggerWord, prompt, uploadToCloudinary: true }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Face preview failed HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const { imageUrl } = await res.json() as { imageUrl: string };
  return imageUrl;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { dryRun, limit, concurrency, phase, skipExisting } = parseArgs();

  console.log('[bootstrap-lora] Baseline Face-Lock Bootstrap');
  console.log('[bootstrap-lora] Dry run:    ', dryRun);
  console.log('[bootstrap-lora] Limit:      ', limit || 'none');
  console.log('[bootstrap-lora] Concurrency:', concurrency);
  console.log('[bootstrap-lora] Phase:      ', phase || 'all');
  console.log('[bootstrap-lora] Engine:     ', IMAGE_ENGINE_URL || '(unset!)');

  if (!IMAGE_ENGINE_URL || !ENGINE_API_KEY) {
    console.error('[bootstrap-lora] Missing NATIVPOST_IMAGE_URL or NATIVPOST_ENGINE_API_KEY');
    process.exit(1);
  }

  const db = await getDb();

  // Select targets: system rows needing image gen or LoRA training
  const whereClauses = [eq(aiInfluencerSchema.isSystem, true)];
  if (!skipExisting) {
    // Freshest: need both images AND training
    // Already have images but need training (phase 2 entrants)
    whereClauses.push(
      phase === 2
        ? isNotNull(aiInfluencerSchema.referenceImageUrls) // has images, needs training
        : isNull(aiInfluencerSchema.loraModelId), // needs the whole pipeline
    );
  } else {
    // Only those that haven't been started at all
    whereClauses.push(eq(aiInfluencerSchema.loraStatus, 'pending'));
  }

  const rows = await db
    .select()
    .from(aiInfluencerSchema)
    .where(and(...whereClauses))
    .orderBy(aiInfluencerSchema.name);

  const targets = limit > 0 ? rows.slice(0, limit) : rows;

  console.log(`[bootstrap-lora] Candidates: ${targets.length}\n`);

  if (targets.length === 0) {
    console.log('[bootstrap-lora] Nothing to do.');
    process.exit(0);
  }

  let completed = 0;
  let failed = 0;

  // Process in batches of concurrency
  for (let batchStart = 0; batchStart < targets.length; batchStart += concurrency) {
    const batch = targets.slice(batchStart, batchStart + concurrency);
    const batchLabel = `[batch ${Math.floor(batchStart / concurrency) + 1}/${Math.ceil(targets.length / concurrency)}]`;

    await Promise.all(batch.map(async (row) => {
      const label = `${row.name}`;
      console.log(`\n${batchLabel} ${label} ────────────────────────────────`);

      try {
        const triggerWord = sanitizeTriggerWord(row.name);
        const prompt = buildInfluencerPrompt({
          name: row.name,
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
        const caption = `${row.name} portrait, professional studio photography`;

        // Phase 1: Generate reference images
        if (phase === 0 || phase === 1) {
          console.log(`  Phase 1: Generating ${REFERENCE_IMAGE_COUNT} reference images...`);
          if (dryRun) {
            console.log('  (dry run) would generate reference images');
          } else {
            const refUrls = await generateReferenceImages(prompt, caption);
            if (refUrls.length < 5) {
              throw new Error(`Only generated ${refUrls.length}/${REFERENCE_IMAGE_COUNT} images, need at least 5`);
            }
            await db
              .update(aiInfluencerSchema)
              .set({ referenceImageUrls: refUrls, updatedAt: new Date() })
              .where(eq(aiInfluencerSchema.id, row.id));
            console.log(`  Phase 1 done: ${refUrls.length} reference images saved`);
          }
        }

        // Phase 2: Train LoRA
        if (phase === 0 || phase === 2) {
          // Re-read row to get fresh referenceImageUrls from phase 1
          const [fresh] = dryRun
            ? [row]
            : await db.select().from(aiInfluencerSchema).where(eq(aiInfluencerSchema.id, row.id)).limit(1);
          if (!fresh) {
            throw new Error('Row disappeared');
          }

          const refUrls = (fresh.referenceImageUrls as string[]) || [];

          console.log('  Phase 2: Submitting LoRA training...');
          if (dryRun) {
            console.log('  (dry run) would submit LoRA training');
          } else {
            if (refUrls.length < 5) {
              throw new Error(`Only ${refUrls.length} reference images available, need 5+`);
            }
            const requestId = await submitLoraTraining(refUrls, triggerWord);
            console.log(`  requestId: ${requestId}`);

            await db
              .update(aiInfluencerSchema)
              .set({ loraTrainingJobId: requestId, loraStatus: 'training', updatedAt: new Date() })
              .where(eq(aiInfluencerSchema.id, fresh.id));

            console.log('  Phase 2: Polling for completion...');
            const loraUrl = await trainAndWait(requestId);

            // Write via fresh pool — Drizzle pool may have expired during long poll
            const wp = getWritePool();
            await wp.query(
              `UPDATE ai_influencer SET lora_model_id=$1, lora_status='ready', updated_at=NOW() WHERE id=$2`,
              [loraUrl, fresh.id],
            );
            await wp.end();

            console.log(`  Phase 2 done: LoRA ready`);

            // Phase 3: Generate face preview via LoRA inference
            console.log('  Phase 3: Generating face-locked preview...');
            try {
              const previewUrl = await generateFacePreview(loraUrl, triggerWord, prompt);
              await db
                .update(aiInfluencerSchema)
                .set({ baseImageUrl: previewUrl, updatedAt: new Date() })
                .where(eq(aiInfluencerSchema.id, fresh.id));
              console.log(`  Phase 3 done: preview saved`);
            } catch (previewErr) {
              console.log(`  Phase 3 skipped: ${String(previewErr).slice(0, 100)}`);
            }
          }
        }

        completed++;
        console.log(`  SUCCESS`);
      } catch (err) {
        failed++;
        console.log(`  FAILED: ${String(err)}`);
      }
    }));

    if (batchStart + concurrency < targets.length) {
      await sleep(500);
    } // inter-batch pause
  }

  console.log(`\n[bootstrap-lora] Summary: completed=${completed} failed=${failed}`);
  if (dryRun) {
    console.log('[bootstrap-lora] (dry run — no changes committed)');
  }
  process.exit(failed > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error('[bootstrap-lora] Fatal:', err);
  process.exit(1);
});
