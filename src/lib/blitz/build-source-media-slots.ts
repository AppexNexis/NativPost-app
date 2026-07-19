/**
 * buildSourceMediaSlots
 *
 * Canonical clone-from-template mediaSlots builder shared by
 *   - `/api/templates/[id]/remix/route.ts` (proven pattern, lines 249-257)
 *   - `/api/campaigns/utils.ts` Blitz insert loop (new)
 *
 * Given a raw `content_template` row, produce the `mediaSlots` shape the
 * editor + Remotion previews expect: `{ background?, hookVideo?, demoVideo?,
 * slides? }`. This is the same shape stored in `enrichmentData.sourceMediaSlots`
 * on the resulting content_item so the editor can rehydrate without a
 * separate fetch.
 *
 * Content-type behavior:
 *   - slideshow / carousel / data_story → slides[] from thumbnailUrls
 *   - wall_of_text / talking_head / green_screen / video_hook / video_hook_demo / ugc / reel
 *     → background = mediaUrl (video) OR thumbnailUrl (image)
 *   - unknown → background = mediaUrl || thumbnailUrl
 */

import { isMultiSlideTemplate, parseTemplateSlides } from '@/lib/content/template-slides';

export type SourceMediaSlots = {
  background?: { url: string; assetType?: 'image' | 'video' };
  hookVideo?: { url: string; assetType?: 'video' };
  demoVideo?: { url: string; assetType?: 'video' };
  faceVideo?: { url: string; assetType?: 'video' };
  slides?: { url: string; assetType: 'image' }[];
};

type TemplateRow = {
  contentType: string;
  mediaUrl?: string | null;
  sourceUrl?: string | null;
  thumbnailUrl?: string | null;
  thumbnailUrls?: Record<string, string> | string[] | null;
};

// Video detection covers both file-extension URLs and Cloudinary transformer
// paths (`/video/upload/`), which many templates use without a trailing ext.
// Previously only checked ext, so Cloudinary video templates fell through to
// image aliases → composition rendered black frame.
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv)(\?|#|$)/i;
const VIDEO_URL_PATH = /\/video\/upload\//i;

function isVideoUrl(url?: string | null): boolean {
  if (!url) {
    return false;
  }
  return VIDEO_URL_PATH.test(url) || VIDEO_EXT.test(url);
}

export function buildSourceMediaSlots(template: TemplateRow): SourceMediaSlots {
  const slots: SourceMediaSlots = {};

  const slideUrls = parseTemplateSlides(template.thumbnailUrls as any);
  const multiSlide = isMultiSlideTemplate(template.contentType, slideUrls);

  if (multiSlide && slideUrls.length > 0) {
    // Blitz slideshow invariant: exactly 4 slides. Templates that ship fewer
    // (3) or more (5–7) are normalized here so preview + generation always
    // agree. applySetToSlots re-normalizes downstream when user media is
    // spliced in.
    const TARGET = 4;
    const capped = slideUrls.slice(0, TARGET);
    while (capped.length < TARGET) {
      capped.push(slideUrls[capped.length % slideUrls.length]!);
    }
    slots.slides = capped.map(url => ({ url, assetType: 'image' as const }));
    // A slideshow template can still ship a background if mediaUrl/sourceUrl is
    // set — some compositions layer text over a bg. Keep it optional.
    const bgUrl = template.mediaUrl || template.sourceUrl || null;
    if (bgUrl) {
      slots.background = {
        url: bgUrl,
        assetType: isVideoUrl(bgUrl) ? 'video' : 'image',
      };
    }
    return slots;
  }

  // sourceUrl is the original imported video URL for video-type templates
  // (video_hook, green_screen, talking_head, video_hook_demo). These may not
  // have a processed mediaUrl/thumbnailUrl yet, so fall back to sourceUrl.
  // IMPORTANT: many Apify-scraped templates store a TikTok/Instagram page URL
  // in sourceUrl — these are NOT direct media files and will fail in <video>
  // or <img> tags. Only use sourceUrl when it looks like a direct media URL.
  let primary = template.mediaUrl || template.thumbnailUrl || null;
  if (!primary && template.sourceUrl) {
    const isDirectMedia = /\.(mp4|webm|mov|m4v|jpg|jpeg|png|webp|gif|avif)(\?|$)/i.test(template.sourceUrl);
    if (isDirectMedia) {
      primary = template.sourceUrl;
    }
  }
  if (primary) {
    slots.background = {
      url: primary,
      assetType: isVideoUrl(primary) ? 'video' : 'image',
    };
  }

  // Composition-specific aliases so per-type compositions can find the media.
  // We route the background URL to type-specific slots regardless of whether
  // it's video or image — the compositions now auto-detect and render <Img>
  // vs <Video> via the shared `isVideoUrl` helper. Previously this alias
  // block was gated on `assetType === 'video'`, so image-source templates
  // for video content types left hook/demo/face slots empty, producing the
  // signature black-frame + text-overlay bug.
  if (slots.background?.url) {
    const bgUrl = slots.background.url;
    const bgKind: 'image' | 'video' = slots.background.assetType === 'video' ? 'video' : 'image';
    // Cast preserves the existing slot shape (assetType is typed 'video'
    // there) — compositions gracefully handle image URLs regardless.
    if (template.contentType === 'video_hook' || template.contentType === 'video_hook_demo') {
      slots.hookVideo = { url: bgUrl, assetType: bgKind as 'video' };
      slots.demoVideo = { url: bgUrl, assetType: bgKind as 'video' };
    }
    if (template.contentType === 'ugc' || template.contentType === 'talking_head') {
      slots.demoVideo = { url: bgUrl, assetType: bgKind as 'video' };
    }
    // TalkingHead reads mediaSlots.faceVideo; mirror the background so the
    // face slot always has a source when no influencer is enabled.
    if (template.contentType === 'talking_head') {
      slots.faceVideo = { url: bgUrl, assetType: bgKind as 'video' };
    }
  }

  return slots;
}
