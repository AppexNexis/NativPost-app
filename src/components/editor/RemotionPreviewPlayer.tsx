// @ts-nocheck
import React from 'react';
import { useMemo } from 'react';
import { Player } from '@remotion/player';

import { TalkingHeadComposition } from './compositions/TalkingHeadComposition';
import { WallOfTextComposition } from './compositions/WallOfTextComposition';
import { TextMotionCard } from './compositions/TextMotionCard';
import { SlideshowComposition } from './compositions/SlideshowComposition';
import { GreenScreenComposition } from './compositions/GreenScreenComposition';
import { VideoHookComposition } from './compositions/VideoHookComposition';
import { UGCAdComposition } from './compositions/UGCAdComposition';
import { DataStoryComposition } from './compositions/DataStoryComposition';

// Map content types to Remotion composition components
const COMPOSITION_MAP: Record<string, React.ComponentType<any>> = {
  talking_head: TalkingHeadComposition,
  wall_of_text: WallOfTextComposition,
  text: TextMotionCard,
  slideshow: SlideshowComposition,
  green_screen: GreenScreenComposition,
  video_hook: VideoHookComposition,
  ugc: UGCAdComposition,
  data_story: DataStoryComposition,
};

// Default composition for unknown types
const DEFAULT_COMPOSITION = TextMotionCard;

interface RemotionPreviewPlayerProps {
  contentType: string;
  inputProps: Record<string, any>;
}

export function RemotionPreviewPlayer({ contentType, inputProps }: RemotionPreviewPlayerProps) {
  const Composition = COMPOSITION_MAP[contentType] || DEFAULT_COMPOSITION;

  const durationInFrames = useMemo(() => {
    const seconds = inputProps.timing?.totalSeconds || 10;
    return Math.max(1, Math.round(seconds * 30)); // 30 fps
  }, [inputProps.timing]);

  const { width, height } = useMemo(() => {
    const ar = inputProps.aspectRatio || '9:16';
    const [w, h] = ar.split(':').map(Number);
    if (!w || !h) return { width: 1080, height: 1920 };
    // Scale to 1080 width
    const scale = 1080 / w;
    return { width: Math.round(w * scale), height: Math.round(h * scale) };
  }, [inputProps.aspectRatio]);

  return (
    <div className="w-full">
      <Player
        component={Composition}
        inputProps={inputProps}
        durationInFrames={durationInFrames}
        compositionWidth={width}
        compositionHeight={height}
        fps={30}
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
