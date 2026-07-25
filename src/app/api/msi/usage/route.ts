import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { billingPeriodOf } from '@/lib/msi/billing';
import { MSI_PER_POST_USD } from '@/lib/msi/pricing';
import { getDb } from '@/libs/DB';
import { managedAccountSchema, msiBillablePublishEventSchema } from '@/models/Schema';

// -----------------------------------------------------------
// GET /api/msi/usage
// Customer-facing metered-usage readout for Managed Posting (docs §6). Lists the
// org's billable publish events ($MSI_PER_POST_USD each), with the live post
// permalink, plus this-month and all-time rollups. Read-only, org-scoped.
// -----------------------------------------------------------

// Cap the returned event list; rollups are computed from the same window. At
// $1.50/post this comfortably covers a heavy month of managed posting.
const EVENT_LIMIT = 500;

export async function GET() {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const db = await getDb();
  try {
    const rows = await db
      .select({
        id: msiBillablePublishEventSchema.id,
        platform: msiBillablePublishEventSchema.platform,
        platformPostId: msiBillablePublishEventSchema.platformPostId,
        permalink: msiBillablePublishEventSchema.permalink,
        billingPeriod: msiBillablePublishEventSchema.billingPeriod,
        occurredAt: msiBillablePublishEventSchema.occurredAt,
        reportedAt: msiBillablePublishEventSchema.reportedAt,
        accountName: managedAccountSchema.displayName,
      })
      .from(msiBillablePublishEventSchema)
      .leftJoin(
        managedAccountSchema,
        eq(msiBillablePublishEventSchema.managedAccountId, managedAccountSchema.id),
      )
      .where(eq(msiBillablePublishEventSchema.orgId, orgId!))
      .orderBy(desc(msiBillablePublishEventSchema.occurredAt))
      .limit(EVENT_LIMIT);

    const currentPeriod = billingPeriodOf(new Date());

    // Per-month rollup (newest first), plus this-month + all-time totals.
    const byPeriodMap = new Map<string, number>();
    let currentPeriodPosts = 0;
    for (const r of rows) {
      byPeriodMap.set(r.billingPeriod, (byPeriodMap.get(r.billingPeriod) ?? 0) + 1);
      if (r.billingPeriod === currentPeriod) {
        currentPeriodPosts += 1;
      }
    }
    const byPeriod = Array.from(byPeriodMap.entries())
      .map(([period, posts]) => ({
        period,
        posts,
        charge: posts * MSI_PER_POST_USD,
      }))
      .sort((a, b) => (a.period < b.period ? 1 : -1));

    return NextResponse.json(
      {
        perPostUsd: MSI_PER_POST_USD,
        currentPeriod,
        summary: {
          currentPeriodPosts,
          currentPeriodCharge: currentPeriodPosts * MSI_PER_POST_USD,
          allTimePosts: rows.length,
          allTimeCharge: rows.length * MSI_PER_POST_USD,
        },
        byPeriod,
        events: rows,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('Failed to fetch MSI usage:', err);
    return NextResponse.json(
      { error: 'Failed to fetch usage' },
      { status: 500 },
    );
  }
}
