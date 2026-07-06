import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff, Loader2, RefreshCw, Sparkles } from 'lucide-react';

import { useEditor } from './EditorContext';
import { PhoneMockup } from './PhoneMockup';
import { getEditorKind } from '@/lib/editor/content-type-registry';

/**
 * Image / Slideshow editor preview.
 *
 * Sibling of `EditorPreview` (which drives the Remotion video preview) — the
 * two are dispatched from `EditorLayout` based on `getEditorKind(contentType)`.
 * Image content types (single_image / slideshow / carousel / data_story)
 * render static DOM rather than a Remotion Player so slide navigation is
 * instant and the Image Engine's render pipeline is not tied to Remotion
 * timing.
 *
 * Behaviors:
 *  - single_image → shows `background.url` (or first slide as fallback).
 *  - slideshow / carousel / data_story → shows the current slide with
 *    prev/next arrows, dot indicators, and a thumbnail strip beneath the
 *    phone mockup. Overlaid script.hookText/bodyText/ctaText render on top.
 *  - Improve / Regen buttons mirror `EditorPreview` for parity.
 */
export function ImageEditorPreview() {
  const { state, dispatch } = useEditor();
  const [aiWorking, setAiWorking] = useState<'improve' | 'regenerate' | null>(null);

  const contentType = state.edit?.contentType || 'single_image';
  const slides = state.mediaSlots?.slides ?? [];
  const background = state.mediaSlots?.background;
  const slideCopy = state.script?.slideCopy ?? [];
  const layout = state.layout || 'centered';
  const isPerSlide = contentType !== 'single_image' && slides.length > 1;

  // Read a slide's caption from slideCopy — supports both string and
  // { text, durationSeconds } shapes. Fallback chain lets old rows that
  // still carry global body text remain readable.
  const readSlideCopy = (i: number): string => {
    const entry = slideCopy[i];
    if (typeof entry === 'string') return entry;
    if (entry && typeof entry === 'object') return entry.text || '';
    return '';
  };

  // For a single-image type, we render a synthetic single-slide array so the
  // rest of the component (indicators/nav) has a uniform shape.
  const displaySlides = useMemo(() => {
    if (contentType === 'single_image') {
      const url = background?.url || slides[0]?.url;
      return url ? [{ url }] : [];
    }
    return slides;
  }, [contentType, slides, background?.url]);

  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    // Reset to first slide if the current index falls off the end (slide
    // removed, or content type switched to single_image).
    if (activeIndex >= displaySlides.length) {
      setActiveIndex(0);
    }
  }, [displaySlides.length, activeIndex]);

  const slideCount = displaySlides.length;
  const activeSlide = displaySlides[activeIndex];
  const canNavigate = slideCount > 1;

  const goPrev = () => setActiveIndex(i => (i - 1 + slideCount) % slideCount);
  const goNext = () => setActiveIndex(i => (i + 1) % slideCount);

  // Regen / Improve — reuse the same /api/content/generate endpoint the video
  // editor uses; the split back into hook/body/cta matches EditorPreview.
  const handleAiAction = async (mode: 'improve' | 'regenerate') => {
    setAiWorking(mode);
    try {
      const caption = [state.script.hookText, state.script.bodyText, state.script.ctaText]
        .filter(Boolean)
        .join('\n\n');
      const topic = mode === 'improve'
        ? `Improve and sharpen this content:\n${caption}`
        : caption || 'General content';

      const res = await fetch('/api/content/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          contentType,
          targetPlatforms: state.targetPlatforms?.length ? state.targetPlatforms : ['instagram'],
          numVariants: 1,
          contentMode: state.contentMode || 'normal',
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const variant = data.variants?.[0];
      if (!variant) return;
      const full: string = variant.caption || '';
      const lines = full.split('\n').filter((l: string) => l.trim());
      dispatch({
        type: 'UPDATE_SCRIPT',
        payload: {
          hookText: lines[0] || state.script.hookText,
          bodyText: lines.slice(1, -1).join('\n') || state.script.bodyText,
          ctaText: lines[lines.length - 1] || state.script.ctaText,
        },
      });
    } finally {
      setAiWorking(null);
    }
  };

  // Guard: getEditorKind should always return 'image' when this component is
  // rendered, but if EditorLayout ever mounts us for the wrong kind we render
  // an inline note instead of silently misbehaving.
  const kind = getEditorKind(contentType);
  if (kind !== 'image') {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
        Image preview mounted for non-image content type ({contentType}).
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br from-muted/50 via-background to-muted/30">
      {/* Floating AI action buttons — parity with EditorPreview */}
      <div className="absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2">
        <button
          type="button"
          onClick={() => handleAiAction('improve')}
          disabled={aiWorking !== null}
          title="Improve with AI"
          className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card/90 px-2.5 py-2.5 text-[10px] font-medium text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
        >
          {aiWorking === 'improve' ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          Improve
        </button>
        <button
          type="button"
          onClick={() => handleAiAction('regenerate')}
          disabled={aiWorking !== null}
          title="Regenerate"
          className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card/90 px-2.5 py-2.5 text-[10px] font-medium text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-muted disabled:opacity-50"
        >
          {aiWorking === 'regenerate' ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Regen
        </button>
      </div>

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'radial-gradient(circle, currentColor 0.5px, transparent 0.5px)',
          backgroundSize: '20px 20px',
        }}
      />

      <div className="flex h-full max-h-[880px] w-auto flex-col items-center gap-3">
        <PhoneMockup>
          {/* Slide media */}
          {activeSlide?.url ? (
            <img
              src={activeSlide.url}
              alt={contentType === 'single_image' ? 'Image preview' : `Slide ${activeIndex + 1}`}
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-1 bg-neutral-950/60 text-white/40">
              <ImageOff className="size-8" />
              <span className="text-[11px]">No media yet</span>
            </div>
          )}

          {/* Full-bleed background dim scrim — sits between media and text so
              text stays legible even on busy source images. WYSIWYG: mirrors
              SlideshowComposition.tsx exactly. */}
          {activeSlide?.url && (state.style?.backgroundDimming ?? 0) > 0 && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundColor: `rgba(0,0,0,${state.style?.backgroundDimming ?? 0})`,
              }}
            />
          )}

          {/* Text overlay — for multi-slide image kinds, we render only the
              per-slide caption at the position dictated by state.layout. For
              single_image we still show hook/body/cta together. */}
          {activeSlide?.url && (() => {
            const align = (state.style?.align as 'left' | 'center' | 'right') || 'center';
            const fontWeight = state.style?.weight === 'bold' ? 700 : 400;
            const fontStyle = state.style?.italic ? 'italic' : 'normal';
            const textDecoration = state.style?.underline ? 'underline' : 'none';
            const baseFontFamily = state.style?.fontFamily || 'Inter';
            const baseColor = state.style?.color || '#ffffff';

            // Position class from state.layout — mirrors SlideshowComposition.
            const positionClass = (() => {
              switch (layout) {
                case 'bottom_caption':
                  return 'items-center justify-end pb-14';
                case 'top_caption':
                  return 'items-center justify-start pt-14';
                case 'wall_of_text':
                  return 'items-center justify-center';
                case 'centered':
                default:
                  return 'items-center justify-center';
              }
            })();

            const alignItemsClass =
              align === 'left' ? 'items-start text-left'
              : align === 'right' ? 'items-end text-right'
              : 'items-center text-center';

            if (isPerSlide) {
              const caption = readSlideCopy(activeIndex) || state.script.bodyText || '';
              if (!caption) return null;
              const isWall = layout === 'wall_of_text';
              return (
                <div
                  className={`absolute inset-0 flex flex-col gap-3 px-6 ${positionClass} ${alignItemsClass}`}
                  style={{
                    fontFamily: baseFontFamily,
                    color: baseColor,
                    textAlign: align,
                  }}
                >
                  <div
                    className="rounded-md px-3 py-2"
                    style={{
                      backgroundColor: state.style?.backgroundColor || 'transparent',
                      fontSize: (state.style?.fontSize || 20) * (isWall ? 0.7 : 0.5),
                      fontWeight,
                      fontStyle,
                      textDecoration,
                      lineHeight: 1.3,
                      maxWidth: isWall ? '95%' : '90%',
                    }}
                  >
                    {caption}
                  </div>
                </div>
              );
            }

            // single_image / fallback: keep hook/body/cta layered
            if (!state.script.hookText && !state.script.bodyText && !state.script.ctaText) {
              return null;
            }
            return (
              <div
                className={`absolute inset-0 flex flex-col gap-3 px-6 ${positionClass} ${alignItemsClass}`}
                style={{
                  fontFamily: baseFontFamily,
                  color: baseColor,
                  textAlign: align,
                }}
              >
                {state.script.hookText && (
                  <div
                    className="rounded-md px-3 py-2"
                    style={{
                      backgroundColor: state.style?.backgroundColor || 'transparent',
                      fontSize: (state.style?.fontSize || 20) * 0.6,
                      fontWeight,
                      fontStyle,
                      textDecoration,
                      lineHeight: 1.2,
                    }}
                  >
                    {state.script.hookText}
                  </div>
                )}
                {state.script.bodyText && (
                  <div
                    className="rounded-md px-3 py-1.5"
                    style={{
                      backgroundColor: state.style?.backgroundColor || 'transparent',
                      fontSize: (state.style?.fontSize || 20) * 0.45,
                      fontWeight,
                      fontStyle,
                      textDecoration,
                      lineHeight: 1.35,
                      maxWidth: '92%',
                    }}
                  >
                    {state.script.bodyText}
                  </div>
                )}
                {state.script.ctaText && (
                  <div
                    className="rounded-full px-3 py-1"
                    style={{
                      backgroundColor: state.style?.ctaBackgroundColor || 'rgba(255,255,255,0.15)',
                      fontSize: (state.style?.fontSize || 20) * 0.45,
                      fontWeight: 600,
                    }}
                  >
                    {state.script.ctaText}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Prev / Next arrows */}
          {canNavigate && (
            <>
              <button
                type="button"
                onClick={goPrev}
                className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white/90 transition hover:bg-black/60"
                aria-label="Previous slide"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={goNext}
                className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white/90 transition hover:bg-black/60"
                aria-label="Next slide"
              >
                <ChevronRight className="size-4" />
              </button>

              {/* Dot indicators */}
              <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
                {displaySlides.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActiveIndex(i)}
                    aria-label={`Go to slide ${i + 1}`}
                    className={`h-1.5 rounded-full transition-all ${
                      i === activeIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/50'
                    }`}
                  />
                ))}
              </div>
            </>
          )}

          {state.isSaving && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[11px] text-white/70">
              Saving&hellip;
            </div>
          )}
        </PhoneMockup>

        {/* Thumbnail strip — jump to any slide */}
        {slideCount > 1 && (
          <div className="flex max-w-[400px] flex-wrap items-center justify-center gap-2 px-4">
            {displaySlides.map((slide, i) => (
              <button
                key={`${slide.url}-${i}`}
                type="button"
                onClick={() => setActiveIndex(i)}
                aria-label={`Preview slide ${i + 1}`}
                className={`relative size-11 shrink-0 overflow-hidden rounded-md border-2 transition ${
                  i === activeIndex
                    ? 'border-primary shadow-sm'
                    : 'border-transparent opacity-60 hover:opacity-100'
                }`}
              >
                {slide.url && (
                  <img
                    src={slide.url}
                    alt={`Slide ${i + 1} thumbnail`}
                    className="size-full object-cover"
                  />
                )}
                <span className="absolute bottom-0 right-0 rounded-tl bg-black/60 px-1 text-[9px] text-white/90">
                  {i + 1}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
