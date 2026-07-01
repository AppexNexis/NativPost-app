// @ts-nocheck
import React from 'react';
import { useMemo } from 'react';
import { Player } from '@remotion/player';

import { EditorComposition } from './compositions/EditorComposition';
import { EDITOR_TOTAL_FRAMES, EDITOR_FPS } from '@/lib/editor-constants';

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
