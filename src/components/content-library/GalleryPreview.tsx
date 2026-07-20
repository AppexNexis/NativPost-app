'use client';

/**
 * GalleryPreview — swipeable image gallery for image-kind content
 * (slideshow / carousel / data_story) on the content detail page when a
 * compiled MP4 does not yet exist.
 *
 * Prior behavior branched into `<video src={graphicUrls[0]}>` for these
 * content types (they share `VIDEO_CONTENT_TYPES` via the shared
 * classifier), which silently reduced a multi-slide deck to slide 1
 * rendered as a broken video element. This component surfaces every
 * slide with prev/next arrows, dot indicators, and an optional caption
 * overlay per slide sourced from `script.slideCopy`.
 *
 * View-only — no Swiper dependency; hand-rolled useState is enough.
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { SlideView } from './SlideView';

type SlideCopyEntry = string | { text: string; durationSeconds?: number };

type GalleryPreviewProps = {
  slides: string[];
  slideCopy?: Array<SlideCopyEntry> | undefined;
  aspectRatio?: '9:16' | '1:1' | '16:9' | string | null;
  /**
   * Editor-selected layout for the caption overlay. Detail page reads this
   * from `enrichmentData.editorLayout` and forwards it here so the compiled
   * gallery WYSIWYG-matches the editor preview. Missing / unknown values
   * fall back to the historical bottom-caption behavior.
   */
  layout?: 'centered' | 'bottom_caption' | 'top_caption' | 'wall_of_text' | string | null;
  /**
   * Horizontal alignment for the caption text, sourced from
   * `enrichmentData.editorStyle.align`. Missing → 'center'.
   */
  align?: 'left' | 'center' | 'right' | string | null;
  /**
   * 0..1 dim scrim applied above the slide image and below the caption
   * overlay — mirrors the editor's ImageEditorPreview / SlideshowComposition
   * behavior so the compiled gallery WYSIWYG-matches what the user set in
   * the Layout tab. Sourced from `enrichmentData.editorStyle.backgroundDimming`.
   */
  backgroundDimming?: number | null;
  /**
   * Caption box background color from editorStyle.backgroundColor.
   * When set to a non-transparent value, renders a rounded box behind
   * the caption text matching the editor preview. Default transparent
   * means no box — stroke+shadow provide legibility.
   */
  captionBackgroundColor?: string | null;
  /**
   * Font size from editorStyle.fontSize. When not set, uses existing
   * Tailwind text-sm (14px) / text-xl (20px) defaults.
   */
  fontSize?: number | null;
};

const ASPECT_TO_CSS: Record<string, string> = {
  '9:16': '9/16',
  '1:1': '1/1',
  '16:9': '16/9',
  '3:4': '3/4',
  '2:3': '2/3',
  '4:5': '4/5',
};

function frameWidthFor(aspect: string): number {
  // Portrait framings get a narrower frame so the detail page mirrors
  // the editor preview shell (~360px). Landscape/square get 640px.
  if (aspect === '9:16' || aspect === '3:4' || aspect === '2:3' || aspect === '4:5') return 360;
  return 640;
}

function normalizeCopy(entry: SlideCopyEntry | undefined): string {
  if (!entry) return '';
  if (typeof entry === 'string') return entry;
  return entry.text ?? '';
}

export function GalleryPreview({ slides, slideCopy, aspectRatio, layout, align, backgroundDimming, captionBackgroundColor, fontSize }: GalleryPreviewProps) {
  const total = slides.length;
  const [index, setIndex] = useState(0);

  const aspectKey = aspectRatio || '1:1';
  const aspectCss = ASPECT_TO_CSS[aspectKey] ?? '1/1';
  const frameWidth = frameWidthFor(aspectKey);

  const goPrev = useCallback(() => {
    setIndex(i => (i - 1 + total) % total);
  }, [total]);

  const goNext = useCallback(() => {
    setIndex(i => (i + 1) % total);
  }, [total]);

  // Keyboard arrow navigation — only wire when the gallery has >1 slide.
  useEffect(() => {
    if (total <= 1) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [total, goPrev, goNext]);

  if (total === 0) {
    return (
      <div
        className="relative flex items-center justify-center overflow-hidden rounded-[2rem] border-[1.5px] border-white/[0.06] bg-neutral-900/40 text-xs text-white/60 shadow-2xl"
        style={{ width: frameWidth, aspectRatio: aspectCss }}
      >
        No slides
      </div>
    );
  }

  const currentUrl = slides[index]!;
  const caption = normalizeCopy(slideCopy?.[index]);
  const showArrows = total > 1;

  return (
    <div
      className="group relative overflow-hidden rounded-[2rem] border-[1.5px] border-white/[0.06] bg-neutral-900/40 shadow-2xl"
      style={{ width: frameWidth, aspectRatio: aspectCss }}
    >
      <SlideView
        backgroundUrl={currentUrl}
        text={caption}
        layout={layout}
        align={align}
        backgroundDimming={backgroundDimming}
        captionBackgroundColor={captionBackgroundColor}
        fontSize={fontSize}
      />

      {/* Prev / Next arrows — mirror TemplateCard styling. */}
      {showArrows && (
        <>
          <button
            type="button"
            aria-label="Previous slide"
            onClick={goPrev}
            className="absolute left-2 top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur-sm transition-opacity duration-200 hover:bg-black/70 group-hover:opacity-100"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={goNext}
            className="absolute right-2 top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur-sm transition-opacity duration-200 hover:bg-black/70 group-hover:opacity-100"
          >
            <ChevronRight className="size-4" />
          </button>

          {/* Dot indicators */}
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[5] flex justify-center gap-1">
            {slides.map((_, idx) => (
              <span
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  idx === index ? 'w-4 bg-white' : 'w-1.5 bg-white/50'
                }`}
              />
            ))}
          </div>

          {/* Slide counter, top-right */}
          <div className="pointer-events-none absolute right-3 top-3 z-[5] rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            {index + 1} / {total}
          </div>
        </>
      )}
    </div>
  );
}
