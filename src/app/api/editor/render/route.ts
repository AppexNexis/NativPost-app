/**
 * POST /api/editor/render
 *
 * Server-side proxy to the video engine's /render/editor-video endpoint.
 *
 * IMPORTANT: This route exists because NATIVPOST_ENGINE_API_KEY is server-only
 * (no NEXT_PUBLIC_ prefix). Calling the engine directly from a client component
 * (e.g. EditorLayout.tsx) sends an empty Bearer token and the engine 401s.
 * The 401 was silently swallowed by the publish handler, causing every
 * "Schedule & Publish" to degrade to the raw-URLs / CSS-overlay fallback.
 *
 * The browser hits this internal route, the session cookie authenticates the
 * user, and we then attach the engine API key server-side.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { VIDEO_ENGINE_URL, engineAuthHeaders } from '@/lib/ai-studio/engine';

const VALID_ASPECT_RATIOS = new Set(['9:16', '1:1', '16:9']);

export async function POST(request: NextRequest) {
  const { error } = await getAuthContext();
  if (error) return error;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { script, style, layout, aspectRatio, contentType, backgroundUrl, hookVideoUrl, slides, audioTrack } = body as {
    script?: Record<string, unknown>;
    style?: Record<string, unknown>;
    layout?: string;
    aspectRatio?: string;
    contentType?: string;
    backgroundUrl?: string;
    hookVideoUrl?: string;
    slides?: Array<{ url: string }>;
    audioTrack?: {
      name?: string;
      url: string;
      publicId?: string;
      source?: string;
      volume?: number;
    } | null;
  };

  if (!script || typeof script !== 'object') {
    return NextResponse.json({ error: 'script object required' }, { status: 400 });
  }
  if (aspectRatio && !VALID_ASPECT_RATIOS.has(aspectRatio)) {
    return NextResponse.json({ error: `Invalid aspectRatio "${aspectRatio}". Must be one of: ${[...VALID_ASPECT_RATIOS].join(', ')}` }, { status: 400 });
  }

  try {
    const res = await fetch(`${VIDEO_ENGINE_URL}/render/editor-video`, {
      method: 'POST',
      headers: engineAuthHeaders(),
      body: JSON.stringify({
        script,
        style: style || {},
        layout: layout || 'centered',
        aspectRatio: aspectRatio || '9:16',
        contentType: contentType || 'text',
        backgroundUrl,
        hookVideoUrl,
        slides: slides || [],
        audioTrack: audioTrack && audioTrack.url ? audioTrack : null,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[Editor Render Proxy] Engine returned', res.status, text);
      return NextResponse.json({ error: `Engine render failed (${res.status})`, detail: text }, { status: 502 });
    }

    // Engine returns 202 { jobId } — client polls
    // /api/editor/render/status/:jobId for progress/completion.
    // Legacy sync response { url, publicId } is still forwarded for
    // backwards compatibility if the engine is running an older build.
    const data = await res.json();
    if (data.jobId) {
      return NextResponse.json({ jobId: data.jobId }, { status: 202 });
    }
    return NextResponse.json({
      url: data.url,
      publicId: data.publicId,
      compositionId: data.compositionId,
    });
  } catch (err) {
    console.error('[Editor Render Proxy] Failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
