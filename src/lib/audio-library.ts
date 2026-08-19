/**
 * Shared background-audio catalog helpers.
 *
 * Cloudinary storage for NativPost audio:
 *   - The shared, curated pool lives in folder `nativpost/audio/` — the
 *     editor's "Default Audio" tab. Adding or replacing tracks is an upload
 *     into this folder; no code change, no deploy.
 *   - Per-org uploads live in `nativpost/audio-user/{orgId}` — the "My
 *     Library" tab. Namespaced so orgs never mix.
 *
 * Cloudinary quirks (see team memory `nativpost-cloudinary-asset-titles`):
 *   - Audio (mp3/wav/m4a) is stored as `resource_type=video` in Cloudinary.
 *   - Raw public_id tails look like `da319awzjdgfs7q0k4mx` — never surface
 *     those as titles. Titles come from `context.custom.title`, with a
 *     prettified fallback that decodes the last path segment.
 *
 * NOTE: this lives OUTSIDE the route files on purpose. Next.js route modules
 * only allow supported exports (GET/POST/… and a few config fields); an
 * exported helper like `userAudioFolder` breaks the route's type contract.
 */

import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!;

/** Shared, curated catalogue — the "Default Audio" tab. Every org sees it. */
export const AUDIO_FOLDER = 'nativpost/audio';

/** Per-org uploads — the "My Library" tab. Namespaced so orgs never mix. */
export function userAudioFolder(orgId: string): string {
  return `nativpost/audio-user/${orgId}`;
}

export type AudioAsset = {
  publicId: string;
  title: string;
  url: string;
  durationSeconds: number | null;
  mimeType: string;
  tags: string[];
  addedAt: string | null;
};

function prettifyPublicId(publicId: string): string {
  const tail = publicId.split('/').pop() ?? publicId;
  // Cloudinary auto-tails look like base32 gibberish; if it's more than 12
  // chars of alphanumerics with no separators, treat as unnamed.
  if (/^[a-z0-9]{12,}$/i.test(tail)) return 'Untitled track';
  return tail
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, c => c.toUpperCase());
}

function buildAudioUrl(publicId: string, format?: string): string {
  // Deliver at the source format (mp3/m4a/wav) — no transcoding needed.
  const ext = format ? `.${format}` : '';
  return `https://res.cloudinary.com/${CLOUD}/video/upload/${publicId}${ext}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalize(resource: any): AudioAsset {
  const publicId: string = resource.public_id;
  const context = resource.context?.custom ?? resource.context ?? {};
  const contextTitle: string | undefined = context.title || context.name || context.caption;
  const title = (contextTitle && contextTitle.trim()) || prettifyPublicId(publicId);

  return {
    publicId,
    title,
    url: buildAudioUrl(publicId, resource.format),
    durationSeconds: typeof resource.duration === 'number' ? Math.round(resource.duration) : null,
    mimeType: resource.format ? `audio/${resource.format}` : 'audio/mpeg',
    tags: Array.isArray(resource.tags) ? resource.tags : [],
    addedAt: resource.created_at ?? null,
  };
}
