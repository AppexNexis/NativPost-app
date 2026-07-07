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
 *   - wall_of_text / talking_head / green_screen / video_hook / ugc / reel
 *     → background = mediaUrl (video) OR thumbnailUrl (image)
 *   - unknown → background = mediaUrl || thumbnailUrl
 */

import { isMultiSlideTemplate, parseTemplateSlides } from '@/lib/content/template-slides';

export type SourceMediaSlots = {
  background?: { url: string; assetType?: 'image' | 'video' };
  hookVideo?: { url: string; assetType?: 'video' };
  demoVideo?: { url: string; assetType?: 'video' };
  slides?: { url: string; assetType: 'image' }[];
};

type TemplateRow = {
  contentType: string;
  mediaUrl?: string | null;
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
    slots.slides = slideUrls.map((url) => ({ url, assetType: 'image' as const }));
    // A slideshow template can still ship a background if mediaUrl is set —
    // some compositions layer text over a bg. Keep it optional.
    if (template.mediaUrl) {
      slots.background = {
        url: template.mediaUrl,
        assetType: isVideoUrl(template.mediaUrl) ? 'video' : 'image',
      };
    }
    return slots;
  }

  const primary = template.mediaUrl || template.thumbnailUrl || null;
  if (primary) {
    slots.background = {
      url: primary,
      assetType: isVideoUrl(primary) ? 'video' : 'image',
    };
  }

  // Composition-specific aliases so per-type compositions can find the media.
  if (slots.background?.assetType === 'video') {
    if (template.contentType === 'video_hook') {
      slots.hookVideo = { url: slots.background.url, assetType: 'video' };
    }
    if (template.contentType === 'ugc' || template.contentType === 'talking_head') {
      slots.demoVideo = { url: slots.background.url, assetType: 'video' };
    }
  }

  return slots;
}
