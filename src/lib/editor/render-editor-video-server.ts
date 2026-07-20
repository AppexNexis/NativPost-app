/**
 * Server-side helper: render an editor composition via the video engine.
 *
 * Mirrors src/lib/editor/render-editor-video.ts but works server-side:
 *  - Uses absolute VIDEO_ENGINE_URL (not relative /api/editor/render).
 *  - Uses AbortController for timeout instead of setInterval.
 *  - No RenderProgressCallback (server callers don't stream progress to UI).
 *
 * Engine flow (same as browser helper):
 *   POST /render/editor-video        → 202 { jobId }
 *   GET  /render/editor-video/status/:jobId → { status, percent, url?, error? }
 *
 * Legacy sync engines that respond with { url } are handled transparently.
 */

import { VIDEO_ENGINE_URL, engineAuthHeaders } from '@/lib/ai-studio/engine';
import type { RenderEditorVideoInput } from './render-editor-video';

export class RenderTimeoutError extends Error {
  constructor(public readonly elapsedMs: number) {
    super(`Render timed out after ${elapsedMs}ms`);
    this.name = 'RenderTimeoutError';
  }
}

const POLL_MS = 2_000;
const DEFAULT_ABORT_MS = 240_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Kick off a render job and poll until complete.
 *
 * @returns The compiled video URL.
 * @throws {RenderTimeoutError} If the job doesn't finish within the timeout.
 * @throws {Error} If the engine fails or returns an error status.
 */
export async function renderEditorVideoServer(
  input: RenderEditorVideoInput,
  opts?: { abortMs?: number },
): Promise<string> {
  const abortMs = opts?.abortMs ?? DEFAULT_ABORT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), abortMs);

  try {
    // ── Start the render job ────────────────────────────────────────────
    const startRes = await fetch(`${VIDEO_ENGINE_URL}/render/editor-video`, {
      method: 'POST',
      signal: controller.signal,
      headers: engineAuthHeaders(),
      body: JSON.stringify({
        script: input.script,
        style: input.style || {},
        layout: input.layout || 'centered',
        aspectRatio: input.aspectRatio || '9:16',
        contentType: input.contentType || 'text',
        backgroundUrl: input.mediaSlots?.background?.url,
        hookVideoUrl: input.mediaSlots?.hookVideo?.url,
        slides: input.mediaSlots?.slides || [],
        audioTrack: input.audioTrack?.url ? input.audioTrack : null,
      }),
    });

    if (!startRes.ok) {
      const text = await startRes.text().catch(() => '');
      throw new Error(`Engine render failed (${startRes.status}): ${text || 'no response body'}`);
    }

    const data = await startRes.json() as Record<string, unknown>;

    // ── Async path (jobId) ──────────────────────────────────────────────
    if (data.jobId) {
      return pollEditorRenderJobServer(data.jobId as string, abortMs);
    }

    // ── Legacy sync path ────────────────────────────────────────────────
    if (!data.url) throw new Error('Engine returned no url');
    return data.url as string;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Poll a render job until it terminates.
 */
async function pollEditorRenderJobServer(
  jobId: string,
  abortMs: number,
): Promise<string> {
  const started = Date.now();

  while (true) {
    const elapsed = Date.now() - started;
    if (elapsed >= abortMs) {
      throw new RenderTimeoutError(elapsed);
    }

    await sleep(POLL_MS);

    const sres = await fetch(
      `${VIDEO_ENGINE_URL}/render/editor-video/status/${encodeURIComponent(jobId)}`,
      {
        headers: engineAuthHeaders(),
        cache: 'no-store',
      },
    );

    if (!sres.ok) {
      if (sres.status === 404) throw new Error('Render job expired or lost');
      continue; // transient error — retry on next poll
    }

    const s = await sres.json() as {
      status?: string;
      percent?: number;
      url?: string;
      error?: string;
    };

    if (s.status === 'complete') {
      if (!s.url) throw new Error('Engine reported complete but returned no url');
      return s.url;
    }
    if (s.status === 'failed') {
      throw new Error(s.error || 'Render failed');
    }
    // else 'rendering' | 'uploading' — keep polling
  }
}
