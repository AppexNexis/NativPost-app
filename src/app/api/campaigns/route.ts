import { and, desc, eq } from 'drizzle-orm';
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
  if (error) {
    return error;
  }

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
  if (error) {
    return error;
  }

  try {
    const body = await request.json();

    // Clamp postsPerDay to the product's [1,3] range and compute
    // totalPosts server-side so the row's denominator is always correct
    // regardless of what the wizard sent. Phase 1 generation reads
    // totalPosts as its loop bound — a wrong value here caps the whole
    // campaign to one day or produces zero-post reviews.
    const targetAccountsBody = Array.isArray(body.targetAccounts) ? body.targetAccounts : [];
    // Account count is NOT a multiplier. "2 posts per day" means 2 IDEAS per
    // day; publishing cross-posts each idea to one account per platform (see
    // scheduleCampaignPosts), so selecting more accounts widens reach rather
    // than multiplying how much content gets written. This route is
    // authoritative — it overrides whatever the wizard sent — so the
    // multiplier here is what actually produced 112 posts for a 2/day × 14d
    // campaign that should be 28.
    const perDay = Math.max(1, Math.min(3, Number(body.postsPerDay ?? 1)));
    const days = Math.max(1, Number(body.campaignLengthDays ?? 7));
    const computedTotalPosts = perDay * days;

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
        targetAccounts: targetAccountsBody,
        // Per-platform publishing config captured in the wizard (TikTok privacy,
        // direct vs inbox, disclosure). The scheduler reads this instead of
        // guessing defaults at publish time.
        platformSettings: (body.platformSettings && typeof body.platformSettings === 'object')
          ? body.platformSettings
          : {},
        postsPerDay: perDay,
        campaignLengthDays: days,
        startDate: body.startDate ? new Date(body.startDate) : null,
        totalPosts: computedTotalPosts,
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
