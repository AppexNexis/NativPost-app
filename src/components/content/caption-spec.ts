/**
 * Canonical caption geometry for card-sized previews.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The card previews (posts grid, campaign review grid, campaign calendar) draw
 * the caption with plain CSS over an <img>/<video>. The *authoritative* preview
 * surfaces draw it differently:
 *
 *   - Blitz + content-detail VIDEO posts  → RemotionPreviewPlayer, which routes
 *     every overlay-video type through `EditorComposition` (see
 *     RemotionPreviewPlayer.COMPOSITION_BY_TYPE) rendered at 1080px wide and
 *     CSS-scaled into a 360px frame.
 *   - Content-detail IMAGE posts (slideshow / carousel / data_story /
 *     single_image / wall_of_text) → GalleryPreview → SlideView at 360px.
 *
 * Those two renderers do NOT share geometry, and the card overlay used to be
 * calibrated against SlideView for *everything* — so video cards drew the
 * caption ~30% too large, in a frame padded 24px instead of 6%, with no
 * background dim, in whatever font happened to be loaded. Same post, three
 * different looks.
 *
 * This module resolves ONE spec per item, expressed in the 360px detail-frame
 * basis, picking the geometry of whichever renderer is canonical for that
 * content type. CaptionOverlay then reproduces it proportionally at any card
 * width. Keep the two branches below in sync with:
 *   - components/editor/compositions/EditorComposition.tsx  (video)
 *   - components/content-library/SlideView.tsx              (image)
 */

import { getEditorKind } from '@/lib/editor/content-type-registry';
import { resolveFont } from '@/lib/editor/fonts';
import type { ContentItem } from '@/types/v2';

// The content-detail page renders both canonical previews inside a fixed
// 360px-wide portrait frame (ContentPreview.frameWidth / GalleryPreview).
// Every px value in a CaptionSpec is expressed against this basis, so a card
// is a true proportional copy at any width and byte-identical at 360px.
export const DETAIL_FRAME_WIDTH = 360;

// Remotion renders 9:16 at 1080px wide (RemotionPreviewPlayer), displayed in
// the 360px frame — every composition px is divided by this to reach the basis.
const COMPOSITION_WIDTH = 1080;
const COMPOSITION_SCALE = DETAIL_FRAME_WIDTH / COMPOSITION_WIDTH; // 1/3

// Types whose content-detail preview is GalleryPreview/SlideView, not Remotion.
// Mirrors ContentPreview.IMAGE_KIND_TYPES.
const IMAGE_KIND_TYPES = new Set([
  'slideshow',
  'carousel',
  'data_story',
  'single_image',
  'wall_of_text',
]);

export type CaptionPosition = {
  top: string;
  bottom: string;
  justifyContent: 'flex-start' | 'center' | 'flex-end';
  alignItems: 'flex-start' | 'center' | 'flex-end';
};

export type CaptionSpec = {
  text: string;
  /** Font size in px at the 360px basis. */
  fontPx: number;
  /** Resolved family, or null to inherit the page font (see below). */
  fontFamily: string | null;
  fontWeight: number;
  fontStyle: 'italic' | 'normal';
  textDecoration: 'underline' | 'none';
  color: string;
  /** Highlight box colour, or null for the boxless stroke+shadow look. */
  boxColor: string | null;
  align: 'left' | 'center' | 'right';
  /** Frame padding in px at the 360px basis. */
  framePadPx: number;
  /** Caption block max width, as a % of the padded frame. */
  maxWidthPct: number;
  /** Where the caption block sits inside the frame. */
  position: CaptionPosition;
  /** 0..1 scrim opacity between the media and the text. */
  dimming: number;
};

// ── Overlay text ──────────────────────────────────────────────────────────
// Which script field the card shows, and the font scale that field renders at
// in EditorComposition (hook 1.0, body 0.8). Slideshows show slide 1's copy.
export type OverlayText = { text: string; scale: number };

export function getOverlayTextParts(item: ContentItem | null | undefined): OverlayText {
  if (!item) {
    return { text: '', scale: 1 };
  }
  const enrichment = (item.enrichmentData ?? {}) as Record<string, any>;
  const script = (enrichment.editorScript ?? {}) as Record<string, any>;

  if (item.contentType === 'slideshow' || item.contentType === 'carousel') {
    const slideCopy = Array.isArray(script.slideCopy) ? script.slideCopy : [];
    if (slideCopy[0] && typeof slideCopy[0] === 'string') {
      return { text: slideCopy[0], scale: 1 };
    }
    const slides = (enrichment.sourceMediaSlots as Record<string, any>)?.slides;
    if (Array.isArray(slides) && slides[0]?.caption) {
      return { text: String(slides[0].caption), scale: 1 };
    }
  }
  if (script.hookText && typeof script.hookText === 'string') {
    return { text: script.hookText, scale: 1 };
  }
  if (script.bodyText && typeof script.bodyText === 'string') {
    // EditorComposition draws body at fontSize * 0.8 (floored at 16px @1080).
    return { text: script.bodyText, scale: 0.8 };
  }
  return { text: item.caption ?? '', scale: 1 };
}

