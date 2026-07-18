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

export function GalleryPreview({ slides, slideCopy, aspectRatio, layout, align, backgroundDimming }: GalleryPreviewProps) {
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
      {/* Slide image */}
      <img
        src={currentUrl}
        alt={`Slide ${index + 1} of ${total}`}
        className="size-full object-cover"
      />

      {/* Full-bleed dim scrim — mirrors ImageEditorPreview so users see the
          same dim they picked in the Layout tab. Sits between image and
          caption overlay so text stays legible. */}
      {typeof backgroundDimming === 'number' && backgroundDimming > 0 && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundColor: `rgba(0,0,0,${Math.min(1, Math.max(0, backgroundDimming))})` }}
        />
      )}

      {/* Optional caption overlay when slideCopy has content for this index.
          Positioning mirrors the editor's ImageEditorPreview + Slideshow
          composition: caption goes to top / center / bottom / full-bleed
          depending on the editor's chosen layout, and horizontal alignment
          follows the editor's align choice. */}
      {caption && (() => {
        const alignKey = (align === 'left' || align === 'right' || align === 'center')
          ? align : 'center';
        const textAlignClass =
          alignKey === 'left' ? 'text-left'
          : alignKey === 'right' ? 'text-right'
          : 'text-center';

        // Position based on layout. No background gradient/scrim — legibility
        // comes from `WebkitTextStroke` + `textShadow` on the caption itself,
        // matching the PostCard grid overlay (source of truth: PostCard.tsx).
        let containerClass: string;
        let innerClass: string;
        switch (layout) {
          case 'top_caption':
            containerClass = 'absolute inset-x-0 top-0 flex items-start justify-center p-4';
            innerClass = `w-full ${textAlignClass}`;
            break;
          case 'centered':
            containerClass = 'absolute inset-0 flex items-center justify-center p-6';
            innerClass = `w-full ${textAlignClass}`;
            break;
          case 'wall_of_text':
            containerClass = 'absolute inset-0 flex items-center justify-center p-4';
            innerClass = `w-full ${textAlignClass}`;
            break;
          case 'bottom_caption':
          default:
            containerClass = 'absolute inset-x-0 bottom-0 flex items-end justify-center p-4';
            innerClass = `w-full ${textAlignClass}`;
            break;
        }

        const isWall = layout === 'wall_of_text';
        return (
          <div className={`pointer-events-none ${containerClass}`}>
            <p
              className={`${innerClass} font-bold leading-snug text-white ${
                isWall ? 'line-clamp-none text-xl md:text-2xl' : 'line-clamp-5 text-sm'
              }`}
              style={{ WebkitTextStroke: '1px black', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
            >
              {caption}
            </p>
          </div>
        );
      })()}

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
