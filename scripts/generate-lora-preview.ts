#!/usr/bin/env node
/**
 * Generate a face-locked preview for a single influencer using LoRA.
 * Purely raw PG + raw fetch — no Drizzle/Next.js dependencies.
 *
 * Usage:
 *   $env:DATABASE_URL = "..."
 *   npx dotenv -c production -- npx tsx scripts/generate-lora-preview.ts 6fd61b9f-32d8-4a7b-9b22-cb7639e513a4
 */

import { Pool as PgPool } from 'pg';

const IMAGE_ENGINE_URL = process.env.NATIVPOST_IMAGE_URL || 'http://localhost:4000';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

const id = process.argv[2];
if (!id) { console.error('Usage: npx tsx scripts/generate-lora-preview.ts <influencer-id>'); process.exit(1); }

function slug(name: string | null): string {
  if (!name) return 'nativpost';
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
}

async function main() {
  const pool = new PgPool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 10_000,
  });

  // Read influencer
  const { rows } = await pool.query(
    `SELECT id, name, gender, age_range, ethnicity, hair_style, hair_color, body_type, fashion_style, pose_style, background_preference,
            lora_status, lora_model_id, base_image_url
     FROM ai_influencer WHERE id = $1 LIMIT 1`,
    [id],
  );

  if (rows.length === 0) { console.error('Not found:', id); pool.end(); process.exit(1); }

  const row = rows[0]!;

  if (row.lora_status !== 'ready' || !row.lora_model_id) {
    console.error(`LoRA not ready. Status: ${row.lora_status}, modelId: ${row.lora_model_id}`);
    pool.end();
    process.exit(1);
  }

  console.log(`Generating face for "${row.name}" via LoRA inference...`);

  // Build prompt from traits
  const traits: string[] = ['A photorealistic portrait photograph of the same person'];
  if (row.gender) traits.push(row.gender);
  if (row.age_range) traits.push(`aged ${row.age_range}`);
  if (row.ethnicity) traits.push(`of ${row.ethnicity} ethnicity`);
  if (row.body_type) traits.push(`with a ${row.body_type} build`);
  if (row.hair_color && row.hair_style) traits.push(`${row.hair_color} ${row.hair_style}`);
  else if (row.hair_color || row.hair_style) traits.push(row.hair_style || row.hair_color || '');
  if (row.fashion_style) traits.push(`wearing ${row.fashion_style}`);
  if (row.pose_style) traits.push(`in a ${row.pose_style} pose`);
  if (row.background_preference) traits.push(`with a ${row.background_preference} background`);
  traits.push('Front-facing, clear face, professional photography, neutral background, no text, no watermarks');
  const prompt = traits.filter(Boolean).join('. ');

  const trigger = slug(row.name);

  const res = await fetch(`${IMAGE_ENGINE_URL}/render/lora-inference`, {
    method: 'POST',
    signal: AbortSignal.timeout(180_000),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ENGINE_API_KEY}`,
    },
    body: JSON.stringify({ loraUrl: row.lora_model_id, triggerWord: trigger, prompt, uploadToCloudinary: true }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('Engine error:', res.status, text.slice(0, 300));
    pool.end();
    process.exit(1);
  }

  const { imageUrl, seed, generationMs } = await res.json() as { imageUrl: string; seed: number; generationMs: number };
  console.log(`Generated in ${generationMs}ms (seed ${seed})`);
  console.log(`URL: ${imageUrl}`);

  await pool.query(`UPDATE ai_influencer SET base_image_url=$1, updated_at=NOW() WHERE id=$2`, [imageUrl, id]);
  console.log('Saved to DB.');

  pool.end();
  process.exit(0);
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
