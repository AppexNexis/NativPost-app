import { and, eq, inArray, or } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { aiInfluencerSchema, contentAngleSchema, influencerAngleSchema } from '@/models/Schema';

type RouteParams = { params: Promise<{ id: string }> };

// -----------------------------------------------------------
// GET /api/ai-influencers/[id]/angles
// List content angles assigned to this influencer.
// -----------------------------------------------------------
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

  const [influencer] = await db
    .select({ id: aiInfluencerSchema.id })
    .from(aiInfluencerSchema)
    .where(and(
      eq(aiInfluencerSchema.id, id),
      or(eq(aiInfluencerSchema.orgId, orgId!), eq(aiInfluencerSchema.isSystem, true)),
    ))
    .limit(1);

  if (!influencer) {
    return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
  }

  const rows = await db
    .select({
      id: influencerAngleSchema.id,
      contentAngleId: influencerAngleSchema.contentAngleId,
      weight: influencerAngleSchema.weight,
      angleName: contentAngleSchema.name,
      angleDescription: contentAngleSchema.description,
      angleColor: contentAngleSchema.color,
    })
    .from(influencerAngleSchema)
    .leftJoin(contentAngleSchema, eq(influencerAngleSchema.contentAngleId, contentAngleSchema.id))
    .where(eq(influencerAngleSchema.influencerId, id))
    .orderBy(influencerAngleSchema.weight);

  return NextResponse.json({
    angles: rows.map(r => ({
      assignmentId: r.id,
      angleId: r.contentAngleId,
      name: r.angleName || 'Unknown',
      description: r.angleDescription || null,
      color: r.angleColor || null,
      weight: r.weight,
    })),
  });
}

// -----------------------------------------------------------
// PUT /api/ai-influencers/[id]/angles
// Replace the full set of assigned angles atomically.
// Body: { angleIds: string[] }
// -----------------------------------------------------------
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

  const [influencer] = await db
    .select({ id: aiInfluencerSchema.id, orgId: aiInfluencerSchema.orgId })
    .from(aiInfluencerSchema)
    .where(and(
      eq(aiInfluencerSchema.id, id),
      eq(aiInfluencerSchema.orgId, orgId!), // system rows can't be mutated
    ))
    .limit(1);

  if (!influencer) {
    return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
  }

  let body: { angleIds?: string[] } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const angleIds = (body.angleIds || []).filter(Boolean);

  // Validate all angle IDs belong to the org or are system angles
  if (angleIds.length > 0) {
    const validAngles = await db
      .select({ id: contentAngleSchema.id })
      .from(contentAngleSchema)
      .where(and(
        inArray(contentAngleSchema.id, angleIds),
        or(eq(contentAngleSchema.orgId, orgId!), eq(contentAngleSchema.isSystem, true)),
      ));

    if (validAngles.length !== angleIds.length) {
      return NextResponse.json({ error: 'One or more angle IDs are invalid' }, { status: 400 });
    }
  }

  // Replace atomically: delete all existing, insert new set
  await db.transaction(async (tx) => {
    await tx
      .delete(influencerAngleSchema)
      .where(eq(influencerAngleSchema.influencerId, id));

    if (angleIds.length > 0) {
      await tx
        .insert(influencerAngleSchema)
        .values(angleIds.map((angleId, i) => ({
          influencerId: id,
          contentAngleId: angleId,
          weight: i + 1,
        })));
    }
  });

  // Return the updated list
  const rows = await db
    .select({
      id: influencerAngleSchema.id,
      contentAngleId: influencerAngleSchema.contentAngleId,
      weight: influencerAngleSchema.weight,
      angleName: contentAngleSchema.name,
      angleDescription: contentAngleSchema.description,
      angleColor: contentAngleSchema.color,
    })
    .from(influencerAngleSchema)
    .leftJoin(contentAngleSchema, eq(influencerAngleSchema.contentAngleId, contentAngleSchema.id))
    .where(eq(influencerAngleSchema.influencerId, id))
    .orderBy(influencerAngleSchema.weight);

  return NextResponse.json({
    angles: rows.map(r => ({
      assignmentId: r.id,
      angleId: r.contentAngleId,
      name: r.angleName || 'Unknown',
      description: r.angleDescription || null,
      color: r.angleColor || null,
      weight: r.weight,
    })),
  });
}
