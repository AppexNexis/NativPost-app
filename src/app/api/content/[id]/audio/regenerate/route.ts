import { waitUntil } from '@vercel/functions';
import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { generateAudioForBlitzItem } from '@/lib/blitz/generate-audio';
import { getDb } from '@/libs/DB';
import { contentItemSchema } from '@/models/Schema';

type RouteParams = {
  params: Promise<{ id: string }>;
};

// -----------------------------------------------------------
// POST /api/content/[id]/audio/regenerate
// Forces a fresh ElevenLabs voice-over generation for a Blitz item,
// ignoring any cached scriptHash. Returns 202 immediately; client
// polls the content item to observe status transitions.
// -----------------------------------------------------------
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const { id } = await params;

  // Confirm ownership before firing the async job.
  const [item] = await db
    .select({ id: contentItemSchema.id })
    .from(contentItemSchema)
    .where(
      and(
        eq(contentItemSchema.id, id),
        eq(contentItemSchema.orgId, orgId!),
      ),
    )
    .limit(1);

  if (!item) {
    return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
  }

  try {
    waitUntil(
      generateAudioForBlitzItem({ db, contentItemId: id, force: true })
        .catch((err: any) => {
          console.error('[BlitzAudio] regenerate failed:', err?.message || err);
        }),
    );
  } catch {
    // waitUntil not available outside Vercel runtime — fire loose.
    void generateAudioForBlitzItem({ db, contentItemId: id, force: true })
      .catch((err: any) => {
        console.error('[BlitzAudio] regenerate (local) failed:', err?.message || err);
      });
  }

  return NextResponse.json({ status: 'accepted' }, { status: 202 });
}
