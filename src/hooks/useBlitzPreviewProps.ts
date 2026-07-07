/**
 * useBlitzPreviewProps
 *
 * Reshapes a Blitz content_item row + its enrichmentData into the
 * `{contentType, inputProps}` shape RemotionPreviewPlayer expects.
 *
 * Emits BOTH shapes per the EditorPreview.tsx:124-140 gotcha:
 *   - flat (backgroundUrl, hookVideoUrl, slides) → EditorComposition
 *     fallback path used by single_image / reel
 *   - nested (mediaSlots, script, style, layout) → per-type
 *     compositions (Slideshow, TalkingHead, VideoHook, etc.)
 *
 * Intentionally NOT wrapped in EditorProvider — Blitz previews are
 * read-only. The Edit button routes to /dashboard/editor?mode=blitz-edit
 * where the real EditorContext takes over.
 *
 * Returns `null` when the item is missing sourceMediaSlots — after
 * Phase 1 of the Blitz rebuild this should be unreachable, but kept
 * for defensive typing.
 */

import { useMemo } from 'react';

export type BlitzPreviewInputProps = {
  // flat shape — EditorComposition fallback
  backgroundUrl?: string;
  hookVideoUrl?: string;
  demoVideoUrl?: string;
  slides?: { url: string; assetType: 'image' }[];
  audioTrack?: any;
  // nested shape — per-type compositions
  mediaSlots: {
    background?: { url: string; assetType?: 'image' | 'video' };
    hookVideo?: { url: string; assetType?: 'video' };
    demoVideo?: { url: string; assetType?: 'video' };
    slides?: { url: string; assetType: 'image' }[];
  };
  script: Record<string, any>;
  style: Record<string, any>;
  layout: string;
  aspectRatio: string;
  contentType: string;
};

export type BlitzPreviewItemShape = {
  contentType: string;
  enrichmentData?: any;
  aspectRatio?: string | null;
};

export type UseBlitzPreviewPropsResult = {
  contentType: string;
  inputProps: BlitzPreviewInputProps;
} | null;

export function useBlitzPreviewProps(item: BlitzPreviewItemShape | null | undefined): UseBlitzPreviewPropsResult {
  return useMemo(() => {
    if (!item) return null;
    const enrichment = (item.enrichmentData as Record<string, any>) || {};
    const mediaSlots = (enrichment.sourceMediaSlots as BlitzPreviewInputProps['mediaSlots']) || {};

    // If sourceMediaSlots is completely empty AND we have no legacy
    // graphicUrls fallback path, bail. After Phase 1 this is unreachable
    // — kept only for defensive typing.
    const hasAnyMedia
      = mediaSlots.background?.url
      || mediaSlots.hookVideo?.url
      || mediaSlots.demoVideo?.url
      || (mediaSlots.slides && mediaSlots.slides.length > 0);
    if (!hasAnyMedia) return null;

    const inputProps: BlitzPreviewInputProps = {
      // flat aliases
      backgroundUrl: mediaSlots.background?.url,
      hookVideoUrl: mediaSlots.hookVideo?.url,
      demoVideoUrl: mediaSlots.demoVideo?.url,
      slides: mediaSlots.slides,
      audioTrack: enrichment.audioTrack,
      // nested shape
      mediaSlots,
      script: enrichment.editorScript || {},
      style: enrichment.editorStyle || {},
      layout: enrichment.editorLayout || 'centered',
      aspectRatio: item.aspectRatio || enrichment.aspectRatio || '9:16',
      contentType: item.contentType,
    };

    return { contentType: item.contentType, inputProps };
  }, [item]);
}
