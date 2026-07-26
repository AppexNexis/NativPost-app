import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getContentPostDraft, saveContentPostDraft } from '@/lib/msi/content-draft-service';

type RouteParams = { params: Promise<{ jobId: string }> };

// GET /api/admin/msi/jobs/[jobId]/draft
// The brief + current draft behind a content_post job. Staff-gated (/api/admin).
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { error } = await getAuthContext();
  if (error) {
    return error;
  }
  const { jobId } = await params;
  const draft = await getContentPostDraft(jobId);
  if (!draft) {
    return NextResponse.json({ error: 'Not a content_post job' }, { status: 404 });
  }
  return NextResponse.json(draft, { status: 200 });
}

// POST /api/admin/msi/jobs/[jobId]/draft  { caption?, contentType?, graphicUrls? }
// An operator saves the drafted post onto the linked content_item.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { error } = await getAuthContext();
  if (error) {
    return error;
  }
  const { jobId } = await params;
  const body = await request.json().catch(() => ({}));

  const patch: { caption?: string; contentType?: string; graphicUrls?: string[] } = {};
  if (typeof body.caption === 'string') {
    patch.caption = body.caption;
  }
  if (typeof body.contentType === 'string') {
    patch.contentType = body.contentType;
  }
  if (Array.isArray(body.graphicUrls)) {
    patch.graphicUrls = body.graphicUrls.filter((u: unknown): u is string => typeof u === 'string');
  }

  const draft = await saveContentPostDraft(jobId, patch);
  if (!draft) {
    return NextResponse.json({ error: 'Not a content_post job' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, draft }, { status: 200 });
}
