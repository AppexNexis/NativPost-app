'use client';

import { ChevronLeft, ChevronRight, Eye, Heart, Images, Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { getOptimizedVideoUrl, getVideoPosterUrl, isCloudinaryVideoUrl } from '@/lib/cloudinary';
import { parseTemplateSlides } from '@/lib/content/template-slides';
import type { ContentTemplate } from '@/types/v2';
import { formatCount } from '@/utils/format';

import { TemplateCategoryPill } from './TemplateCategoryPill';

type TemplateCardProps = {
  template: ContentTemplate;
  onRemix: (template: ContentTemplate) => void;
};

export function TemplateCard({ template, onRemix }: TemplateCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [imageError, setImageError] = useState(false);

  const mediaUrl = template.mediaUrl || template.thumbnailUrl;
  const isPlayable = isCloudinaryVideoUrl(mediaUrl) || isDirectVideoFile(mediaUrl);
  const videoSrc = isPlayable ? getOptimizedVideoUrl(mediaUrl) : null;

  // Normalized ordered slide URLs — see @/lib/content/template-slides for the
  // Record<string,string> | string[] normalization rules (shared with the
  // Create page mediaSlots builder so preview + editor stay in sync).
  const slides = useMemo(
    () => parseTemplateSlides(template.thumbnailUrls),
    [template.thumbnailUrls],
  );

  const slideCount = slides.length;
  // Only enable carousel navigation for multi-slide, non-video content.
  // Playable videos keep the hover-to-play behavior instead.
  const isCarousel = !isPlayable && slideCount > 1;
  const [activeSlide, setActiveSlide] = useState(0);

  // Preserve original single-poster behavior for videos + single-image posts.
  const singlePosterUrl = getVideoPosterUrl(template.thumbnailUrl, { width: 608, height: 1080 });
  const carouselSlideUrl = isCarousel
    ? getVideoPosterUrl(slides[activeSlide] ?? template.thumbnailUrl, {
        width: 608,
        height: 1080,
      })
    : singlePosterUrl;
  const posterUrl = isCarousel ? carouselSlideUrl : singlePosterUrl;

  const goPrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveSlide(s => (s - 1 + slideCount) % slideCount);
  };
  const goNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveSlide(s => (s + 1) % slideCount);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (isHovered && isPlayable) {
      video.currentTime = 0;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Autoplay blocked or failed; poster remains visible.
        });
      }
    } else {
      video.pause();
    }
  }, [isHovered, isPlayable]);

  // Reset the broken-image flag when the active slide changes so one bad
  // slide doesn't hide all subsequent ones.
  useEffect(() => {
    setImageError(false);
  }, [activeSlide]);

  return (
    <div
      className="group relative overflow-hidden rounded-2xl bg-muted shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 9:16 media container */}
      <div className="relative aspect-[9/16] w-full overflow-hidden bg-secondary/5">
        {isPlayable && videoSrc ? (
          <video
            ref={videoRef}
            src={videoSrc}
            poster={imageError ? undefined : posterUrl}
            muted
            loop
            playsInline
            preload="metadata"
            className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={() => setImageError(true)}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={isCarousel ? `slide-${activeSlide}` : 'single'}
            src={imageError ? undefined : posterUrl}
            alt={template.contentType}
            className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            onError={() => setImageError(true)}
          />
        )}

        {/* Carousel navigation — only for multi-slide, non-video content. */}
        {isCarousel && (
          <>
            <button
              type="button"
              aria-label="Previous slide"
              onClick={goPrev}
              className="absolute left-2 top-1/2 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur-sm transition-opacity duration-200 hover:bg-black/70 group-hover:opacity-100"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next slide"
              onClick={goNext}
              className="absolute right-2 top-1/2 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white opacity-0 backdrop-blur-sm transition-opacity duration-200 hover:bg-black/70 group-hover:opacity-100"
            >
              <ChevronRight className="size-4" />
            </button>

            {/* Slide indicator dots — pointer-events-none so clicks on
                dots don't steal focus from the underlying tile. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-12 z-[5] flex justify-center gap-1">
              {slides.map((_, idx) => (
                <span
                  key={idx}
                  className={`h-1.5 rounded-full transition-all duration-200 ${
                    idx === activeSlide
                      ? 'w-4 bg-white'
                      : 'w-1.5 bg-white/50'
                  }`}
                />
              ))}
            </div>
          </>
        )}

        {/* Top overlay row */}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <div className="flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
            <Eye className="size-3" />
            <span>{formatCount(template.viewCount)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {slideCount > 1 && (
              <div className="flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
                <Images className="size-3" />
                <span>{slideCount}</span>
              </div>
            )}
            <TemplateCategoryPill template={template} />
          </div>
        </div>

        {/* Bottom overlay row */}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-3">
          <div className="flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
            <Heart className="size-3" />
            <span>{formatCount(template.likeCount)}</span>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemix(template);
            }}
            className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground opacity-0 shadow-lg transition-all duration-200 hover:bg-primary/90 group-hover:opacity-100"
          >
            <Play className="size-3 fill-current" />
            Remix
          </button>
        </div>
      </div>
    </div>
  );
}

function isDirectVideoFile(url?: string | null): boolean {
  if (!url) {
    return false;
  }
  return /\.(mp4|mov|webm|ogg|mkv)(\?.*)?$/i.test(url);
}
