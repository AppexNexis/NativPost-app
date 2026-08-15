/**
 * Shared timing + audio policy for the editor preview & render pipeline.
 *
 * Both `@remotion/player` (preview) and the engine-side `@remotion/renderer`
 * MUST agree on duration, fps and audio mixing, or the editor shows one thing
 * and the published MP4 is another.
 *
 * ── The bug this file exists to prevent ────────────────────────────────────
 * Duration used to be a flat `8` here and a second flat `8` in the engine, and
 * the only input that could extend it was the Blitz voice-over length. An
 * uploaded video's own duration was never measured or consulted, so ANY
 * upload — 30s, 3 minutes — rendered as 8 looping seconds with its audio
 * muted. Two independent constants meant fixing one still shipped the other.
 *
 * `resolveEditorDurationSeconds` is now the ONLY thing that decides how long an
 * editor video runs. The engine has a byte-identical twin in
 * `NativPost-engine/video-renderer/src/compositions/EditorComposition.tsx`
 * (`calcDurationEditor`). Change one, change both — the tests in
 * editor-constants.test.ts pin the behaviour on this side.
 */

export const EDITOR_FPS = 30;

/**
 * Floor for a silent, image-backed composition — enough to read the overlay
 * text. This is the old `EDITOR_FIXED_DURATION_SECONDS`; it is now a MINIMUM,
 * never a cap.
 */
export const EDITOR_MIN_DURATION_SECONDS = 8;

/**
 * Hard ceiling on a render. Covers Reels (90s), YouTube Shorts (60s) and
 * typical TikTok lengths with headroom.
 *
 * Uploads longer than this are REJECTED at selection time with a message
 * asking the user to trim — deliberately not silently truncated, because
 * silent truncation is exactly what shipped wrong content to clients.
 */
export const EDITOR_MAX_DURATION_SECONDS = 180;

/** Legacy alias — retained so existing imports keep compiling. */
export const EDITOR_FIXED_DURATION_SECONDS = EDITOR_MIN_DURATION_SECONDS;

/** Frame budget for a silent, image-only composition. */
export const EDITOR_TOTAL_FRAMES = EDITOR_MIN_DURATION_SECONDS * EDITOR_FPS;

export type EditorDurationInput = {
  /** Duration of the background/hook video, when one is present. */
  mediaDurationSeconds?: number | null;
  /** Blitz voice-over length. */
  voiceoverDurationMs?: number | null;
};

/**
 * How long an editor composition runs, in seconds.
 *
 * The longest real input wins, floored at the readable minimum and capped at
 * the ceiling: a 30s video with a 6s voice-over runs 30s; a 4s clip still runs
 * the 8s minimum so the overlay text is readable; a 10-minute upload is capped
 * (and should have been rejected upstream — see EDITOR_MAX_DURATION_SECONDS).
 */
export function resolveEditorDurationSeconds({
  mediaDurationSeconds,
  voiceoverDurationMs,
}: EditorDurationInput): number {
  const media = typeof mediaDurationSeconds === 'number' && mediaDurationSeconds > 0
    ? mediaDurationSeconds
    : 0;
  const voice = typeof voiceoverDurationMs === 'number' && voiceoverDurationMs > 0
    ? voiceoverDurationMs / 1000
    : 0;

  const longest = Math.max(media, voice, EDITOR_MIN_DURATION_SECONDS);
  return Math.min(EDITOR_MAX_DURATION_SECONDS, longest);
}

/** The same decision, in frames. */
export function resolveEditorDurationFrames(input: EditorDurationInput): number {
  return Math.round(resolveEditorDurationSeconds(input) * EDITOR_FPS);
}

// ── Audio policy ───────────────────────────────────────────────────────────
//
// A video's own audio is content, not decoration. It plays by default; music
// is ADDITIVE on top. Neither silences the other — the user mutes each
// independently.

/** Default volume (0-100) for an uploaded video's own audio track. */
export const DEFAULT_ORIGINAL_AUDIO_VOLUME = 100;

/** Default volume (0-100) for added background music, mixed under the original. */
export const DEFAULT_MUSIC_VOLUME = 45;

/** Clamp a 0-100 UI volume into Remotion's 0..1 scale. */
export function toRemotionVolume(volume: number | null | undefined, fallback: number): number {
  const raw = typeof volume === 'number' ? volume : fallback;
  return Math.max(0, Math.min(1, raw / 100));
}
