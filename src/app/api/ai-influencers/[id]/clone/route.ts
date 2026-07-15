import { and, eq, or } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { aiInfluencerSchema } from '@/models/Schema';

type RouteParams = { params: Promise<{ id: string }> };

// -----------------------------------------------------------
// POST /api/ai-influencers/[id]/clone
// Clone a system (library) influencer into the caller's org.
// Resets identity training state so the user can train their own face lock.
// -----------------------------------------------------------
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const { id } = await params;

  const [source] = await db
    .select()
    .from(aiInfluencerSchema)
    .where(and(eq(aiInfluencerSchema.id, id), or(eq(aiInfluencerSchema.isSystem, true), eq(aiInfluencerSchema.orgId, orgId!))))
    .limit(1);

  if (!source) {
    return NextResponse.json(
      { error: 'Influencer not found or not clonable' },
      { status: 400 },
    );
  }

  const [cloned] = await db
    .insert(aiInfluencerSchema)
    .values({
      orgId: orgId!,
      name: source.name,
      description: source.description,
      gender: source.gender,
      ageRange: source.ageRange,
      ethnicity: source.ethnicity,
      hairStyle: source.hairStyle,
      hairColor: source.hairColor,
      bodyType: source.bodyType,
      fashionStyle: source.fashionStyle,
      poseStyle: source.poseStyle,
      backgroundPreference: source.backgroundPreference,
      voiceId: source.voiceId,
      voiceProvider: source.voiceProvider,
      personaPrompt: source.personaPrompt,
      referenceImageUrls: source.referenceImageUrls,
      baseImageUrl: null,
      loraStatus: 'pending',
      loraModelId: null,
      loraTrainingJobId: null,
      trainingMode: source.trainingMode,
      isSystem: false,
      isActive: true,
    })
    .returning();

  if (!cloned) {
    return NextResponse.json({ error: 'Failed to clone influencer' }, { status: 500 });
  }

  return NextResponse.json({ influencer: cloned }, { status: 201 });
}
