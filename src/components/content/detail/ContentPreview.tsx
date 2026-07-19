'use client';

import { ImageIcon, Video } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import { GalleryPreview } from '@/components/content-library/GalleryPreview';
import { RemotionPreviewPlayer } from '@/components/editor/RemotionPreviewPlayer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getEditorKind } from '@/lib/editor/content-type-registry';
import type { ContentItem } from '@/types/v2';

import { getOverlayText, VIDEO_CONTENT_TYPES, VIDEO_RE } from '../preview-helpers';
import { ASPECT_RATIO_LABELS, ctLabel } from './status-config';
import {
  hasAnyMedia,
  resolveImageUrl,
  resolveMediaSlots,
  resolveVideoUrl,
  toVideoSrc,
} from './media-resolvers';

type Props = {
  item: ContentItem;
  editorHref: string;
};

const IMAGE_KIND_TYPES = new Set(['slideshow', 'carousel', 'data_story', 'single_image', 'wall_of_text']);

function isPortrait(aspectRatio: string): boolean {
  return aspectRatio === '9:16' || aspectRatio === '3:4' || aspectRatio === '2:3' || aspectRatio === '4:5';
}

export function ContentPreview({
  item,
  editorHref,
}: Props) {
  const editorKind = getEditorKind(item.contentType);
  const enrichment = (item.enrichmentData ?? {}) as Record<string, any>;


  const useGallery = editorKind === 'image' || IMAGE_KIND_TYPES.has(item.contentType);
  const useVideoBranch = VIDEO_CONTENT_TYPES.has(item.contentType) && !useGallery;

  const mediaSlots = useMemo(() => resolveMediaSlots(item), [item]);
  const anyMedia = useMemo(() => hasAnyMedia(item), [item]);

  const SLIDE_TYPES = new Set(['slideshow', 'carousel', 'data_story']);
  const aspectRatio = item.aspectRatio || (useVideoBranch ? '9:16' : SLIDE_TYPES.has(item.contentType) ? '9:16' : '1:1');
  const aspectCss = aspectRatio.replace(':', '/');

  const headerIcon = useVideoBranch ? Video : ImageIcon;
  const HeaderIcon = headerIcon;
  const headerLabel = useVideoBranch
    ? 'Video preview'
    : useGallery
      ? (item.contentType === 'carousel' ? 'Carousel preview' : 'Slides preview')
      : 'Image preview';

  // Gallery branch
  const gallerySlides = useMemo(() => {
    if (mediaSlots.slides && mediaSlots.slides.length > 0) {
      const urls = mediaSlots.slides
        .map(s => s?.url)
        .filter((u): u is string => typeof u === 'string' && u.length > 0);
      if (urls.length > 0) return urls;
    }
    return (item.graphicUrls ?? []).filter(u => typeof u === 'string' && u.length > 0);
  }, [mediaSlots.slides, item.graphicUrls]);

  const slideCopy = useMemo(() => {
    const script = (enrichment.editorScript ?? {}) as Record<string, any>;
    if (Array.isArray(script.slideCopy) && script.slideCopy.length > 0) return script.slideCopy;
    if (mediaSlots.slides && mediaSlots.slides.length > 0) {
      const captions = mediaSlots.slides
        .map(s => s?.caption ?? '')
        .filter((c): c is string => typeof c === 'string' && c.length > 0);
      if (captions.length > 0) return captions;
    }
    // Fallback for single_image / wall_of_text where the overlay text lives on
    // editorScript.hookText — mirrors PostCard's getOverlayText helper so the
    // detail page renders the same overlay as the posts grid.
    const overlay = getOverlayText(item);
    return overlay ? [overlay] : undefined;
  }, [enrichment.editorScript, mediaSlots.slides, item]);

  // Video branch — reconstruct editor state fallback from caption.
  const scriptWithFallback = useMemo(() => {
    const ed = enrichment.editorScript as { hookText?: string; bodyText?: string; ctaText?: string } | undefined;
    if (ed && (ed.hookText || ed.bodyText || ed.ctaText)) return ed;
    const lines = (item.caption || '').split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return {};
    if (lines.length === 1) return { hookText: lines[0] };
    if (lines.length === 2) return { hookText: lines[0], bodyText: lines[1] };
    return {
      hookText: lines[0],
      bodyText: lines.slice(1, -1).join('\n'),
      ctaText: lines[lines.length - 1],
    };
  }, [enrichment.editorScript, item.caption]);

  const hasEditorState = Boolean(
    (scriptWithFallback && (scriptWithFallback.hookText || scriptWithFallback.bodyText || scriptWithFallback.ctaText))
    || enrichment.editorStyle
    || enrichment.editorLayout,
  );

  const posterUrl = useMemo(() => resolveImageUrl(item) || item.graphicUrls?.[0] || '', [item]);

  const remotionInputProps = useMemo(() => {
    const bgUrl = mediaSlots.background?.url
      || mediaSlots.hookVideo?.url
      || mediaSlots.demoVideo?.url
      || resolveVideoUrl(item)
      || item.graphicUrls?.[0]
      || '';
    return {
      backgroundUrl: bgUrl,
      mediaSlots,
      script: scriptWithFallback,
      style: enrichment.editorStyle || {},
      layout: enrichment.editorLayout || 'centered',
      aspectRatio,
      contentType: item.contentType,
      previewMode: true,
      // posterUrl is the last-resort fallback for compositions like
      // VideoHookComposition when every mediaSlot is empty. Without this,
      // VHD posts with no reconstructable video/image render solid black.
      posterUrl,
    };
  }, [mediaSlots, scriptWithFallback, enrichment.editorStyle, enrichment.editorLayout, aspectRatio, item, posterUrl]);
  // VIDEO_RE-guard the graphicUrls fallback so we never feed an image URL to
  // `<video src>` — that produces a silent black frame. When no real video
  // exists, we render the poster image instead (see the fallback branch below).
  const videoUrl = useMemo(() => {
    const v = resolveVideoUrl(item);
    if (v) return v;
    const first = item.graphicUrls?.[0];
    return first && VIDEO_RE.test(first) ? first : '';
  }, [item]);

  const frameWidth = isPortrait(aspectRatio) ? 360 : 640;

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2 border-b pb-4">
        <HeaderIcon className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{headerLabel}</h3>
        <Badge variant="secondary" className="ml-auto text-[10px]">
          {ASPECT_RATIO_LABELS[aspectRatio] || aspectRatio}
        </Badge>
      </div>

      {/* Empty-state guard: content type needs media but we could reconstruct none. */}
      {!anyMedia
        ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/20 py-12 text-center">
              <HeaderIcon className="mb-2 size-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No media yet</p>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground/70">
                {ctLabel(item.contentType)} posts need media before you can publish them.
              </p>
              <Button asChild size="sm" variant="outline" className="mt-4">
                <Link href={editorHref}>Open in editor</Link>
              </Button>
            </div>
          )
        : (
            <div className="space-y-3">
              {/* Recompile banner intentionally hidden.
                * Blitz posts render via the live Remotion pipeline, so the
                * "no baked-in overlays" warning is noise for the common case.
                * The compile action still exists on the standalone editor
                * page for users who need a downloadable MP4. */}

              {/* Gallery branch */}
              {useGallery && gallerySlides.length > 0 && (
                <div className="flex justify-center">
                  <GalleryPreview
                    slides={gallerySlides}
                    slideCopy={slideCopy as any}
                    aspectRatio={aspectRatio}
                    layout={(enrichment.editorLayout as string) || (SLIDE_TYPES.has(item.contentType) ? 'centered' : undefined)}
                    align={(enrichment.editorStyle as any)?.align as 'left' | 'center' | 'right' | undefined}
                    backgroundDimming={(enrichment.editorStyle as any)?.backgroundDimming as number | undefined}
                  />
                </div>
              )}

              {/* Video branch — Remotion whenever editor state exists.
                * `isCompiled` intentionally NOT gating here: per team memory
                * (isCompiled-not-video-signal, wysiwyg-output), the Remotion
                * live render is the source of truth for the preview and must
                * match the editor exactly. The compiled MP4 in graphicUrls[0]
                * is used for downloads / social publish only. */}
              {useVideoBranch && hasEditorState && remotionInputProps.backgroundUrl && (
                <div className="flex justify-center">
                  <div
                    className="relative overflow-hidden rounded-[2rem] border-[1.5px] border-white/[0.06] bg-neutral-900/40 shadow-2xl"
                    style={{ width: frameWidth, aspectRatio: aspectCss }}
                  >
                    <RemotionPreviewPlayer
                      contentType={item.contentType}
                      inputProps={remotionInputProps}
                    />
                  </div>
                </div>
              )}

              {/* Video branch — plain <video> only for items without any
                * editor state (legacy imports, plain publishes). Anything
                * that went through the editor renders via Remotion above. */}
              {useVideoBranch && !hasEditorState && videoUrl && (
                <div className="flex justify-center">
                  <div
                    className="relative overflow-hidden rounded-[2rem] border-[1.5px] border-white/[0.06] bg-neutral-900/40 shadow-2xl"
                    style={{ width: frameWidth, aspectRatio: aspectCss }}
                  >
                    <video
                      src={toVideoSrc(videoUrl)}
                      poster={posterUrl || undefined}
                      className="size-full object-contain"
                      controls
                      autoPlay
                      muted
                      loop
                      preload="none"
                      playsInline
                    />
                  </div>
                </div>
              )}

              {/* Video branch fallback — no editor state and no real video URL.
                * Instead of rendering a black `<video>` (which happens when a
                * poster JPG lands in `graphicUrls[0]` for a video-type post),
                * render the poster image. Mirrors PostCard's video-or-image
                * fallthrough pattern. */}
              {useVideoBranch && !hasEditorState && !videoUrl && posterUrl && (
                <div className="flex justify-center">
                  <div
                    className="relative overflow-hidden rounded-[2rem] border-[1.5px] border-white/[0.06] bg-neutral-900/40 shadow-lg"
                    style={{ width: frameWidth, aspectRatio: aspectCss }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={posterUrl}
                      alt="Content poster"
                      className="size-full object-cover"
                    />
                  </div>
                </div>
              )}

              {/* Image branch — non-gallery, non-video */}
              {!useVideoBranch && !useGallery && posterUrl && (
                <div className="flex justify-center">
                  <div className="w-full max-w-[360px] overflow-hidden rounded-[2rem] border-[1.5px] border-white/[0.06] bg-neutral-900/40 shadow-lg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={posterUrl}
                      alt="Content preview"
                      className="w-full object-contain"
                      style={{ aspectRatio: aspectCss }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
    </Card>
  );
}
