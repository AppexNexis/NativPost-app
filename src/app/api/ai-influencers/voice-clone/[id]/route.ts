import { and, eq, isNull } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { deleteElevenLabsVoice } from '@/lib/ai-influencers/elevenlabs-voices';
import { getDb } from '@/libs/DB';
import { voiceCloneSchema } from '@/models/Schema';

type RouteParams = { params: Promise<{ id: string }> };

function cloningEnabled(): boolean {
  return process.env.VOICE_CLONE_ENABLED === 'true';
}

// -----------------------------------------------------------
// DELETE /api/ai-influencers/voice-clone/[id]
// Soft-delete an org-owned cloned voice and best-effort delete
// the upstream ElevenLabs voice.
// -----------------------------------------------------------
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  if (!cloningEnabled()) {
    return NextResponse.json(
      { error: 'Voice cloning is disabled for this workspace.' },
      { status: 403 },
    );
  }

  const { id } = await params;

  const db = await getDb();
  const [row] = await db
    .select()
    .from(voiceCloneSchema)
    .where(and(
      eq(voiceCloneSchema.id, id),
      eq(voiceCloneSchema.orgId, orgId!),
      isNull(voiceCloneSchema.deletedAt),
    ))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: 'Voice not found' }, { status: 404 });
  }

  await deleteElevenLabsVoice(row.elevenlabsVoiceId);

  await db
    .update(voiceCloneSchema)
    .set({ deletedAt: new Date() })
    .where(eq(voiceCloneSchema.id, id));

  return NextResponse.json({ success: true });
}
