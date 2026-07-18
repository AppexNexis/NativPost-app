// @ts-nocheck
import React from 'react';
import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Player } from '@remotion/player';

import { useInView } from '@/hooks/useInView';
import { EDITOR_TOTAL_FRAMES, EDITOR_FPS } from '@/lib/editor-constants';

// Dynamic imports — before this change, every RemotionPreviewPlayer mount
// pulled all 8 composition modules into the initial JS even though only one
// runs per content type. `ssr: false` because Remotion compositions use
// `useVideoConfig` / `useCurrentFrame` hooks that don't work server-side.
const EditorComposition = dynamic(() => import('./compositions/EditorComposition').then(m => m.EditorComposition), { ssr: false });
const SlideshowComposition = dynamic(() => import('./compositions/SlideshowComposition').then(m => m.SlideshowComposition), { ssr: false });
const WallOfTextComposition = dynamic(() => import('./compositions/WallOfTextComposition').then(m => m.WallOfTextComposition), { ssr: false });
const TalkingHeadComposition = dynamic(() => import('./compositions/TalkingHeadComposition').then(m => m.TalkingHeadComposition), { ssr: false });
const GreenScreenComposition = dynamic(() => import('./compositions/GreenScreenComposition').then(m => m.GreenScreenComposition), { ssr: false });
const VideoHookComposition = dynamic(() => import('./compositions/VideoHookComposition').then(m => m.VideoHookComposition), { ssr: false });
const UGCAdComposition = dynamic(() => import('./compositions/UGCAdComposition').then(m => m.UGCAdComposition), { ssr: false });
const DataStoryComposition = dynamic(() => import('./compositions/DataStoryComposition').then(m => m.DataStoryComposition), { ssr: false });

// Per-content-type Remotion composition dispatch. Each composition file has
// existed for a while but was never wired — RemotionPreviewPlayer used to
// route every content type through EditorComposition, which was video-shaped
// and blanked slideshows out completely. See lib/editor/content-type-registry
// for the enum this table mirrors.
const COMPOSITION_BY_TYPE: Record<string, React.ComponentType<any>> = {
  slideshow: SlideshowComposition,
  carousel: SlideshowComposition,
  data_story: DataStoryComposition,
  wall_of_text: WallOfTextComposition,
  talking_head: TalkingHeadComposition,
  green_screen: GreenScreenComposition,
  video_hook: VideoHookComposition,
  video_hook_demo: VideoHookComposition,
  ugc: UGCAdComposition,
  // reel + single_image fall through to the universal EditorComposition,
  // which handles a plain background + text overlays.
  reel: EditorComposition,
  single_image: EditorComposition,
};

interface RemotionPreviewPlayerProps {
  contentType: string;
  inputProps: Record<string, any>;
}

export function RemotionPreviewPlayer({ contentType, inputProps }: RemotionPreviewPlayerProps) {
  const Composition = COMPOSITION_BY_TYPE[contentType] || EditorComposition;

  const { width, height } = useMemo(() => {
    const ar = inputProps.aspectRatio || '9:16';
    const [w, h] = ar.split(':').map(Number);
    if (!w || !h) return { width: 1080, height: 1920 };
    const scale = 1080 / w;
    return { width: Math.round(w * scale), height: Math.round(h * scale) };
  }, [inputProps.aspectRatio]);

  // Viewport gate — don't mount the 1080x1920 Player (with its offscreen
  // canvas + composition tree) until the container is near the viewport.
  // Before this, embedding a Player in grid contexts allocated a full
  // decoder + comp tree per row even when off-screen.
  const [containerRef, inView] = useInView<HTMLDivElement>({ rootMargin: '400px', once: true });

  const posterUrl = inputProps.posterUrl || inputProps.backgroundUrl || '';

  return (
    <div ref={containerRef} className="w-full">
      {inView ? (
        <Player
          component={Composition}
          inputProps={inputProps}
          durationInFrames={EDITOR_TOTAL_FRAMES}
          compositionWidth={width}
          compositionHeight={height}
          fps={EDITOR_FPS}
          controls
          style={{
            width: '100%',
            borderRadius: '12px',
          }}
          autoPlay
          loop
        />
      ) : (
        // Poster placeholder — matches Player's rounded container so there's
        // no layout shift when the Player hydrates.
        posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={posterUrl}
            alt=""
            loading="lazy"
            className="w-full"
            style={{ borderRadius: '12px', aspectRatio: `${width} / ${height}`, objectFit: 'cover' }}
          />
        ) : (
          <div
            className="w-full bg-neutral-900/40"
            style={{ borderRadius: '12px', aspectRatio: `${width} / ${height}` }}
          />
        )
      )}
    </div>
  );
}
