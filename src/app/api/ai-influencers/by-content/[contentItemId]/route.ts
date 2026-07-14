import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { aiInfluencerSchema, contentItemSchema } from '@/models/Schema';

type RouteParams = { params: Promise<{ contentItemId: string }> };

// -----------------------------------------------------------
// GET /api/ai-influencers/by-content/[contentItemId]
// Returns { id, name, baseImageUrl } | null for the influencer
// linked to a content item. Used by the editor chip.
// -----------------------------------------------------------
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error } = await getAuthContext();
  if (error) return error;

  const { contentItemId } = await params;

  const [item] = await db
    .select({ influencerId: contentItemSchema.influencerId })
    .from(contentItemSchema)
    .where(eq(contentItemSchema.id, contentItemId));

  if (!item?.influencerId) {
    return NextResponse.json(null);
  }

  const [inf] = await db
    .select({ id: aiInfluencerSchema.id, name: aiInfluencerSchema.name, baseImageUrl: aiInfluencerSchema.baseImageUrl })
    .from(aiInfluencerSchema)
    .where(eq(aiInfluencerSchema.id, item.influencerId));

  return NextResponse.json(inf || null);
}
