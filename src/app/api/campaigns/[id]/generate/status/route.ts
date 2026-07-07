import { and, desc, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { campaignJobSchema, campaignSchema } from '@/models/Schema';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/campaigns/[id]/generate/status
 *
 * Returns the latest generation job for the campaign, plus a lightweight
 * campaign status echo so a single poll can render the whole progress bar.
 *
 * The response is cache-busted (`force-dynamic` + `cache: 'no-store'` on
 * clients) so approve/generate mutations become visible without a stale
 * layer in between — matches the admin-mutation-silent-noop team pattern.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

  const [campaign] = await db
    .select({
      id: campaignSchema.id,
      status: campaignSchema.status,
      totalPosts: campaignSchema.totalPosts,
      generatedPosts: campaignSchema.generatedPosts,
    })
    .from(campaignSchema)
    .where(and(eq(campaignSchema.id, id), eq(campaignSchema.orgId, orgId!)))
    .limit(1);

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }

  const [job] = await db
    .select()
    .from(campaignJobSchema)
    .where(eq(campaignJobSchema.campaignId, id))
    .orderBy(desc(campaignJobSchema.createdAt))
    .limit(1);

  return NextResponse.json({
    campaign,
    job: job ?? null,
  }, { status: 200 });
}
