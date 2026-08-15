// @ts-nocheck
import React from 'react';
import { useMemo } from 'react';
import { Player } from '@remotion/player';

import { EditorComposition } from './compositions/EditorComposition';
import { SlideshowComposition } from './compositions/SlideshowComposition';
import { DataStoryComposition } from './compositions/DataStoryComposition';
import { EDITOR_FPS, resolveEditorDurationSeconds } from '@/lib/editor-constants';

// Per-content-type Remotion composition dispatch. See
// lib/editor/content-type-registry for the enum this table mirrors.
//
// WYSIWYG CONTRACT: the engine publishes EVERY editor video through its
// `EditorComposition` — `/render/editor-video` (render.ts) selects the
// composition purely by aspectRatio (EditorVideo-vertical/square/landscape),
// NOT by contentType. That composition scales fontSize * 1.5 for the 1080px
// render space. The per-type overlay compositions below use a RAW fontSize,
// so previewing ugc/video_hook/talking_head/green_screen/wall_of_text through
// them made the preview text ~1.5x smaller than the published MP4 (and drifted
// the layout). wall_of_text is NOT a distinct engine composition either: the
// engine EditorComposition treats it as a 'centered' layout case, so it must
// preview through EditorComposition too. All background+text-overlay video
// types therefore preview through EditorComposition — the byte-for-byte mirror
// of what actually publishes. Only slideshow/carousel/data_story keep dedicated
// compositions (image-kind: they publish via the Image Engine, not this path).
const COMPOSITION_BY_TYPE: Record<string, React.ComponentType<any>> = {
  slideshow: SlideshowComposition,
  carousel: SlideshowComposition,
  data_story: DataStoryComposition,
  // Overlay-video types — background media + baked text overlays. These publish
  // via the engine EditorComposition, so their preview MUST use it too.
  wall_of_text: EditorComposition,
  talking_head: EditorComposition,
  green_screen: EditorComposition,
  video_hook: EditorComposition,
  video_hook_demo: EditorComposition,
  ugc: EditorComposition,
  reel: EditorComposition,
  single_image: EditorComposition,
};

interface RemotionPreviewPlayerProps {
  contentType: string;
  inputProps: Record<string, any>;
}

/**
 * Pull the longest real video duration out of the media slots.
 *
 * Background is the usual driver, but a hook/demo/face clip can be the only
 * video present, so the composition has to run for the longest of them or the
 * others get cut off mid-shot.
 */
function longestSlotDurationSeconds(mediaSlots: Record<string, any> | undefined): number {
  if (!mediaSlots) {
    return 0;
  }
  const candidates = [
    mediaSlots.background,
    mediaSlots.hookVideo,
    mediaSlots.demoVideo,
    mediaSlots.faceVideo,
  ];
  let longest = 0;
  for (const slot of candidates) {
    const d = slot?.durationSeconds;
    if (typeof d === 'number' && d > longest) {
      longest = d;
    }
  }
  return longest;
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

  // Composition duration = the longest real input, floored at the readable
  // minimum and capped at the ceiling. Uses the SAME resolver the render
  // payload uses, and mirrors the engine's calcDurationEditor, so the preview
  // and the published MP4 cannot disagree (WYSIWYG contract).
  //
  // This used to read ONLY `audioDurationMs`, so an uploaded video with no
  // voice-over always rendered as 8 looping seconds no matter its real length.
  const { durationInFrames, durationSeconds } = useMemo(() => {
    const mediaDurationSeconds = longestSlotDurationSeconds(inputProps.mediaSlots);
    const seconds = resolveEditorDurationSeconds({
      mediaDurationSeconds,
      voiceoverDurationMs: inputProps.audioDurationMs,
    });
    return {
      durationInFrames: Math.round(seconds * EDITOR_FPS),
      durationSeconds: seconds,
    };
  }, [inputProps.mediaSlots, inputProps.audioDurationMs]);

  // Inject durationSeconds into inputProps so per-type compositions
  // reading it (EditorComposition today; per-type ones as they migrate)
  // stretch their totalFrames to match the outer Player.
  const extendedInputProps = useMemo(
    () => (durationSeconds !== undefined ? { ...inputProps, durationSeconds } : inputProps),
    [inputProps, durationSeconds],
  );

  return (
    <Player
      component={Composition}
      inputProps={extendedInputProps}
      durationInFrames={durationInFrames}
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
  );
}
