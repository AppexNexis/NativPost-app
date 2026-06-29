import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { contentEditSchema } from '@/models/Schema';

const route = { GET: get, POST: post, PATCH: patch, DELETE: del };
export { route as GET, route as POST, route as PATCH, route as DELETE };

// ---------------------------------------------------------------------------
// GET /api/content/edit/[id] or /api/content/edit
// ---------------------------------------------------------------------------
async function get(_: NextRequest, context: { params: Promise<{ id?: string }> }) {
  const { orgId } = await getAuthContext();
  if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = await getDb();
  const { id } = await context.params;

  // List all active edits for this org (no id provided)
  if (!id) {
    const rows = await db
      .select()
      .from(contentEditSchema)
      .where(eq(contentEditSchema.orgId, orgId))
      .orderBy(contentEditSchema.createdAt);
    return NextResponse.json({ edits: rows });
  }

  // Single edit with related content item and template
  const row = await db
    .select()
    .from(contentEditSchema)
    .where(eq(contentEditSchema.id, id))
    .then((r) => r[0]);

  if (!row || row.orgId !== orgId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ edit: row });
}

// ---------------------------------------------------------------------------
// POST /api/content/edit — create a new edit session
// ---------------------------------------------------------------------------
async function post(req: NextRequest) {
  const { orgId, userId } = await getAuthContext();
  if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json()) as Partial<{
    source: 'remix' | 'generate' | 'manual';
    contentItemId: string;
    templateId: string;
    contentType: string;
    contentMode: string;
    targetPlatforms: string[];
    aspectRatio: string;
    script: Record<string, unknown>;
    style: Record<string, unknown>;
    layout: string;
    timing: Record<string, unknown>;
    mediaSlots: Record<string, unknown>;
    audioTrack: Record<string, unknown>;
    enrichment: Record<string, unknown>;
    brandProfileSnapshot: Record<string, unknown>;
  }>;

  const db = await getDb();

  const row = await db
    .insert(contentEditSchema)
    .values({
      orgId,
      userId: userId || 'unknown',
      source: body.source || 'manual',
      contentItemId: body.contentItemId || null,
      templateId: body.templateId || null,
      contentType: body.contentType || 'text',
      contentMode: body.contentMode || 'normal',
      targetPlatforms: body.targetPlatforms || [],
      aspectRatio: body.aspectRatio || '9:16',
      script: body.script || {},
      style: body.style || {},
      layout: body.layout || 'centered',
      timing: body.timing || {},
      mediaSlots: body.mediaSlots || {},
      audioTrack: body.audioTrack || null,
      enrichment: body.enrichment || {},
      brandProfileSnapshot: body.brandProfileSnapshot || {},
    })
    .returning();

  return NextResponse.json({ edit: row[0] }, { status: 201 });
}

// ---------------------------------------------------------------------------
// PATCH /api/content/edit/[id] — update an edit session
// ---------------------------------------------------------------------------
async function patch(req: NextRequest, context: { params: Promise<{ id?: string }> }) {
  const { orgId } = await getAuthContext();
  if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const body = (await req.json()) as Record<string, unknown>;
  const db = await getDb();

  // Verify ownership
  const existing = await db
    .select()
    .from(contentEditSchema)
    .where(eq(contentEditSchema.id, id))
    .then((r) => r[0]);

  if (!existing || existing.orgId !== orgId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Only allow updating editable fields
  const allowed: Record<string, unknown> = {};
  const keys = [
    'contentType', 'contentMode', 'targetPlatforms', 'aspectRatio',
    'script', 'style', 'layout', 'timing', 'mediaSlots', 'audioTrack',
    'enrichment', 'brandProfileSnapshot', 'previewRenderUrl', 'previewRenderId',
    'finalRenderUrl', 'finalRenderId', 'renderStatus', 'status', 'isAutosave',
  ];

  for (const k of keys) {
    if (k in body) {
      allowed[k] = body[k];
    }
  }

  const row = await db
    .update(contentEditSchema)
    .set({ ...allowed, updatedAt: new Date() })
    .where(eq(contentEditSchema.id, id))
    .returning();

  return NextResponse.json({ edit: row[0] });
}

// ---------------------------------------------------------------------------
// DELETE /api/content/edit/[id] — discard an edit session
// ---------------------------------------------------------------------------
async function del(_: NextRequest, context: { params: Promise<{ id?: string }> }) {
  const { orgId } = await getAuthContext();
  if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const db = await getDb();

  const existing = await db
    .select()
    .from(contentEditSchema)
    .where(eq(contentEditSchema.id, id))
    .then((r) => r[0]);

  if (!existing || existing.orgId !== orgId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await db.delete(contentEditSchema).where(eq(contentEditSchema.id, id));
  return NextResponse.json({ success: true });
}
