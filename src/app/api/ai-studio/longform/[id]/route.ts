import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { longFormProjectSchema } from '@/models/Schema';
import { eq } from 'drizzle-orm';

import type { LongFormProjectMetadata, LongFormScene } from '@/types/longform';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;
  const db = await getDb();

  const [project] = await db
    .select()
    .from(longFormProjectSchema)
    .where(eq(longFormProjectSchema.id, id));

  if (!project || project.orgId !== orgId) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  return NextResponse.json({ project });
}

// ── PATCH — update project fields ──
// Body may contain: { title?, metadata?, scenes? }
// - title: string
// - metadata: partial LongFormProjectMetadata (merged into existing)
// - scenes: full replacement of scenes array (used for reorder/add/dup/delete/lock)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const db = await getDb();
  const [existing] = await db
    .select()
    .from(longFormProjectSchema)
    .where(eq(longFormProjectSchema.id, id));

  if (!existing || existing.orgId !== orgId) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};

  if (typeof body.title === 'string') {
    const title = body.title.trim().slice(0, 120);
    if (title.length > 0) updates.title = title;
  }

  if (body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)) {
    const prevMeta = (existing.metadata as LongFormProjectMetadata | null) ?? {};
    const next: LongFormProjectMetadata = { ...prevMeta };
    const patch = body.metadata as Record<string, unknown>;

    if (typeof patch.voiceId === 'string' || patch.voiceId === null) {
      next.voiceId = patch.voiceId ? String(patch.voiceId) : undefined;
    }
    if (typeof patch.voiceName === 'string' || patch.voiceName === null) {
      next.voiceName = patch.voiceName ? String(patch.voiceName) : undefined;
    }
    if (typeof patch.bgMusicUrl === 'string' || patch.bgMusicUrl === null) {
      next.bgMusicUrl = patch.bgMusicUrl ? String(patch.bgMusicUrl) : undefined;
    }
    if (typeof patch.bgMusicName === 'string' || patch.bgMusicName === null) {
      next.bgMusicName = patch.bgMusicName ? String(patch.bgMusicName) : undefined;
    }
    if (typeof patch.referenceImageUrl === 'string' || patch.referenceImageUrl === null) {
      next.referenceImageUrl = patch.referenceImageUrl ? String(patch.referenceImageUrl) : undefined;
    }
    if (typeof patch.aspectRatio === 'string') {
      const ar = String(patch.aspectRatio);
      if (ar === '9:16' || ar === '16:9' || ar === '1:1') next.aspectRatio = ar;
    }
    if (typeof patch.imageModelId === 'string') next.imageModelId = String(patch.imageModelId);
    if (typeof patch.videoModelId === 'string') next.videoModelId = String(patch.videoModelId);

    updates.metadata = next;
  }

  if (Array.isArray(body.scenes)) {
    const validCameras = new Set(['static', 'pan_left', 'pan_right', 'zoom_in', 'zoom_out', 'dolly']);
    const validTransitions = new Set(['cut', 'fade', 'dissolve']);
    const validStatuses = new Set(['pending', 'keyframe_generating', 'video_generating', 'done', 'failed']);

    const prevScenes = (existing.scenes as LongFormScene[] | null) ?? [];
    const prevMap = new Map(prevScenes.map(s => [s.id, s]));

    const cleaned: LongFormScene[] = body.scenes.map((raw: unknown, i: number) => {
      const s = (raw ?? {}) as Record<string, unknown>;
      const id = typeof s.id === 'string' && s.id ? s.id : crypto.randomUUID();
      const prev = prevMap.get(id);

      const cameraDirection = validCameras.has(String(s.cameraDirection ?? ''))
        ? (s.cameraDirection as LongFormScene['cameraDirection'])
        : (prev?.cameraDirection ?? 'static');
      const transition = validTransitions.has(String(s.transition ?? ''))
        ? (s.transition as LongFormScene['transition'])
        : (prev?.transition ?? 'cut');
      const status = validStatuses.has(String(s.status ?? ''))
        ? (s.status as LongFormScene['status'])
        : (prev?.status ?? 'pending');

      return {
        id,
        order: i,
        description: String(s.description ?? prev?.description ?? `Scene ${i + 1}`).slice(0, 500),
        visualPrompt: String(s.visualPrompt ?? prev?.visualPrompt ?? '').slice(0, 2000),
        cameraDirection,
        durationSec: Math.max(3, Math.min(30, Number(s.durationSec) || prev?.durationSec || 8)),
        transition,
        status,
        keyframeUrl: typeof s.keyframeUrl === 'string' ? s.keyframeUrl : prev?.keyframeUrl,
        videoClipUrl: typeof s.videoClipUrl === 'string' ? s.videoClipUrl : prev?.videoClipUrl,
        videoClipAssetId: typeof s.videoClipAssetId === 'string' ? s.videoClipAssetId : prev?.videoClipAssetId,
        errorMessage: typeof s.errorMessage === 'string' ? s.errorMessage : prev?.errorMessage,
        locked: typeof s.locked === 'boolean' ? s.locked : (prev?.locked ?? false),
        userProvided: typeof s.userProvided === 'boolean' ? s.userProvided : (prev?.userProvided ?? false),
        keyframeSource: (s.keyframeSource === 'library' || s.keyframeSource === 'upload' || s.keyframeSource === 'ai')
          ? s.keyframeSource
          : prev?.keyframeSource,
      } satisfies LongFormScene;
    });

    updates.scenes = cleaned;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const [project] = await db
    .update(longFormProjectSchema)
    .set(updates)
    .where(eq(longFormProjectSchema.id, id))
    .returning();

  return NextResponse.json({ project });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;
  const db = await getDb();

  const [existing] = await db
    .select({ orgId: longFormProjectSchema.orgId })
    .from(longFormProjectSchema)
    .where(eq(longFormProjectSchema.id, id));

  if (!existing || existing.orgId !== orgId) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  await db.delete(longFormProjectSchema).where(eq(longFormProjectSchema.id, id));
  return NextResponse.json({ ok: true });
}
