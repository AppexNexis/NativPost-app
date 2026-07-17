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

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|$)/i;

function isVideoUrl(url?: string | null): boolean {
  return !!url && VIDEO_EXT.test(url);
}

export function buildSourceMediaSlots(template: TemplateRow): SourceMediaSlots {
  const slots: SourceMediaSlots = {};

  const slideUrls = parseTemplateSlides(template.thumbnailUrls as any);
  const multiSlide = isMultiSlideTemplate(template.contentType, slideUrls);

  if (multiSlide && slideUrls.length > 0) {
    slots.slides = slideUrls.map(url => ({ url, assetType: 'image' as const }));
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
  if (slots.background?.assetType === 'video') {
    if (template.contentType === 'video_hook' || template.contentType === 'video_hook_demo') {
      slots.hookVideo = { url: slots.background.url, assetType: 'video' };
    }
    if (template.contentType === 'ugc' || template.contentType === 'talking_head') {
      slots.demoVideo = { url: slots.background.url, assetType: 'video' };
    }
    // TalkingHead composition reads mediaSlots.faceVideo; when no
    // influencer is enabled the preview would render blank without an
    // alias. Mirror the background so the face slot always has a source.
    if (template.contentType === 'talking_head') {
      slots.faceVideo = { url: slots.background.url, assetType: 'video' };
    }
  }

  return slots;
}
