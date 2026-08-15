/**
 * Measure a media asset's real duration in the browser.
 *
 * The editor pipeline had no notion of how long an uploaded video was — no
 * field on MediaSlot, no probe anywhere — so every composition fell back to a
 * hard-coded 8 seconds and silently truncated the upload. This is the
 * measurement that closes that gap: it runs at selection time, before the
 * duration matters, so preview and render both receive a real number.
 *
 * Uses a detached HTMLMediaElement with `preload="metadata"`, so only the
 * container header is fetched — not the whole file. A 200 MB video costs a few
 * KB to measure.
 */

import { EDITOR_MAX_DURATION_SECONDS } from '@/lib/editor-constants';

/** How long to wait for metadata before giving up. */
const PROBE_TIMEOUT_MS = 15_000;

export class MediaTooLongError extends Error {
  readonly durationSeconds: number;

  constructor(durationSeconds: number) {
    super(
      `This video is ${Math.round(durationSeconds)}s long. The maximum is `
      + `${EDITOR_MAX_DURATION_SECONDS}s — please trim it before uploading.`,
    );
    this.name = 'MediaTooLongError';
    this.durationSeconds = durationSeconds;
  }
}

/**
 * Duration of a video/audio URL in seconds, or null when it cannot be
 * determined (CORS, an unsupported container, a timeout).
 *
 * Returning null rather than throwing is deliberate: a probe failure must not
 * block the user from using their media. The caller falls back to the minimum
 * duration, which is the old behaviour — degraded, but not broken.
 */
export function probeMediaDuration(
  url: string,
  kind: 'video' | 'audio' = 'video',
): Promise<number | null> {
  if (typeof document === 'undefined' || !url) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const el = document.createElement(kind);
    let settled = false;

    const cleanup = () => {
      el.removeAttribute('src');
      el.load?.();
    };

    const finish = (value: number | null) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), PROBE_TIMEOUT_MS);

    el.preload = 'metadata';
    // Cloudinary serves permissive CORS; anonymous keeps this working for
    // cross-origin media without tainting anything (we read no pixels).
    el.crossOrigin = 'anonymous';
    el.muted = true;

    el.onloadedmetadata = () => {
      const d = el.duration;
      // Some containers report Infinity until a seek is attempted.
      finish(Number.isFinite(d) && d > 0 ? d : null);
    };
    el.onerror = () => finish(null);

    el.src = url;
  });
}

/**
 * Probe and enforce the ceiling in one step.
 *
 * Throws `MediaTooLongError` for anything over the maximum so the caller can
 * surface a real message. Silently trimming instead is the behaviour that
 * published wrong content, so it is not an option here.
 */
export async function probeAndValidateVideo(url: string): Promise<number | null> {
  const duration = await probeMediaDuration(url, 'video');
  if (duration !== null && duration > EDITOR_MAX_DURATION_SECONDS) {
    throw new MediaTooLongError(duration);
  }
  return duration;
}
