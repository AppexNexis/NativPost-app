'use client';

import { Play } from 'lucide-react';
import { useState } from 'react';

import type { GuideVideo as GuideVideoType } from '@/lib/learn/types';
import { resolveVideoPoster, resolveVideoSrc } from '@/lib/learn/video';
import { cn } from '@/utils/Helpers';

/**
 * Click-to-play guide video.
 *
 * Deliberately does not autoplay or preload: these are 20-30 MB files and the
 * learning centre lists several at once. The poster is a Cloudinary-generated
 * frame, so nothing but an image is fetched until someone actually presses
 * play.
 *
 * Renders nothing when the source can't be resolved (Cloudinary unconfigured,
 * or the video not uploaded yet) — a guide is still perfectly readable without
 * its video, so an unresolved source degrades to text rather than to a broken
 * player.
 */
export function GuideVideo({
  video,
  className,
  rounded = 'rounded-xl',
}: {
  video: GuideVideoType | undefined;
  className?: string;
  rounded?: string;
}) {
  const [playing, setPlaying] = useState(false);

  const src = resolveVideoSrc(video?.src);
  const poster = resolveVideoPoster(video);

  if (!src) {
    return null;
  }

  return (
    <div className={cn('relative overflow-hidden bg-neutral-900', rounded, className)}>
      {playing
        ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              src={src}
              poster={poster ?? undefined}
              className="size-full object-cover"
              controls
              autoPlay
              playsInline
            />
          )
        : (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              className="group relative block size-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Play video"
            >
              {poster
                ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={poster} alt="" className="size-full object-cover" loading="lazy" />
                  )
                : (
                    <span className="block size-full bg-gradient-to-br from-primary/30 via-neutral-900 to-neutral-900" />
                  )}

              <span className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/30">
                <span className="flex size-14 items-center justify-center rounded-full bg-white/95 shadow-lg transition-transform group-hover:scale-105">
                  <Play className="ml-0.5 size-5 fill-neutral-900 text-neutral-900" />
                </span>
              </span>

              {video?.duration && (
                <span className="absolute bottom-2.5 right-2.5 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[11px] font-medium text-white">
                  {video.duration}
                </span>
              )}
            </button>
          )}
    </div>
  );
}
