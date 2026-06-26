import { eq, and } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { campaignContentSchema, campaignSchema } from '@/models/Schema';

type RouteParams = { params: Promise<{ id: string; contentItemId: string }> };

/**
 * PATCH /api/campaigns/[id]/content/[contentItemId]/schedule
 *
 * Update the scheduled date/time for a single post within a campaign.
 * Body: { scheduledDate?: string, scheduledTime?: string }
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id, contentItemId } = await params;

  try {
    const body = await request.json();
    const { scheduledDate, scheduledTime } = body;

    // Verify campaign ownership
    const [campaign] = await db
      .select()
      .from(campaignSchema)
      .where(and(eq(campaignSchema.id, id), eq(campaignSchema.orgId, orgId!)))
      .limit(1);

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Find campaign content link
    const [cc] = await db
      .select()
      .from(campaignContentSchema)
      .where(
        and(
          eq(campaignContentSchema.campaignId, id),
          eq(campaignContentSchema.contentItemId, contentItemId),
        ),
      )
      .limit(1);

    if (!cc) {
      return NextResponse.json(
        { error: 'Content item not found in this campaign' },
        { status: 404 },
      );
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (scheduledDate !== undefined) {
      updates.scheduledDate = scheduledDate ? new Date(`${scheduledDate}T00:00:00Z`) : null;
    }
    if (scheduledTime !== undefined) {
      updates.scheduledTime = scheduledTime || null;
    }

    const [updated] = await db
      .update(campaignContentSchema)
      .set(updates)
      .where(eq(campaignContentSchema.id, cc.id))
      .returning();

    return NextResponse.json({ item: updated }, { status: 200 });
  } catch (err: any) {
    console.error('[Campaign Schedule] Failed:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to update schedule' },
      { status: 500 },
    );
  }
}