// ── Spec resolver ─────────────────────────────────────────────────────────
export function resolveCaptionSpec(
  item: ContentItem | null | undefined,
  overlay: OverlayText,
): CaptionSpec | null {
  if (!item || !overlay.text.trim()) {
    return null;
  }

  const enrichment = (item.enrichmentData ?? {}) as Record<string, any>;
  const style = (enrichment.editorStyle ?? {}) as Record<string, any>;
  const layout = (enrichment.editorLayout as string) || 'centered';
  const contentType = item.contentType ?? '';

  const align: 'left' | 'center' | 'right'
    = style.align === 'left' || style.align === 'right' ? style.align : 'center';

  const usesSlideView = getEditorKind(contentType) === 'image' || IMAGE_KIND_TYPES.has(contentType);

  const common = {
    text: overlay.text,
    // EditorComposition resolves through resolveFont, which falls back to Inter.
    // SlideView passes `fontFamily || undefined`, i.e. it INHERITS the page font
    // (Safiro) when nothing is authored — so null here means "inherit", and the
    // image branch keeps matching the detail page instead of forcing Inter.
    fontFamily: style.fontFamily
      ? resolveFont(style.fontFamily as string)
      : (usesSlideView ? null : resolveFont(undefined)),
    fontWeight: style.weight === 'normal' ? 600 : 800,
    fontStyle: (style.italic ? 'italic' : 'normal') as 'italic' | 'normal',
    textDecoration: (style.underline ? 'underline' : 'none') as 'underline' | 'none',
    color: (style.color as string) || '#ffffff',
    // Highlight box is the default look; only an explicit 'transparent' drops it.
    boxColor: style.backgroundColor === 'transparent'
      ? null
      : ((style.backgroundColor as string) || '#000000'),
    align,
  };

  if (usesSlideView) {
    // ── SlideView geometry (content-detail GalleryPreview) ──
    // fontSize * 0.5 (0.7 for wall_of_text), p-4 / p-6, 90% / 95% max width,
    // no scrim unless the style asks for one.
    const isWall = layout === 'wall_of_text';
    return {
      ...common,
      fontPx: (typeof style.fontSize === 'number' ? style.fontSize : 20)
        * (isWall ? 0.7 : 0.5) * overlay.scale,
      framePadPx: layout === 'centered' ? 24 : 16,
      maxWidthPct: isWall ? 95 : 90,
      position: slideViewPosition(layout),
      dimming: clamp(typeof style.backgroundDimming === 'number' ? style.backgroundDimming : 0, 0, 1),
    };
  }

  // ── EditorComposition geometry (blitz + content-detail video) ──
  // fontSize * 1.5 at 1080px, 6% frame padding, 90% max width, and a 0.3
  // default scrim. Everything is divided back down to the 360px basis.
  const base = Math.round((typeof style.fontSize === 'number' ? style.fontSize : 30) * 1.5);
  const compositionFontPx = overlay.scale === 1 ? base : Math.max(16, base * overlay.scale);

  return {
    ...common,
    fontPx: compositionFontPx * COMPOSITION_SCALE,
    framePadPx: Math.round(COMPOSITION_WIDTH * 0.06) * COMPOSITION_SCALE,
    maxWidthPct: 90,
    position: editorCompositionPosition(layout),
    dimming: clamp(typeof style.backgroundDimming === 'number' ? style.backgroundDimming : 0.3, 0, 0.8),
  };
}

// SlideView.getContainerClass(): the caption row is horizontally centred and
// the layout drives the vertical edge.
function slideViewPosition(layout: string): CaptionPosition {
  switch (layout) {
    case 'top_caption':
      return { top: '0', bottom: 'auto', justifyContent: 'center', alignItems: 'flex-start' };
    case 'centered':
    case 'wall_of_text':
      return { top: '0', bottom: '0', justifyContent: 'center', alignItems: 'center' };
    default:
      return { top: 'auto', bottom: '0', justifyContent: 'center', alignItems: 'flex-end' };
  }
}

// EditorComposition.layoutPosition(): a row flex, so justifyContent is the
// horizontal edge and the top/bottom insets do the vertical placement.
// wall_of_text is folded into 'centered' there — mirrored here.
//
// One deliberate divergence: EditorComposition passes `justifyContent` values
// meant for a column ('flex-start' for top_caption, 'flex-end' for
// bottom_caption) into what is actually a ROW flex, so those two layouts pin the
// caption block to the left / right edge instead of the top / bottom. The
// top/bottom insets already do the vertical placement, so cards centre both
// horizontally. Alignment inside the block still comes from the authored
// `align`.
function editorCompositionPosition(layout: string): CaptionPosition {
  switch (layout) {
    case 'centered':
    case 'wall_of_text':
      return { top: '0', bottom: '0', justifyContent: 'center', alignItems: 'center' };
    case 'top_caption':
      return { top: '0', bottom: 'auto', justifyContent: 'center', alignItems: 'center' };
    default:
      return { top: 'auto', bottom: '0', justifyContent: 'center', alignItems: 'center' };
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Stable dependency key for a spec (specs are recreated on every render). */
export function captionSpecKey(spec: CaptionSpec): string {
  return [
    spec.text,
    spec.fontPx,
    spec.fontFamily,
    spec.fontWeight,
    spec.fontStyle,
    spec.framePadPx,
    spec.maxWidthPct,
  ].join(' ');
}
