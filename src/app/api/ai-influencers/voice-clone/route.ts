import { and, desc, eq, isNull } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { cloneVoiceFromUrl } from '@/lib/ai-influencers/elevenlabs-voices';
import { getDb } from '@/libs/DB';
import { voiceCloneSchema } from '@/models/Schema';

function cloningEnabled(): boolean {
  return process.env.VOICE_CLONE_ENABLED === 'true';
}

// -----------------------------------------------------------
// GET /api/ai-influencers/voice-clone
// List this org's cloned voices. Returns 403 when the feature is disabled
// so the wizard can hide the "Your voices" tab without a client env var.
// -----------------------------------------------------------
export async function GET(_request: NextRequest) {
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

  const db = await getDb();
  const rows = await db
    .select()
    .from(voiceCloneSchema)
    .where(and(eq(voiceCloneSchema.orgId, orgId!), isNull(voiceCloneSchema.deletedAt)))
    .orderBy(desc(voiceCloneSchema.createdAt));

  return NextResponse.json({
    items: rows.map(r => ({
      id: r.id,
      name: r.name,
      elevenlabsVoiceId: r.elevenlabsVoiceId,
      previewUrl: r.previewUrl,
      sourceUrl: r.sourceUrl,
      createdAt: r.createdAt,
    })),
  });
}

// -----------------------------------------------------------
// POST /api/ai-influencers/voice-clone
// Clone an audio sample into an org-owned ElevenLabs voice.
//
// Body: { name, audioUrl, consented }
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const { error, orgId, userId } = await getAuthContext();
  if (error) {
    return error;
  }

  if (!cloningEnabled()) {
    return NextResponse.json(
      { error: 'Voice cloning is disabled for this workspace.' },
      { status: 403 },
    );
  }

  let body: { name?: string; audioUrl?: string; consented?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = String(body.name || '').trim();
  const audioUrl = String(body.audioUrl || '').trim();

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (!audioUrl) {
    return NextResponse.json({ error: 'audioUrl is required' }, { status: 400 });
  }
  if (body.consented !== true) {
    return NextResponse.json(
      { error: 'Consent is required. You must confirm you have the right to use this voice.' },
      { status: 400 },
    );
  }

  try {
    const { voiceId, previewUrl } = await cloneVoiceFromUrl({
      name,
      audioUrl,
      labels: { source: 'nativpost', orgId: orgId! },
    });

    const db = await getDb();
    const [row] = await db
      .insert(voiceCloneSchema)
      .values({
        orgId: orgId!,
        name,
        elevenlabsVoiceId: voiceId,
        sourceUrl: audioUrl,
        previewUrl,
        createdBy: userId ?? null,
      })
      .returning();

    return NextResponse.json({
      voice: {
        id: row!.id,
        name: row!.name,
        elevenlabsVoiceId: row!.elevenlabsVoiceId,
        previewUrl: row!.previewUrl,
        isClone: true,
      },
    });
  } catch (err) {
    console.error('[voice-clone] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Voice clone failed' },
      { status: 502 },
    );
  }
}
