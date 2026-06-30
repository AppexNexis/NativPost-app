// @ts-nocheck
import React from 'react';
import { useMemo } from 'react';
import { Player } from '@remotion/player';

import { EditorComposition } from './compositions/EditorComposition';

// All content types use the universal EditorComposition which accepts
// the full editor state (script, style, layout, mediaSlots, aspectRatio)
// and renders text overlays directly into the video frames.
const DEFAULT_COMPOSITION = EditorComposition;

interface RemotionPreviewPlayerProps {
  contentType: string;
  inputProps: Record<string, any>;
}

export function RemotionPreviewPlayer({ contentType, inputProps }: RemotionPreviewPlayerProps) {
  const Composition = DEFAULT_COMPOSITION;

  // 6 seconds at 30fps (matches engine's FIXED_DURATION_SECONDS)
  const durationInFrames = useMemo(() => {
    return 6 * 30;
  }, []);

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
