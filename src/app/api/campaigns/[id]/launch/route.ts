import { eq, and } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { serializeCampaign } from '@/lib/api-v1';
import { getAuthContext } from '@/lib/auth';
import { fireWebhook } from '@/lib/webhook-dispatcher';
import { getDb } from '@/libs/DB';
import { campaignSchema } from '@/models/Schema';
import { scheduleCampaignPosts } from '../../utils';

type RouteParams = { params: Promise<{ id: string }> };

// -----------------------------------------------------------
// POST /api/campaigns/[id]/launch
// Launches a campaign by updating status to active and
// scheduling all linked posts in the publishing queue.
// -----------------------------------------------------------
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

  try {
    // 1. Verify campaign exists and belongs to org
    const [campaign] = await db
      .select()
      .from(campaignSchema)
      .where(and(eq(campaignSchema.id, id), eq(campaignSchema.orgId, orgId!)))
      .limit(1);

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (campaign.status === 'active') {
      return NextResponse.json({ error: 'Campaign is already active' }, { status: 409 });
    }

    if (campaign.status === 'draft' || campaign.status === 'generating') {
      return NextResponse.json(
        { error: `Cannot launch a campaign with status "${campaign.status}". Generate posts first.` },
        { status: 400 },
      );
    }

    // 2. Schedule only approved posts in the publishing queue
    const { scheduled, skipped } = await scheduleCampaignPosts(db, orgId!, id);

    // 3. Update campaign status to active
    const [launched] = await db.update(campaignSchema)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(campaignSchema.id, id))
      .returning();

    // 4. Emit campaign.launched webhook (waitUntil-backed, never blocks)
    if (launched) {
      fireWebhook(orgId!, 'campaign.launched', {
        campaign: serializeCampaign(launched),
        scheduled_posts: scheduled,
        skipped_posts: skipped,
      });
    }

    return NextResponse.json({
      success: true,
      scheduledPosts: scheduled,
      skippedPosts: skipped,
      campaignId: id,
      status: 'active',
    }, { status: 200 });
  } catch (err: any) {
    console.error('[Launch] Failed:', err);
    return NextResponse.json(
      { error: err.message || 'Launch failed' },
      { status: 500 },
    );
  }
}
