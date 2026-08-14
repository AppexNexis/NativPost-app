/**
 * Uploads the rendered guide videos to Cloudinary under `nativpost/learn/…`,
 * which is where `lib/learn/video.ts` resolves a guide's `video.src`.
 *
 * The videos are 20-30 MB each and are deliberately NOT committed — they live
 * in the HyperFrames project (`nativpost/guides-videos/`) and are published to
 * Cloudinary from there.
 *
 *   npm run learn:upload-videos           # upload anything missing
 *   npm run learn:upload-videos -- --force  # re-upload and overwrite
 *
 * Requires CLOUDINARY_* credentials in .env (same ones the app already uses).
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { v2 as cloudinary } from 'cloudinary';

const VIDEO_DIR = path.resolve(process.cwd(), '..', 'guides-videos');
const FOLDER = 'nativpost/learn';

/**
 * Rendered files carry a timestamp (`guide-01-get-started_2026-08-13_19-35-56.mp4`)
 * but the public id must be stable, because it is written into the guide
 * content files. Strip everything from the first underscore-date onwards.
 */
function publicIdFor(filename: string): string {
  const base = filename.replace(/\.mp4$/i, '');
  return base.replace(/_\d{4}-\d{2}-\d{2}_[\d-]+$/, '');
}

async function main() {
  const force = process.argv.includes('--force');

  const { CLOUDINARY_KEY_NAME, CLOUDINARY_API_SECRET, NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, NEXT_PUBLIC_CLOUDINARY_API_KEY } = process.env;
  const cloudName = NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = NEXT_PUBLIC_CLOUDINARY_API_KEY ?? CLOUDINARY_KEY_NAME;

  if (!cloudName || !apiKey || !CLOUDINARY_API_SECRET) {
    console.error('Missing Cloudinary credentials. Need NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, an API key and CLOUDINARY_API_SECRET.');
    process.exit(1);
  }

  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: CLOUDINARY_API_SECRET });

  if (!existsSync(VIDEO_DIR)) {
    console.error(`No video directory at ${VIDEO_DIR}`);
    process.exit(1);
  }

  const files = readdirSync(VIDEO_DIR).filter(f => f.toLowerCase().endsWith('.mp4')).sort();
  if (files.length === 0) {
    console.error(`No .mp4 files in ${VIDEO_DIR}`);
    process.exit(1);
  }

  console.log(`Uploading ${files.length} video(s) to ${cloudName}/${FOLDER}\n`);

  for (const file of files) {
    const full = path.join(VIDEO_DIR, file);
    const id = publicIdFor(file);
    const publicId = `${FOLDER}/${id}`;
    const sizeMb = (statSync(full).size / 1024 / 1024).toFixed(1);

    if (!force) {
      try {
        await cloudinary.api.resource(publicId, { resource_type: 'video' });
        console.log(`  = ${id} — already uploaded, skipping (use --force to replace)`);
        continue;
      } catch {
        // Not found — fall through and upload.
      }
    }

    process.stdout.write(`  ↑ ${id} (${sizeMb} MB) … `);
    try {
      const res = await cloudinary.uploader.upload(full, {
        resource_type: 'video',
        public_id: publicId,
        overwrite: force,
        invalidate: force,
      });
      console.log(`done — ${res.secure_url}`);
    } catch (err) {
      console.log('FAILED');
      console.error(`    ${(err as Error).message}`);
      process.exitCode = 1;
    }
  }

  console.log('\nGuide content references these by public id, e.g.:');
  console.log(`  video: { src: '${FOLDER}/guide-01-get-started' }`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
