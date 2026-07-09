// @ts-nocheck
import React from 'react';
import { useMemo } from 'react';
import { Player } from '@remotion/player';

import { EditorComposition } from './compositions/EditorComposition';
import { SlideshowComposition } from './compositions/SlideshowComposition';
import { WallOfTextComposition } from './compositions/WallOfTextComposition';
import { TalkingHeadComposition } from './compositions/TalkingHeadComposition';
import { GreenScreenComposition } from './compositions/GreenScreenComposition';
import { VideoHookComposition } from './compositions/VideoHookComposition';
import { UGCAdComposition } from './compositions/UGCAdComposition';
import { DataStoryComposition } from './compositions/DataStoryComposition';
import { EDITOR_TOTAL_FRAMES, EDITOR_FPS } from '@/lib/editor-constants';

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

  return (
    <div className="w-full">
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
    </div>
  );
}
