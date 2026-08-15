import { describe, expect, it } from 'vitest';

import {
  EDITOR_FPS,
  EDITOR_MAX_DURATION_SECONDS,
  EDITOR_MIN_DURATION_SECONDS,
  resolveEditorDurationFrames,
  resolveEditorDurationSeconds,
  toRemotionVolume,
} from './editor-constants';

/**
 * These pin the duration policy that the engine's `calcDurationEditor` mirrors.
 * If a change here is intentional, the twin in
 * `NativPost-engine/video-renderer/src/compositions/EditorComposition.tsx`
 * must change with it — that drift is what published 8-second cuts of
 * 30-second uploads.
 */
describe('resolveEditorDurationSeconds', () => {
  it('runs for the full length of an uploaded video — the regression that lost clients', () => {
    expect(resolveEditorDurationSeconds({ mediaDurationSeconds: 30 })).toBe(30);
    expect(resolveEditorDurationSeconds({ mediaDurationSeconds: 47.5 })).toBe(47.5);
  });

  it('never truncates a long video to the old 8s default', () => {
    const seconds = resolveEditorDurationSeconds({ mediaDurationSeconds: 30 });

    expect(seconds).not.toBe(EDITOR_MIN_DURATION_SECONDS);
    expect(seconds).toBeGreaterThan(EDITOR_MIN_DURATION_SECONDS);
  });

  it('floors a very short clip at the readable minimum', () => {
    expect(resolveEditorDurationSeconds({ mediaDurationSeconds: 3 })).toBe(EDITOR_MIN_DURATION_SECONDS);
  });

  it('falls back to the minimum when there is no media and no voice-over', () => {
    expect(resolveEditorDurationSeconds({})).toBe(EDITOR_MIN_DURATION_SECONDS);
    expect(resolveEditorDurationSeconds({ mediaDurationSeconds: null, voiceoverDurationMs: null }))
      .toBe(EDITOR_MIN_DURATION_SECONDS);
  });

  it('lets the longest input win when video and voice-over disagree', () => {
    // Long video, short voice-over → the video decides.
    expect(resolveEditorDurationSeconds({ mediaDurationSeconds: 30, voiceoverDurationMs: 6000 })).toBe(30);
    // Short video, long voice-over → the voice-over decides, so it isn't cut off.
    expect(resolveEditorDurationSeconds({ mediaDurationSeconds: 10, voiceoverDurationMs: 22_000 })).toBe(22);
  });

  it('still honours a voice-over on its own (the old behaviour)', () => {
    expect(resolveEditorDurationSeconds({ voiceoverDurationMs: 12_000 })).toBe(12);
  });

  it('no longer caps at the old 15s ceiling', () => {
    expect(resolveEditorDurationSeconds({ voiceoverDurationMs: 40_000 })).toBe(40);
  });

  it('caps at the hard ceiling', () => {
    expect(resolveEditorDurationSeconds({ mediaDurationSeconds: 600 })).toBe(EDITOR_MAX_DURATION_SECONDS);
  });

  it('ignores nonsense durations rather than producing a zero-length render', () => {
    expect(resolveEditorDurationSeconds({ mediaDurationSeconds: 0 })).toBe(EDITOR_MIN_DURATION_SECONDS);
    expect(resolveEditorDurationSeconds({ mediaDurationSeconds: -5 })).toBe(EDITOR_MIN_DURATION_SECONDS);
    expect(resolveEditorDurationSeconds({ voiceoverDurationMs: Number.NaN }))
      .toBe(EDITOR_MIN_DURATION_SECONDS);
  });
});

describe('resolveEditorDurationFrames', () => {
  it('converts to whole frames at the editor fps', () => {
    expect(resolveEditorDurationFrames({ mediaDurationSeconds: 30 })).toBe(30 * EDITOR_FPS);
    expect(resolveEditorDurationFrames({})).toBe(EDITOR_MIN_DURATION_SECONDS * EDITOR_FPS);
  });

  it('always returns an integer frame count', () => {
    expect(Number.isInteger(resolveEditorDurationFrames({ mediaDurationSeconds: 12.345 }))).toBe(true);
  });
});

describe('toRemotionVolume', () => {
  it('maps 0-100 onto Remotion 0..1', () => {
    expect(toRemotionVolume(100, 100)).toBe(1);
    expect(toRemotionVolume(50, 100)).toBe(0.5);
    expect(toRemotionVolume(0, 100)).toBe(0);
  });

  it('uses the fallback when unset, so audio is never accidentally silent', () => {
    expect(toRemotionVolume(undefined, 100)).toBe(1);
    expect(toRemotionVolume(null, 45)).toBe(0.45);
  });

  it('clamps out-of-range values', () => {
    expect(toRemotionVolume(150, 100)).toBe(1);
    expect(toRemotionVolume(-20, 100)).toBe(0);
  });
});
