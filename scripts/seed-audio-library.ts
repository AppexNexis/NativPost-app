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
 * ── Growing the library without touching this file ─────────────────────────
 * The editor reads whatever is in Cloudinary's `nativpost/audio/` folder, so
 * the catalogue scales by adding FILES, not code. Two ingestion modes:
 *
 *   --from-dir=<path>       Upload every audio file in a local folder. This is
 *                           how you add licensed tracks you already hold
 *                           rights to (Epidemic Sound, Artlist, Uppbeat…).
 *
 *   --manifest=<file.json>  Upload from a JSON array of
 *                           { title, url, artist?, tags? } entries.
 *
 * Both paths run the same verification as the built-in list: a URL that is not
 * reachable audio is REFUSED rather than uploaded, so the picker can never
 * show a track that plays silence.
 *
 * With env file:
 *   dotenv -c production -- npx tsx scripts/seed-audio-library.ts
 */

import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import { mkdir, open, readdir, readFile, stat, unlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { basename, extname, join, resolve } from 'path';

// ── Curated track list ─────────────────────────────────────────────────────────
// SoundHelix tracks are CC0 — free for any use, including commercial, without
// attribution. Each file is a proper musical composition (not ambient video
// sound) in mp3 format.

interface TrackEntry {
  title: string;
  /** Remote source. Empty for --from-dir entries, which carry localPath. */
  url: string;
  artist: string;
  tags: string[];
  /** Set by --from-dir: upload this file instead of downloading a URL. */
  localPath?: string;
  /**
   * public_id prefix — 'sh' builtin SoundHelix, 'mf' manifest, 'uf' --from-dir.
   * Keeps re-runs idempotent (same file → same public_id → overwrite:false
   * skips) and tells the two ingestion modes apart in the Cloudinary console.
   * Optional: built-in TRACKS entries omit it (main() stamps 'sh'); uploadTrack
   * falls back to 'sh' so the type contract doesn't force the 16 literals to
   * repeat it.
   */
  idPrefix?: string;
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
  /** Ingest every audio file in this local folder. */
  fromDir?: string;
  /** Ingest from a JSON array of { title, url, artist?, tags? }. */
  manifest?: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const getFlag = (name: string): string | undefined => {
    const found = args.find((a) => a.startsWith(`--${name}=`));
    return found ? found.split('=').slice(1).join('=') : undefined;
  };
  const hasFlag = (name: string): boolean => args.includes(`--${name}`);

  return {
    // Default limit is "everything". TRACKS.length would silently cap a
    // 50-file --from-dir or --manifest run at the built-in catalogue size.
    limit: Number(getFlag('limit') || Number.POSITIVE_INFINITY),
    concurrency: Number(getFlag('concurrency') || 8),
    dryRun: hasFlag('dry-run'),
    fromDir: getFlag('from-dir'),
    manifest: getFlag('manifest'),
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

// ── Audio verification (verification-first, not HTTP-200-first) ───────────────
// A source that responds 200 with an HTML error page (or a redirect to a
// login wall) must be REFUSED, not uploaded — the picker can never show a
// track that plays silence. Magic-byte sniffing catches wrong content; a
// best-effort ffprobe decode confirms the bytes are actually decodable audio.

/** Minimum file size: below this it is not a usable background track. */
const MIN_AUDIO_BYTES = 32 * 1024;

const AUDIO_MAGIC: Array<{ name: string; test: (b: Buffer) => boolean }> = [
  { name: 'mp3 (ID3 tag)',      test: b => b.length > 3 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33 },
  { name: 'mp3 (frame sync)',   test: b => b.length > 2 && b[0] === 0xff && (b[1]! & 0xe0) === 0xe0 },
  { name: 'wav',                test: b => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WAVE' },
  { name: 'm4a / mp4',          test: b => b.length > 8 && b.toString('ascii', 4, 8) === 'ftyp' },
  { name: 'aac (ADTS sync)',    test: b => b.length > 2 && b[0] === 0xff && (b[1]! & 0xf6) === 0xf0 },
  { name: 'ogg',                test: b => b.length > 4 && b.toString('ascii', 0, 4) === 'OggS' },
  { name: 'webm / matroska',    test: b => b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
];

function sniffAudioHeader(buf: Buffer): string | null {
  for (const { name, test } of AUDIO_MAGIC) {
    if (test(buf)) return name;
  }
  return null;
}

let ffprobeWarned = false;

/**
 * Confirm a downloaded/local file is really playable audio.
 *
 * Two layers: magic-byte sniff (always, no deps) and, when ffprobe is on the
 * PATH, a decode probe that requires at least one audio stream. ffprobe being
 * absent only downgrades verification to the sniff — never blocks ingestion.
 */
async function verifyAudioFile(path: string, title: string): Promise<void> {
  const info = await stat(path);
  if (info.size < MIN_AUDIO_BYTES) {
    throw new Error(`"${title}" is only ${(info.size / 1024).toFixed(1)} KB — too small to be a usable background track`);
  }

  const fd = await open(path, 'r');
  const header = Buffer.alloc(4096);
  await fd.read(header, 0, header.length, 0);
  await fd.close();
  if (!sniffAudioHeader(header)) {
    throw new Error(`"${title}" is not playable audio (no mp3/wav/m4a/aac/ogg/webm header found) — refusing to upload`);
  }

  try {
    execFileSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'stream=codec_type',
      '-of', 'json',
      path,
    ], { stdio: 'pipe' });
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      if (!ffprobeWarned) {
        console.warn('  (ffprobe not found — verification downgraded to header sniffing only)');
        ffprobeWarned = true;
      }
      return;
    }
    throw new Error(`"${title}" cannot be decoded as audio by ffprobe — refusing to upload`);
  }
}

const RACE_TIMEOUT_MS = 90_000; // 90s per-track budget (download + upload)

async function uploadTrack(
  track: TrackEntry,
  tmpDir: string,
  dryRun: boolean,
): Promise<{ title: string; publicId: string; success: boolean }> {
  const title = track.artist ? `${track.title} - ${track.artist}` : track.title;
  // Local files hash their own path; remote tracks hash the URL. Either way a
  // re-run produces the same public_id and `overwrite:false` skips it.
  const hashSource = track.url || track.localPath || track.title;
  const publicId = `${track.idPrefix ?? 'sh'}-${createHash('md5').update(hashSource).digest('hex').slice(0, 12)}`;

  if (dryRun) {
    console.log(`  ${title}`);
    return { title, publicId, success: true };
  }

  // Local files upload in place (never deleted); remote sources download to a
  // temp file that is cleaned up after upload.
  let tmpPath: string | null = null;
  if (!track.localPath) {
    const ext = extname(new URL(track.url).pathname) || '.mp3';
    tmpPath = join(tmpDir, `audio-${publicId}${ext}`);
  }

  try {
    // Race the whole operation (download + verify + upload) against a timeout
    // so one slow source response doesn't stall the entire queue.
    await Promise.race([
      (async () => {
        console.log(`  ${title}`);
        if (track.url) {
          await downloadFile(track.url, tmpPath!);
        }
        const uploadSource = tmpPath ?? track.localPath!;

        // Verification-first: refuse anything that isn't real playable audio
        // (an HTML 200 page, a login wall, a truncated download…).
        await verifyAudioFile(uploadSource, title);

        await cloudinary.uploader.upload(uploadSource, {
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
    if (tmpPath) {
      try { await unlink(tmpPath); } catch { /* ignore */ }
    }
  }
}

function timeout(ms: number, msg: string): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms));
}

function escapeContext(value: string): string {
  return value.replace(/[=|\\]/g, '\\$&');
}

// ── Ingestion: --from-dir and --manifest ──────────────────────────────────────
// Both build TrackEntries that flow through the SAME uploadTrack (hence the
// same verification): a bad local file is refused exactly like a bad URL.

const AUDIO_EXTS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.webm']);

/** Turn every audio file in a folder into a TrackEntry (uploaded in place). */
async function scanDir(dir: string): Promise<TrackEntry[]> {
  const entries = (await readdir(dir, { withFileTypes: true }))
    .filter(e => e.isFile() && AUDIO_EXTS.has(extname(e.name).toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  return entries.map(e => ({
    title: basename(e.name, extname(e.name)),
    url: '',
    artist: '',
    tags: [],
    localPath: resolve(dir, e.name),
    idPrefix: 'uf',
  }));
}

interface ManifestEntry {
  title?: string;
  url?: string;
  artist?: string;
  tags?: string[];
}

/** Load { title, url, artist?, tags? } entries from a JSON file. */
async function loadManifest(file: string): Promise<TrackEntry[]> {
  const raw = await readFile(file, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`--manifest=${file} is not valid JSON`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`--manifest=${file} must be a JSON array of { title, url, artist?, tags? }`);
  }

  const tracks: TrackEntry[] = [];
  for (const [i, entry] of parsed.entries()) {
    const e = (entry ?? {}) as ManifestEntry;
    if (typeof e.url !== 'string' || !e.url.trim()) {
      throw new Error(`--manifest=${file}: entry ${i} is missing a "url"`);
    }
    if (typeof e.title === 'string' && !e.title.trim()) {
      throw new Error(`--manifest=${file}: entry ${i} has an empty "title"`);
    }
    tracks.push({
      title: e.title?.trim() || 'Untitled track',
      url: e.url.trim(),
      artist: e.artist?.trim() ?? '',
      tags: Array.isArray(e.tags) ? e.tags.filter((t): t is string => typeof t === 'string') : [],
      idPrefix: 'mf',
    });
  }
  return tracks;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  initCloudinary();

  // Source precedence: --from-dir > --manifest > built-in list. All three
  // produce TrackEntries that flow through the same upload + verification.
  let tracks: TrackEntry[];
  if (args.fromDir) {
    tracks = await scanDir(args.fromDir);
  } else if (args.manifest) {
    tracks = await loadManifest(args.manifest);
  } else {
    tracks = TRACKS.map(t => ({ ...t, idPrefix: 'sh' }));
  }
  tracks = tracks.slice(0, args.limit);

  if (tracks.length === 0) {
    console.log('No tracks to upload.');
    process.exit(0);
  }

  const sourceLabel = args.fromDir
    ? `from folder ${args.fromDir}`
    : args.manifest
      ? `from manifest ${args.manifest}`
      : 'from the built-in catalogue';
  console.log(`\nSeeding ${tracks.length} background music tracks ${sourceLabel} to Cloudinary\n`);

  if (args.dryRun) {
    console.log('── DRY RUN ──');
    for (const t of tracks) {
      const label = t.artist ? `${t.title} - ${t.artist}` : t.title;
      console.log(`  ${label}  [${t.tags.join(', ')}]`);
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
