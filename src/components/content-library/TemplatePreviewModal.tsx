'use client';

import { ChevronLeft, ChevronRight, ExternalLink, Eye, Heart, Play, X } from 'lucide-react';
import { useState } from 'react';

import { getHdVideoUrl, getVideoPosterUrl, isCloudinaryVideoUrl } from '@/lib/cloudinary';
import type { ContentTemplate } from '@/types/v2';
import { formatCount, formatLabel } from '@/utils/format';

import { TemplateCategoryPill } from './TemplateCategoryPill';

type TemplatePreviewModalProps = {
  template: ContentTemplate;
  onClose: () => void;
  onRemix: (template: ContentTemplate) => void;
};

export function TemplatePreviewModal({ template, onClose, onRemix }: TemplatePreviewModalProps) {
  const mediaUrl = template.mediaUrl || template.thumbnailUrl;
  const isPlayable = isCloudinaryVideoUrl(mediaUrl) || isDirectVideoFile(mediaUrl);
  const posterUrl = getVideoPosterUrl(template.thumbnailUrl, { width: 720, height: 1280 });
  const videoSrc = isPlayable ? getHdVideoUrl(mediaUrl) : null;

  const slides = getSlideUrls(template);
  const [activeSlide, setActiveSlide] = useState(0);

  const hasSlides = slides.length > 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close preview"
      />
      <div
        className="relative z-10 flex w-full max-w-4xl flex-col gap-4 overflow-hidden rounded-2xl bg-card p-4 shadow-2xl md:flex-row md:p-6"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
        >
          <X className="size-4" />
        </button>

        {/* Media */}
        <div className="relative mx-auto aspect-[9/16] w-full max-w-[320px] overflow-hidden rounded-xl bg-black md:mx-0">
          {isPlayable && videoSrc ? (
            <video
              src={videoSrc}
              poster={posterUrl}
              controls
              muted
              playsInline
              preload="metadata"
              className="size-full object-cover"
            />
          ) : hasSlides ? (
            <SlideViewer
              slides={slides}
              activeIndex={activeSlide}
              onPrevious={() => setActiveSlide(i => Math.max(0, i - 1))}
              onNext={() => setActiveSlide(i => Math.min(slides.length - 1, i + 1))}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={posterUrl}
              alt={template.contentType}
              className="size-full object-cover"
            />
          )}
        </div>

        {/* Info */}
        <div className="flex flex-1 flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-card-foreground">
                  {formatLabel(template.contentType)}
                </h3>
                <p className="mt-1 text-sm capitalize text-muted-foreground">
                  {template.sourcePlatform}
                </p>
              </div>
              <TemplateCategoryPill template={template} className="bg-primary/10 text-primary" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Stat label="Views" value={formatCount(template.viewCount)} icon={Eye} />
              <Stat label="Likes" value={formatCount(template.likeCount)} icon={Heart} />
              <Stat label="Remixes" value={formatCount(template.remixCount)} icon={Play} />
            </div>

            {hasSlides && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Slides
                </p>
                <div className="flex flex-wrap gap-2">
                  {slides.map((url, idx) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setActiveSlide(idx)}
                      className={`relative size-12 overflow-hidden rounded-lg border-2 ${
                        idx === activeSlide ? 'border-primary' : 'border-transparent'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={getVideoPosterUrl(url, { width: 120, height: 120 })}
                        alt={`Slide ${idx + 1}`}
                        className="size-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {template.angles.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Angles
                </p>
                <div className="flex flex-wrap gap-2">
                  {template.angles.map(angle => (
                    <span
                      key={angle}
                      className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
                    >
                      {angle}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-col gap-3 md:mt-0">
            <button
              type="button"
              onClick={() => onRemix(template)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Play className="size-4 fill-current" />
              Remix This Template
            </button>
            <a
              href={template.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <ExternalLink className="size-4" />
              View Source
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function SlideViewer({
  slides,
  activeIndex,
  onPrevious,
  onNext,
}: {
  slides: string[];
  activeIndex: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="relative size-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={getVideoPosterUrl(slides[activeIndex], { width: 720, height: 1280 })}
        alt={`Slide ${activeIndex + 1} of ${slides.length}`}
        className="size-full object-contain"
      />
      <div className="absolute inset-x-0 top-3 flex justify-center">
        <span className="rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
          {activeIndex + 1}
          {' '}
          /
          {slides.length}
        </span>
      </div>
      {activeIndex > 0 && (
        <button
          type="button"
          onClick={onPrevious}
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white transition-colors hover:bg-black/70"
          aria-label="Previous slide"
        >
          <ChevronLeft className="size-5" />
        </button>
      )}
      {activeIndex < slides.length - 1 && (
        <button
          type="button"
          onClick={onNext}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-1.5 text-white transition-colors hover:bg-black/70"
          aria-label="Next slide"
        >
          <ChevronRight className="size-5" />
        </button>
      )}
    </div>
  );
}

function getSlideUrls(template: ContentTemplate): string[] {
  if (Array.isArray(template.thumbnailUrls) && template.thumbnailUrls.length > 0) {
    return template.thumbnailUrls;
  }
  if (template.thumbnailUrls && typeof template.thumbnailUrls === 'object') {
    return Object.values(template.thumbnailUrls);
  }
  return [];
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-xl bg-muted p-3 text-center">
      <Icon className="mx-auto mb-1 size-4 text-muted-foreground" />
      <div className="text-lg font-bold text-card-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function isDirectVideoFile(url?: string | null): boolean {
  if (!url) {
    return false;
  }
  return /\.(mp4|mov|webm|ogg|mkv)(\?.*)?$/i.test(url);
}
