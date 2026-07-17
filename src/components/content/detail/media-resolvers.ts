/**
 * media-resolvers — reconstruct a full Remotion `mediaSlots` shape from every
 * possible content source so `RemotionPreviewPlayer` doesn't render black
 * frames for non-editor-created posts.
 *
 * Order of preference:
 *   1. enrichmentData.sourceMediaSlots      — editor path (stashed by
 *      EditorLayout.runPublish, memory: preserve-raw-source-in-compile-pipeline)
 *   2. enrichmentData.templateSnapshot      — Blitz + campaign path
 *      (memory: enrichmentData-snapshot-key-drift also covers
 *      sourceTemplateSnapshot as a synonym)
 *   3. graphicUrls[0]                       — raw import / plain publish path
 *
 * The final slot placement is content-type aware because the per-type
 * Remotion compositions destructure different slots
 * (`hookVideo` vs `demoVideo` vs `background`).
 */

import type { ContentItem } from '@/types/v2';

import { VIDEO_RE, getThumb, getVideoUrl } from '../preview-helpers';

type Slot = { url?: string; assetType?: string; thumbnailUrl?: string; [k: string]: any };
type Slide = { url?: string; caption?: string; durationSeconds?: number; [k: string]: any };

export type ResolvedMediaSlots = {
  background?: Slot;
  hookVideo?: Slot;
  demoVideo?: Slot;
  faceVideo?: Slot;
  slides?: Slide[];
};

const HOOK_TYPES = new Set(['video_hook', 'video_hook_demo', 'reel', 'green_screen', 'green_screen_meme']);
const DEMO_TYPES = new Set(['talking_head', 'ugc', 'ugc_ad']);
const SLIDE_TYPES = new Set(['slideshow', 'carousel']);

function pickSnapshotUrl(snapshot: Record<string, any>): { url?: string; thumbnailUrl?: string } {
  const url = snapshot.mediaUrl || snapshot.sourceUrl || snapshot.videoUrl;
  const thumbnailUrl = snapshot.thumbnailUrl
    || (Array.isArray(snapshot.thumbnailUrls) ? snapshot.thumbnailUrls[0] : undefined)
    || (snapshot.thumbnailUrls && typeof snapshot.thumbnailUrls === 'object'
      ? (Object.values(snapshot.thumbnailUrls)[0] as string | undefined)
      : undefined);
  return { url: typeof url === 'string' ? url : undefined, thumbnailUrl: typeof thumbnailUrl === 'string' ? thumbnailUrl : undefined };
}

function slotForContentType(contentType: string): 'hookVideo' | 'demoVideo' | 'background' {
  if (DEMO_TYPES.has(contentType)) return 'demoVideo';
  if (HOOK_TYPES.has(contentType)) return 'hookVideo';
  return 'background';
}

/**
 * Union of both known snapshot keys per memory `enrichmentData-snapshot-key-drift`.
 */
function readTemplateSnapshot(enrichment: Record<string, any>): Record<string, any> {
  return (enrichment.templateSnapshot || enrichment.sourceTemplateSnapshot || {}) as Record<string, any>;
}

/**
 * Resolve a full `mediaSlots` object suitable for RemotionPreviewPlayer.
 * Returns an empty object if nothing usable can be reconstructed.
 */
