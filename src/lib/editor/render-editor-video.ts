/**
 * Client helper: kick off an /api/editor/render job and poll to completion.
 *
 * Engine flow:
 *   POST /api/editor/render                  → 202 { jobId }
 *   GET  /api/editor/render/status/:jobId    → { status, percent, url?, error? }
 *
 * Legacy engines that still respond synchronously with { url } are handled
 * transparently — the helper returns immediately in that case.
 */

export type RenderStage = 'rendering' | 'uploading';

export type RenderEditorVideoInput = {
  script: any;
  style: any;
  layout: string;
  aspectRatio: string;
  mediaSlots: any;
  contentType: string;
  audioTrack?: {
    name?: string;
    url: string;
    publicId?: string;
    source?: 'original' | 'library' | 'upload';
    volume?: number;
  } | null;
};

export type RenderProgressCallback = (percent: number, stage: RenderStage) => void;

const POLL_MS = 1500;
const TIMEOUT_MS = 10 * 60 * 1000;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export async function renderEditorVideo(
  input: RenderEditorVideoInput,
  onProgress?: RenderProgressCallback,
): Promise<string> {
  const res = await fetch('/api/editor/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      script: input.script,
      style: input.style,
      layout: input.layout,
      aspectRatio: input.aspectRatio,
      contentType: input.contentType,
      backgroundUrl: input.mediaSlots?.background?.url,
      hookVideoUrl: input.mediaSlots?.hookVideo?.url,
      slides: input.mediaSlots?.slides,
      audioTrack: input.audioTrack ?? null,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Engine render failed (${res.status}): ${text || 'no response body'}`);
  }
  const data = await res.json();

  // ── Async path
  if (data.jobId) {
    return pollEditorRenderJob(data.jobId as string, onProgress);
  }

  // ── Legacy sync path
  if (!data.url) throw new Error('Engine returned no url');
  return data.url as string;
}

/**
 * Poll a job until it terminates. Exposed separately so callers that
 * already hold a jobId (e.g. resumed from a previous session) can join
 * without re-posting.
 */
export async function pollEditorRenderJob(
  jobId: string,
  onProgress?: RenderProgressCallback,
): Promise<string> {
  const started = Date.now();
  while (true) {
    if (Date.now() - started > TIMEOUT_MS) {
      throw new Error('Render timed out after 10 minutes');
    }
    await sleep(POLL_MS);

    const sres = await fetch(`/api/editor/render/status/${encodeURIComponent(jobId)}`, {
      cache: 'no-store',
    });
    if (!sres.ok) {
      if (sres.status === 404) throw new Error('Render job expired or lost');
      continue;
    }
    const s = await sres.json();
    const pct = typeof s.percent === 'number' ? s.percent : 0;
    const stage: RenderStage = s.status === 'uploading' ? 'uploading' : 'rendering';
    onProgress?.(pct, stage);

    if (s.status === 'complete') {
      if (!s.url) throw new Error('Engine reported complete but returned no url');
      return s.url as string;
    }
    if (s.status === 'failed') {
      throw new Error(s.error || 'Render failed');
    }
  }
}
