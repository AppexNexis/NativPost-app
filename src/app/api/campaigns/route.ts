import { eq, and, desc } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
// import { campaignSchema, campaignContentSchema, contentItemSchema } from '@/models/Schema';
import { campaignSchema } from '@/models/Schema';

// -----------------------------------------------------------
// GET /api/campaigns
// List campaigns for the current org
// Query params: ?status=draft&limit=20&offset=0
// -----------------------------------------------------------
export async function GET(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const limit = Math.min(Number(searchParams.get('limit')) || 20, 100);
  const offset = Number(searchParams.get('offset')) || 0;

  try {
    const conditions = [eq(campaignSchema.orgId, orgId!)];
    if (status) {
      conditions.push(eq(campaignSchema.status, status));
    }

    const items = await db
      .select()
      .from(campaignSchema)
      .where(and(...conditions))
      .orderBy(desc(campaignSchema.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({ items, limit, offset }, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch campaigns:', err);
    return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// POST /api/campaigns
// Create a new campaign
// Body: full campaign config (from wizard)
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  try {
    const body = await request.json();

    const [created] = await db
      .insert(campaignSchema)
      .values({
        orgId: orgId!,
        name: body.name,
        description: body.description || null,
        status: body.status || 'draft',
        contentMix: body.contentMix || {},
        remixRatio: body.remixRatio ?? 50,
        angles: body.angles || [],
        mentionFrequency: body.mentionFrequency || 'sometimes',
        genderPreference: body.genderPreference || null,
        ownMediaMix: body.ownMediaMix ?? 50,
        influencerFrequency: body.influencerFrequency ?? 0,
        targetAccounts: body.targetAccounts || [],
        postsPerDay: body.postsPerDay ?? 10,
        campaignLengthDays: body.campaignLengthDays ?? 7,
        startDate: body.startDate ? new Date(body.startDate) : null,
        totalPosts: body.totalPosts || 0,
        generatedPosts: 0,
        reRollsRemaining: body.reRollsRemaining ?? 4,
        qualityThreshold: body.qualityThreshold ?? 0.7,
      })
      .returning();

    return NextResponse.json({ item: created }, { status: 201 });
  } catch (err) {
    console.error('Failed to create campaign:', err);
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 });
  }
}
