import { eq, and } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { campaignSchema } from '@/models/Schema';
import { reRollPost } from '../../utils';

type RouteParams = { params: Promise<{ id: string }> };

// -----------------------------------------------------------
// POST /api/campaigns/[id]/re-roll
// Re-generates a single post within a campaign.
// Body: { contentItemId: string, keepText?: boolean }
// -----------------------------------------------------------
export async function POST(request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

  try {
    const body = await request.json();
    const contentItemId = body.contentItemId as string;
    const keepText = Boolean(body.keepText);

    if (!contentItemId) {
      return NextResponse.json(
        { error: 'contentItemId is required' },
        { status: 400 },
      );
    }

    // 1. Verify campaign exists and belongs to org
    const [campaign] = await db
      .select()
      .from(campaignSchema)
      .where(and(eq(campaignSchema.id, id), eq(campaignSchema.orgId, orgId!)))
      .limit(1);

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // 2. Check re-rolls remaining
    if ((campaign.reRollsRemaining || 0) <= 0) {
      return NextResponse.json(
        { error: 'No re-rolls remaining for this campaign' },
        { status: 403 },
      );
    }

    // 3. Re-roll the post
    const updatedItem = await reRollPost(db, orgId!, id, contentItemId, keepText);

    return NextResponse.json({
      success: true,
      contentItem: updatedItem,
      reRollsRemaining: (campaign.reRollsRemaining || 1) - 1,
    }, { status: 200 });
  } catch (err: any) {
    console.error('[Re-roll] Failed:', err);
    return NextResponse.json(
      { error: err.message || 'Re-roll failed' },
      { status: 500 },
    );
  }
}