export function resolveMediaSlots(item: ContentItem): ResolvedMediaSlots {
  const enrichment = (item.enrichmentData ?? {}) as Record<string, any>;
  const stashed = (enrichment.sourceMediaSlots ?? {}) as Record<string, any>;

  // 1. Editor path: use the stash verbatim if it has any slot populated.
  const stashedKeys = Object.keys(stashed);
  if (stashedKeys.length > 0) {
    const out: ResolvedMediaSlots = {};
    if (stashed.background) out.background = stashed.background;
    if (stashed.hookVideo) out.hookVideo = stashed.hookVideo;
    if (stashed.demoVideo) out.demoVideo = stashed.demoVideo;
    if ((stashed as any).faceVideo) (out as any).faceVideo = (stashed as any).faceVideo;
    if (Array.isArray(stashed.slides) && stashed.slides.length > 0) out.slides = stashed.slides;

    // Alias background into the content-type-specific slot when the target
    // slot is missing. Older Blitz posts (pre-aliasing) stashed only
    // `background`, but per-type Remotion compositions destructure
    // `hookVideo` / `demoVideo` / `faceVideo` — without this fallback the
    // detail page renders a black frame with only the text overlay
    // (matches Bug 3 report).
    const targetSlot = slotForContentType(item.contentType);
    if (targetSlot !== 'background' && !(out as any)[targetSlot] && out.background) {
      (out as any)[targetSlot] = out.background;
    }

    if (out.background || out.hookVideo || out.demoVideo || (out as any).faceVideo || out.slides) return out;
  }

  // 2. Template snapshot path (Blitz + campaign).
  const snapshot = readTemplateSnapshot(enrichment);
  const snapPick = pickSnapshotUrl(snapshot);

  // Slideshow / carousel — reconstruct slides from snapshot arrays or graphicUrls.
  if (SLIDE_TYPES.has(item.contentType)) {
    const snapSlides = Array.isArray(snapshot.slides) ? snapshot.slides : undefined;
    if (snapSlides && snapSlides.length > 0) {
      return { slides: snapSlides };
    }
    // Fall back to graphicUrls as slide URLs, one caption per slide from editorScript.slideCopy.
    const graphics = (item.graphicUrls || []).filter((u): u is string => typeof u === 'string' && !VIDEO_RE.test(u));
    if (graphics.length > 0) {
      const script = (enrichment.editorScript ?? {}) as Record<string, any>;
      const copy = Array.isArray(script.slideCopy) ? script.slideCopy : [];
      return {
        slides: graphics.map((url, i) => ({
          url,
          caption: typeof copy[i] === 'string' ? copy[i] : copy[i]?.text ?? undefined,
        })),
      };
    }
  }

  // Non-slideshow: choose the target slot based on content type and drop
  // the discovered URL into it.
  const targetSlot = slotForContentType(item.contentType);
  const url = snapPick.url || getVideoUrl(item) || item.graphicUrls?.[0];
  const thumbnailUrl = snapPick.thumbnailUrl || getThumb(item) || undefined;

  if (!url && !thumbnailUrl) return {};

  const slot: Slot = {};
  if (url) slot.url = url;
  if (thumbnailUrl) slot.thumbnailUrl = thumbnailUrl;
  if (url && VIDEO_RE.test(url)) slot.assetType = 'video';

  return { [targetSlot]: slot } as ResolvedMediaSlots;
}

/**
 * Returns the best still image (poster or thumbnail) for the item — never a video URL.
 */
export function resolveImageUrl(item: ContentItem): string | null {
  return getThumb(item);
}

/**
 * Returns the raw video URL for video-type items, checking every known location.
 */
export function resolveVideoUrl(item: ContentItem): string | null {
  const v = getVideoUrl(item);
  if (v) return v;
  const enrichment = (item.enrichmentData ?? {}) as Record<string, any>;
  const snapshot = readTemplateSnapshot(enrichment);
  const { url } = pickSnapshotUrl(snapshot);
  if (url && VIDEO_RE.test(url)) return url;
  return null;
}

/**
 * True when we can render *something* — image, video, or a slide array.
 * Used by the preview panel to decide skeleton vs empty state.
 */
export function hasAnyMedia(item: ContentItem): boolean {
  if (item.graphicUrls && item.graphicUrls.length > 0) return true;
  const slots = resolveMediaSlots(item);
  if (slots.slides && slots.slides.length > 0) return true;
  if (slots.background?.url || slots.hookVideo?.url || slots.demoVideo?.url) return true;
  if (resolveImageUrl(item) || resolveVideoUrl(item)) return true;
  return false;
}

/**
 * Cloudinary-safe video source (add f_mp4 when the URL lacks an extension).
 */
export function toVideoSrc(url: string): string {
  if (/\.(?:mp4|mov|webm)(?:[/?#]|$)/i.test(url)) return url;
  if (/\/video\/upload\//i.test(url)) {
    return url.replace(/\/video\/upload\//, '/video/upload/f_mp4/');
  }
  return url;
}
