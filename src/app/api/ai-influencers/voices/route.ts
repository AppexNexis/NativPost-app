import { and, eq, isNull } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { fetchVoicePreviewUrl } from '@/lib/ai-influencers/elevenlabs-voices';
import { CURATED_VOICES } from '@/lib/ai-influencers/voices';
import { getDb } from '@/libs/DB';
import { voiceCloneSchema } from '@/models/Schema';

type VoiceRow = {
  id: string;
  name: string;
  gender: string | null;
  accent: string | null;
  vibe: string | null;
  previewUrl: string | null;
  isClone: boolean;
};

// In-memory preview cache: voiceId -> { url, expiresAt }
const previewCache = new Map<string, { url: string | null; expiresAt: number }>();
const PREVIEW_TTL_MS = 5 * 60 * 1000;

async function getPreviewCached(voiceId: string): Promise<string | null> {
  const now = Date.now();
  const hit = previewCache.get(voiceId);
  if (hit && hit.expiresAt > now) {
    return hit.url;
  }
  const url = await fetchVoicePreviewUrl(voiceId);
  previewCache.set(voiceId, { url, expiresAt: now + PREVIEW_TTL_MS });
  return url;
}

// -----------------------------------------------------------
// GET /api/ai-influencers/voices
// Returns curated stock voices + this org's cloned voices, each with a
// hosted mp3 preview URL when available.
// -----------------------------------------------------------
export async function GET(_request: NextRequest) {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  try {
    const previews = await Promise.all(
      CURATED_VOICES.map(v => getPreviewCached(v.id)),
    );

    const stock: VoiceRow[] = CURATED_VOICES.map((v, i) => ({
      id: v.id,
      name: v.name,
      gender: v.gender,
      accent: v.accent,
      vibe: v.vibe,
      previewUrl: previews[i] ?? null,
      isClone: false,
    }));

    let cloned: VoiceRow[] = [];
    if (orgId) {
      const db = await getDb();
      const rows = await db
        .select()
        .from(voiceCloneSchema)
        .where(and(eq(voiceCloneSchema.orgId, orgId), isNull(voiceCloneSchema.deletedAt)));
      cloned = rows.map(r => ({
        id: r.elevenlabsVoiceId,
        name: r.name,
        gender: null,
        accent: 'custom',
        vibe: 'cloned',
        previewUrl: r.previewUrl,
        isClone: true,
      }));
    }

    return NextResponse.json({ voices: [...cloned, ...stock] });
  } catch (err) {
    console.error('[ai-influencers/voices] failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load voices' },
      { status: 500 },
    );
  }
}
