import { eq, and } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { campaignSchema } from '@/models/Schema';
import { getCampaignCalendar } from '../../utils';

type RouteParams = { params: Promise<{ id: string }> };

// -----------------------------------------------------------
// GET /api/campaigns/[id]/calendar
// Returns campaign posts grouped by calendar date.
// Query: ?month=2024-01
// -----------------------------------------------------------
export async function GET(request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month');

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json(
      { error: 'Invalid month format. Use YYYY-MM' },
      { status: 400 },
    );
  }

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

    // 2. Fetch calendar data
    const posts = await getCampaignCalendar(db, id, month);

    return NextResponse.json({ posts }, { status: 200 });
  } catch (err: any) {
    console.error('[Calendar] Failed:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch calendar' },
      { status: 500 },
    );
  }
}
