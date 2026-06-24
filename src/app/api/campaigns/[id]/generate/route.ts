import { eq, and } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { campaignSchema } from '@/models/Schema';
import { generateCampaignPosts } from '../../utils';

type RouteParams = { params: Promise<{ id: string }> };

// -----------------------------------------------------------
// POST /api/campaigns/[id]/generate
// Starts batch campaign generation synchronously.
// Returns a summary when all posts are processed.
// -----------------------------------------------------------
export async function POST(request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

  try {
    // 1. Fetch campaign and validate ownership
    const [campaign] = await db
      .select()
      .from(campaignSchema)
      .where(and(eq(campaignSchema.id, id), eq(campaignSchema.orgId, orgId!)))
      .limit(1);

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (campaign.status === 'generating') {
      return NextResponse.json({ error: 'Campaign is already generating' }, { status: 409 });
    }

    if (campaign.status === 'active' || campaign.status === 'completed') {
      return NextResponse.json(
        { error: `Cannot generate posts for a ${campaign.status} campaign` },
        { status: 400 },
      );
    }

    // 2. Read optional overrides from request body
    let body: Record<string, unknown> = {};
    try { body = await request.json(); } catch { /* no body is fine */ }

    const topicOverride = (body.topic as string) || undefined;
    const targetPlatformsOverride = (body.targetPlatforms as string[]) || undefined;

    // 3. Update status to generating
    await db.update(campaignSchema)
      .set({ status: 'generating', updatedAt: new Date() })
      .where(eq(campaignSchema.id, id));

    // 4. Generate all posts
    const result = await generateCampaignPosts(
      db,
      orgId!,
      campaign,
      topicOverride,
      targetPlatformsOverride,
    );

    // 5. Update campaign status and counts
    const finalStatus = result.failedPosts === result.totalPosts ? 'draft' : 'review';
    await db.update(campaignSchema)
      .set({
        status: finalStatus,
        totalPosts: result.totalPosts,
        generatedPosts: result.completedPosts,
        updatedAt: new Date(),
      })
      .where(eq(campaignSchema.id, id));

    return NextResponse.json({
      campaignId: id,
      totalPosts: result.totalPosts,
      generatedPosts: result.completedPosts,
      failedPosts: result.failedPosts,
      status: finalStatus,
    }, { status: 200 });
  } catch (err: any) {
    console.error('[Campaign Generate] Failed:', err);

    // Best-effort: reset status to draft on catastrophic failure
    try {
      await db.update(campaignSchema)
        .set({ status: 'draft', updatedAt: new Date() })
        .where(eq(campaignSchema.id, id));
    } catch { /* ignore */ }

    return NextResponse.json(
      { error: 'Campaign generation failed', detail: err.message },
      { status: 500 },
    );
  }
}
