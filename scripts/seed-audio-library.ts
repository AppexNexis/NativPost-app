#!/usr/bin/env node
/**
 * Seed script: populate Cloudinary's `nativpost/audio/` folder with
 * royalty-free background music tracks.
 *
 * Sources (all CC0 / royalty-free):
 *   SoundHelix — https://www.soundhelix.com/audio-examples/
 *     Free background music in multiple genres. No attribution required.
 *
 * Usage:
 *   npx tsx scripts/seed-audio-library.ts
 *   npx tsx scripts/seed-audio-library.ts --limit=10
 *   npx tsx scripts/seed-audio-library.ts --dry-run   # preview only
 *
 * With env file:
 *   dotenv -c production -- npx tsx scripts/seed-audio-library.ts
 */

import { createHash } from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

// ── Curated track list ─────────────────────────────────────────────────────────
// SoundHelix tracks are CC0 — free for any use, including commercial, without
// attribution. Each file is a proper musical composition (not ambient video
// sound) in mp3 format.

interface TrackEntry {
  title: string;
  url: string;
  artist: string;
  tags: string[];
}

const TRACKS: TrackEntry[] = [
  // ── SoundHelix — instrumental / ambient / world ──
  { title: 'Bodmin Moor',      url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',  artist: 'SoundHelix', tags: ['instrumental', 'ambient', 'folk'] },
  { title: 'Delirium',         url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',  artist: 'SoundHelix', tags: ['instrumental', 'electronic', 'ambient'] },
  { title: 'Light Dance',      url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',  artist: 'SoundHelix', tags: ['instrumental', 'electronic', 'upbeat'] },
  { title: 'Nineties Inferno', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',  artist: 'SoundHelix', tags: ['instrumental', 'rock', 'energetic'] },
  { title: 'Witches Hat',      url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',  artist: 'SoundHelix', tags: ['instrumental', 'jazz', 'swing'] },
  { title: 'Cranbrook',        url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',  artist: 'SoundHelix', tags: ['instrumental', 'folk', 'acoustic'] },
  { title: 'Shifting Sand',    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',  artist: 'SoundHelix', tags: ['instrumental', 'ambient', 'world'] },
  { title: 'Moon Walker',      url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',  artist: 'SoundHelix', tags: ['instrumental', 'electronic', 'chill'] },
  { title: 'Arambol',          url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3',  artist: 'SoundHelix', tags: ['instrumental', 'world', 'acoustic'] },
  { title: 'Byzantine',        url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3', artist: 'SoundHelix', tags: ['instrumental', 'classical', 'ambient'] },
  { title: 'Summer Breeze',    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3', artist: 'SoundHelix', tags: ['instrumental', 'ambient', 'chill'] },
  { title: 'Horizon',          url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3', artist: 'SoundHelix', tags: ['instrumental', 'electronic', 'upbeat'] },
  { title: 'Flowing Water',    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3', artist: 'SoundHelix', tags: ['instrumental', 'ambient', 'nature'] },
  { title: 'Winter Night',     url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3', artist: 'SoundHelix', tags: ['instrumental', 'classical', 'ambient'] },
  { title: 'Mountain Path',    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3', artist: 'SoundHelix', tags: ['instrumental', 'folk', 'acoustic'] },
  { title: 'Starlight',        url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-16.mp3', artist: 'SoundHelix', tags: ['instrumental', 'electronic', 'ambient'] },
];

// ── CLI args ───────────────────────────────────────────────────────────────────

interface CliArgs {
  limit: number;
  concurrency: number;
  dryRun: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const getFlag = (name: string): string | undefined => {
    const found = args.find((a) => a.startsWith(`--${name}=`));
    return found ? found.split('=').slice(1).join('=') : undefined;
  };
  const hasFlag = (name: string): boolean => args.includes(`--${name}`);

  return {
    limit: Number(getFlag('limit') || TRACKS.length),
    concurrency: Number(getFlag('concurrency') || 8),
    dryRun: hasFlag('dry-run'),
  };
}

// ── Cloudinary config ──────────────────────────────────────────────────────────

function initCloudinary() {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    console.error(
      'Missing Cloudinary env vars. Make sure the following are set:\n' +
        '  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME\n' +
        '  NEXT_PUBLIC_CLOUDINARY_API_KEY\n' +
        '  CLOUDINARY_API_SECRET',
    );
    process.exit(1);
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

// ── Download + Upload ──────────────────────────────────────────────────────────

async function downloadFile(url: string, dest: string, signal?: AbortSignal): Promise<void> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buffer);
}

const RACE_TIMEOUT_MS = 90_000; // 90s per-track budget (download + upload)

async function uploadTrack(
  track: TrackEntry,
  tmpDir: string,
  dryRun: boolean,
): Promise<{ title: string; publicId: string; success: boolean }> {
  const title = `${track.title} - ${track.artist}`;
  const publicId = `sh-${createHash('md5').update(track.url).digest('hex').slice(0, 12)}`;

  if (dryRun) {
    console.log(`  ${title}`);
    return { title, publicId, success: true };
  }

  const tmpPath = join(tmpDir, `audio-${publicId}.mp3`);

  try {
    // Race the whole operation (download + upload) against a timeout so one
    // slow SoundHelix response doesn't stall the entire queue.
    await Promise.race([
      (async () => {
        console.log(`  ${title}`);
        await downloadFile(track.url, tmpPath);

        await cloudinary.uploader.upload(tmpPath, {
          resource_type: 'video',
          public_id: publicId,
          folder: 'nativpost/audio',
          overwrite: false,
          context: `title=${escapeContext(title)}`,
          tags: ['nativpost', 'background', ...track.tags],
        });
        console.log(`  ✓ ${title}`);
      })(),
      timeout(RACE_TIMEOUT_MS, `Timed out after ${RACE_TIMEOUT_MS / 1000}s`),
    ]);

    return { title, publicId, success: true };
  } catch (err: any) {
    if (err?.message?.includes?.('already exists') || err?.error?.message?.includes?.('already exists')) {
      console.log(`  − Already exists, skipped: ${title}`);
      return { title, publicId, success: true };
    }
    console.error(`  ✗ ${title} — ${err?.message || String(err)}`);
    return { title, publicId, success: false };
  } finally {
    try { await unlink(tmpPath); } catch { /* ignore */ }
  }
}

function timeout(ms: number, msg: string): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms));
}

function escapeContext(value: string): string {
  return value.replace(/[=|\\]/g, '\\$&');
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  initCloudinary();

  const tracks = TRACKS.slice(0, args.limit);
  if (tracks.length === 0) {
    console.log('No tracks to upload.');
    process.exit(0);
  }

  console.log(`\nSeeding ${tracks.length} background music tracks to Cloudinary\n`);

  if (args.dryRun) {
    console.log('── DRY RUN ──');
    for (const t of tracks) {
      console.log(`  ${t.title} - ${t.artist}  [${t.tags.join(', ')}]`);
    }
    console.log('── End dry run ──');
    process.exit(0);
  }

  const tmpDir = join(tmpdir(), 'nativpost-audio-seed');
  await mkdir(tmpDir, { recursive: true });

  let successCount = 0;
  let failCount = 0;
  const startTime = Date.now();

  // Run all tracks concurrently with concurrency limit
  const queue = [...tracks];
  const inFlight = new Set<Promise<void>>();

  while (queue.length > 0 || inFlight.size > 0) {
    while (inFlight.size < args.concurrency && queue.length > 0) {
      const track = queue.shift()!;
      const promise = (async () => {
        const result = await uploadTrack(track, tmpDir, args.dryRun);
        if (result.success) successCount++;
        else failCount++;
      })();
      inFlight.add(promise);
      promise.finally(() => inFlight.delete(promise));
    }

    if (inFlight.size > 0) {
      await Promise.race(inFlight);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n── Done in ${elapsed}s ──`);
  console.log(`  Synced: ${successCount}  Failed: ${failCount}`);
  console.log(`\nRefresh the editor's audio selector to see the tracks.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
