import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { aiInfluencerSchema } from '@/models/Schema';

// -----------------------------------------------------------
// GET /api/ai-influencers
// List AI influencers for the current org
// -----------------------------------------------------------
export async function GET(_request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  try {
    const items = await db
      .select()
      .from(aiInfluencerSchema)
      .where(eq(aiInfluencerSchema.orgId, orgId!))
      .orderBy(aiInfluencerSchema.createdAt);

    return NextResponse.json({ items }, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch influencers:', err);
    return NextResponse.json({ error: 'Failed to fetch influencers' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// POST /api/ai-influencers
// Create a new AI influencer
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  try {
    const body = await request.json();

    const [created] = await db
      .insert(aiInfluencerSchema)
      .values({
        orgId: orgId!,
        name: body.name,
        description: body.description || null,
        gender: body.gender || null,
        ageRange: body.ageRange || null,
        ethnicity: body.ethnicity || null,
        hairStyle: body.hairStyle || null,
        hairColor: body.hairColor || null,
        bodyType: body.bodyType || null,
        fashionStyle: body.fashionStyle || null,
        poseStyle: body.poseStyle || null,
        backgroundPreference: body.backgroundPreference || null,
        baseImageUrl: body.baseImageUrl || null,
        referenceImageUrls: body.referenceImageUrls || [],
        loraModelId: body.loraModelId || null,
      })
      .returning();

    if (!created) {
      return NextResponse.json({ error: 'Failed to create influencer' }, { status: 500 });
    }

    return NextResponse.json({ item: created }, { status: 201 });
  } catch (err) {
    console.error('Failed to create influencer:', err);
    return NextResponse.json({ error: 'Failed to create influencer' }, { status: 500 });
  }
}