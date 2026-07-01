import { eq, and } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { campaignSchema, campaignContentSchema, contentAngleSchema, contentItemSchema } from '@/models/Schema';

type RouteParams = { params: Promise<{ id: string }> };

// -----------------------------------------------------------
// GET /api/campaigns/[id]
// Get a single campaign with its content items
// -----------------------------------------------------------
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

  try {
    const [campaign] = await db
      .select()
      .from(campaignSchema)
      .where(and(eq(campaignSchema.id, id), eq(campaignSchema.orgId, orgId!)))
      .limit(1);

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const rows = await db
      .select({
        cc: campaignContentSchema,
        ci: contentItemSchema,
        angle: contentAngleSchema,
      })
      .from(campaignContentSchema)
      .leftJoin(contentItemSchema, eq(campaignContentSchema.contentItemId, contentItemSchema.id))
      .leftJoin(contentAngleSchema, eq(contentItemSchema.angleId, contentAngleSchema.id))
      .where(eq(campaignContentSchema.campaignId, id))
      .orderBy(campaignContentSchema.sequenceIndex);

    const contentItems = rows.map((row: any) => ({
      ...row.cc,
      contentItem: {
        ...(row.ci || {}),
        angleName: row.angle?.name || null,
      },
    }));

    return NextResponse.json({ campaign, contentItems }, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch campaign:', err);
    return NextResponse.json({ error: 'Failed to fetch campaign' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// PATCH /api/campaigns/[id]
// Update campaign status, settings, etc.
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
    if (body.status !== undefined) updates.status = body.status;
    if (body.contentMix !== undefined) updates.contentMix = body.contentMix;
    if (body.remixRatio !== undefined) updates.remixRatio = body.remixRatio;
    if (body.angles !== undefined) updates.angles = body.angles;
    if (body.mentionFrequency !== undefined) updates.mentionFrequency = body.mentionFrequency;
    if (body.genderPreference !== undefined) updates.genderPreference = body.genderPreference;
    if (body.ownMediaMix !== undefined) updates.ownMediaMix = body.ownMediaMix;
    if (body.influencerFrequency !== undefined) updates.influencerFrequency = body.influencerFrequency;
    if (body.targetAccounts !== undefined) updates.targetAccounts = body.targetAccounts;
    if (body.postsPerDay !== undefined) updates.postsPerDay = body.postsPerDay;
    if (body.campaignLengthDays !== undefined) updates.campaignLengthDays = body.campaignLengthDays;
    if (body.startDate !== undefined) updates.startDate = new Date(body.startDate);
    if (body.totalPosts !== undefined) updates.totalPosts = body.totalPosts;
    if (body.generatedPosts !== undefined) updates.generatedPosts = body.generatedPosts;
    if (body.reRollsRemaining !== undefined) updates.reRollsRemaining = body.reRollsRemaining;
    if (body.qualityThreshold !== undefined) updates.qualityThreshold = body.qualityThreshold;
    if (body.pinterestPercent !== undefined) updates.pinterestPercent = body.pinterestPercent;
    if (body.enabledInfluencerIds !== undefined) updates.enabledInfluencerIds = body.enabledInfluencerIds;
    if (body.totalEngagement !== undefined) updates.totalEngagement = body.totalEngagement;
    if (body.avgEngagementRate !== undefined) updates.avgEngagementRate = body.avgEngagementRate;
    updates.updatedAt = new Date();

    const [updated] = await db
      .update(campaignSchema)
      .set(updates)
      .where(and(eq(campaignSchema.id, id), eq(campaignSchema.orgId, orgId!)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    return NextResponse.json({ item: updated }, { status: 200 });
  } catch (err) {
    console.error('Failed to update campaign:', err);
    return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// DELETE /api/campaigns/[id]
// Soft delete by setting status to cancelled
// -----------------------------------------------------------
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

  try {
    const [updated] = await db
      .update(campaignSchema)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(campaignSchema.id, id), eq(campaignSchema.orgId, orgId!)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('Failed to delete campaign:', err);
    return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 });
  }
}
