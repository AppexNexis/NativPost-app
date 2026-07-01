/**
 * GET /api/editor/render/status/:jobId
 *
 * Polls the video engine for the current progress of an async render job
 * started by POST /api/editor/render. Same auth model as the render proxy —
 * this route attaches the engine API key server-side so the browser never
 * sees it.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { VIDEO_ENGINE_URL, engineAuthHeaders } from '@/lib/ai-studio/engine';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { error } = await getAuthContext();
  if (error) return error;

  const { jobId } = await params;
  if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 });

  try {
    const res = await fetch(`${VIDEO_ENGINE_URL}/render/editor-video/status/${encodeURIComponent(jobId)}`, {
      method: 'GET',
      headers: engineAuthHeaders(),
      cache: 'no-store',
    });

    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json({ error: `Engine status ${res.status}`, detail: text }, { status: 502 });
    }
    try {
      return NextResponse.json(JSON.parse(text));
    } catch {
      return NextResponse.json({ error: 'Engine returned non-JSON', detail: text }, { status: 502 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
