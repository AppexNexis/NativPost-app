/**
 * Shared timing constants for the editor preview & render pipeline.
 *
 * Both `@remotion/player` (preview) and the engine-side
 * `@remotion/renderer` MUST agree on duration & fps. Previously this 8s/30fps
 * value was hard-coded in three independent places.
 *
 * The engine-side composition keeps its own constants in
 * `NativPost-engine/video-renderer/src/compositions/EditorComposition.tsx`
 * — they must be kept in sync with the values here.
 */

export const EDITOR_FIXED_DURATION_SECONDS = 8;
export const EDITOR_FPS = 30;
export const EDITOR_TOTAL_FRAMES = EDITOR_FIXED_DURATION_SECONDS * EDITOR_FPS;
