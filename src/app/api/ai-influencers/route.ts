import { eq, and } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { aiInfluencerSchema } from '@/models/Schema';

type RouteParams = { params: Promise<{ id: string }> };

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

    return NextResponse.json({ item: created }, { status: 201 });
  } catch (err) {
    console.error('Failed to create influencer:', err);
    return NextResponse.json({ error: 'Failed to create influencer' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// GET /api/ai-influencers/[id]
// Get a single AI influencer
// -----------------------------------------------------------
export async function GET_ID(_request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

  try {
    const [item] = await db
      .select()
      .from(aiInfluencerSchema)
      .where(and(eq(aiInfluencerSchema.id, id), eq(aiInfluencerSchema.orgId, orgId!)))
      .limit(1);

    if (!item) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }

    return NextResponse.json({ item }, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch influencer:', err);
    return NextResponse.json({ error: 'Failed to fetch influencer' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// PATCH /api/ai-influencers/[id]
// Update an AI influencer
// -----------------------------------------------------------
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

  try {
    const body = await request.json();

    const updates: Record<string, any> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.gender !== undefined) updates.gender = body.gender;
    if (body.ageRange !== undefined) updates.ageRange = body.ageRange;
    if (body.ethnicity !== undefined) updates.ethnicity = body.ethnicity;
    if (body.hairStyle !== undefined) updates.hairStyle = body.hairStyle;
    if (body.hairColor !== undefined) updates.hairColor = body.hairColor;
    if (body.bodyType !== undefined) updates.bodyType = body.bodyType;
    if (body.fashionStyle !== undefined) updates.fashionStyle = body.fashionStyle;
    if (body.poseStyle !== undefined) updates.poseStyle = body.poseStyle;
    if (body.backgroundPreference !== undefined) updates.backgroundPreference = body.backgroundPreference;
    if (body.baseImageUrl !== undefined) updates.baseImageUrl = body.baseImageUrl;
    if (body.referenceImageUrls !== undefined) updates.referenceImageUrls = body.referenceImageUrls;
    if (body.loraModelId !== undefined) updates.loraModelId = body.loraModelId;
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    updates.updatedAt = new Date();

    const [updated] = await db
      .update(aiInfluencerSchema)
      .set(updates)
      .where(and(eq(aiInfluencerSchema.id, id), eq(aiInfluencerSchema.orgId, orgId!)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }

    return NextResponse.json({ item: updated }, { status: 200 });
  } catch (err) {
    console.error('Failed to update influencer:', err);
    return NextResponse.json({ error: 'Failed to update influencer' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// DELETE /api/ai-influencers/[id]
// Soft delete an AI influencer
// -----------------------------------------------------------
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

  try {
    const [updated] = await db
      .update(aiInfluencerSchema)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(aiInfluencerSchema.id, id), eq(aiInfluencerSchema.orgId, orgId!)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('Failed to delete influencer:', err);
    return NextResponse.json({ error: 'Failed to delete influencer' }, { status: 500 });
  }
}
