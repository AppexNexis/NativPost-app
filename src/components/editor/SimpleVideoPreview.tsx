'use client';

import React, { useRef, useState } from 'react';
import Image from 'next/image';
import { Film, Pause, Play, Volume2, VolumeX } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Script = {
  hookText?: string;
  bodyText?: string;
  ctaText?: string;
};

type Style = {
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
  align?: 'left' | 'center' | 'right';
  weight?: 'normal' | 'bold';
  italic?: boolean;
  underline?: boolean;
};

type MediaSlot = { url: string; assetType?: string };
type MediaSlots = {
  background?: MediaSlot;
  hookVideo?: MediaSlot;
  demoVideo?: MediaSlot;
  slides?: MediaSlot[];
};

interface SimpleVideoPreviewProps {
  contentType: string;
  script: Script;
  style: Style;
  mediaSlots: MediaSlots;
  aspectRatio?: string;
  layout?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isVideo(slot?: MediaSlot): boolean {
  if (!slot?.url) return false;
  if (slot.assetType === 'video') return true;
  return /\.(mp4|mov|webm)$/i.test(slot.url);
}

function aspectClass(ar: string): string {
  if (ar === '1:1') return 'aspect-square';
  if (ar === '16:9') return 'aspect-video';
  return 'aspect-[9/16]'; // default 9:16
}

function maxWidthClass(ar: string): string {
  if (ar === '16:9') return 'max-w-full';
  if (ar === '1:1') return 'max-w-xs';
  return 'max-w-full'; // 9:16 fills phone mockup
}

// ---------------------------------------------------------------------------
// SimpleVideoPreview
// ---------------------------------------------------------------------------
export function SimpleVideoPreview({
  contentType,
  script,
  style,
  mediaSlots,
  aspectRatio = '9:16',
  layout = 'centered',
}: SimpleVideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);

  const bg = mediaSlots.background;
  const bgIsVideo = isVideo(bg);

  const textStyle: React.CSSProperties = {
    fontFamily: style.fontFamily || 'Inter',
    fontSize: `${style.fontSize || 20}px`,
    color: style.color || '#ffffff',
    backgroundColor: style.backgroundColor || 'rgba(0,0,0,0.5)',
    textAlign: style.align || 'center',
    fontWeight: style.weight === 'bold' ? 'bold' : 'normal',
    fontStyle: style.italic ? 'italic' : 'normal',
    textDecoration: style.underline ? 'underline' : 'none',
    lineHeight: 1.25,
    padding: '8px 12px',
    borderRadius: '6px',
    wordBreak: 'break-word',
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (playing) {
      videoRef.current.pause();
      setPlaying(false);
    } else {
      videoRef.current.play();
      setPlaying(true);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !muted;
    setMuted(!muted);
  };

  // Determine text overlay position by layout
  const textPositionClass: Record<string, string> = {
    centered: 'inset-0 flex items-center justify-center p-4',
    bottom_caption: 'bottom-0 left-0 right-0 p-3',
    top_caption: 'top-0 left-0 right-0 p-3',
    split_screen: 'bottom-0 left-0 right-0 p-3',
    wall_of_text: 'inset-0 flex items-center justify-center p-4',
    talking_head: 'bottom-0 left-0 right-0 p-3',
    green_screen: 'bottom-0 left-0 right-0 p-3',
    video_hook: 'bottom-0 left-0 right-0 p-3',
  };
  const overlayClass = textPositionClass[layout] || 'inset-0 flex items-center justify-center p-4';

  const activeText = script.hookText || script.bodyText || script.ctaText;

  return (
    <div className={`relative mx-auto w-full ${maxWidthClass(aspectRatio)}`}>
      <div className={`relative overflow-hidden rounded-2xl bg-black shadow-2xl ${aspectClass(aspectRatio)}`}>
        {/* Background media */}
        {bg?.url ? (
          bgIsVideo ? (
            <video
              ref={videoRef}
              src={bg.url}
              className="absolute inset-0 size-full object-cover"
              muted={muted}
              loop
              autoPlay
              playsInline
              data-editor-preview-video
              onEnded={() => setPlaying(false)}
            />
          ) : (
            <Image
              src={bg.url}
              alt="Background"
              fill
              className="object-cover"
              sizes="400px"
              unoptimized
            />
          )
        ) : (
          /* Placeholder */
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-muted to-muted/60">
            <Film className="mb-3 size-12 text-muted-foreground/30" strokeWidth={1} />
            <p className="text-xs text-muted-foreground/50">No background media</p>
          </div>
        )}

        {/* Text overlay */}
        {activeText && (
          <div className={`absolute z-10 ${overlayClass}`}>
            <div style={{ maxWidth: '90%' }}>
              {script.hookText && (
                <p style={{ ...textStyle, marginBottom: script.bodyText ? '8px' : 0 }}>
                  {script.hookText}
                </p>
              )}
              {script.bodyText && (
                <p style={{ ...textStyle, fontSize: `${Math.max(14, (style.fontSize || 20) * 0.7)}px`, marginBottom: script.ctaText ? '8px' : 0 }}>
                  {script.bodyText}
                </p>
              )}
              {script.ctaText && (
                <p style={{ ...textStyle, fontSize: `${Math.max(12, (style.fontSize || 20) * 0.6)}px`, backgroundColor: 'rgba(var(--primary-rgb),0.85)' }}>
                  {script.ctaText}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Content-type specific second slot (hook video) */}
        {['video_hook', 'ugc', 'talking_head'].includes(contentType) && mediaSlots.hookVideo?.url && (
          <div className="absolute bottom-16 left-2 right-2 z-10 overflow-hidden rounded-xl shadow-lg" style={{ maxHeight: '35%' }}>
            {isVideo(mediaSlots.hookVideo) ? (
              <video
                src={mediaSlots.hookVideo.url}
                className="w-full object-cover"
                muted
                loop
                autoPlay
                playsInline
              />
            ) : (
              <Image src={mediaSlots.hookVideo.url} alt="Hook" fill className="object-cover" sizes="200px" unoptimized />
            )}
          </div>
        )}

        {/* Slideshow preview (first 3 slides) */}
        {contentType === 'slideshow' && (mediaSlots.slides?.length ?? 0) > 0 && (
          <div className="absolute bottom-2 left-2 right-2 z-10 flex gap-1">
            {(mediaSlots.slides || []).slice(0, 3).map((slide, i) => (
              <div key={i} className="relative flex-1 overflow-hidden rounded-md" style={{ aspectRatio: '1/1' }}>
                <Image src={slide.url} alt={`Slide ${i + 1}`} fill className="object-cover" sizes="80px" unoptimized />
              </div>
            ))}
          </div>
        )}

        {/* Video controls (only when background is video) */}
        {bgIsVideo && (
          <div className="absolute bottom-2 right-2 z-20 flex items-center gap-1">
            <button
              onClick={toggleMute}
              className="rounded-full bg-black/50 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
            >
              {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
            </button>
            <button
              onClick={togglePlay}
              className="rounded-full bg-black/50 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
            >
              {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
