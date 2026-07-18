import { and, eq, inArray, lt } from 'drizzle-orm';

import { getDb } from '@/libs/DB';
import {
  campaignContentSchema,
  campaignSchema,
  contentItemSchema,
} from '@/models/Schema';

// Content-item statuses considered "not yet locked in" — safe to hard-delete
// when the parent Blitz campaign is being purged. Approved / published /
// scheduled items are kept so the org doesn't lose reviewed work.
const PURGEABLE_STATUSES = ['pending_review', 'draft', 'skipped', 'rejected', 'failed'];

/**
 * Delete "Today's Blitz" campaign rows older than 24h along with any
 * unapproved content items attached to them. Approved / published /
 * scheduled items survive; they lose their campaign attachment (junction
 * cascades) but remain in the general content library.
 *
 * Runs on every /dashboard/campaigns render — cheap because it's scoped
 * to the org and uses index-friendly (org_id, name, created_at) filters.
 */
export async function cleanupStaleBlitzCampaigns(
  db: Awaited<ReturnType<typeof getDb>>,
  orgId: string,
): Promise<void> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  // 1. Find stale Today's Blitz campaigns.
  const stale = await db
    .select({ id: campaignSchema.id })
    .from(campaignSchema)
    .where(and(
      eq(campaignSchema.orgId, orgId),
      eq(campaignSchema.name, "Today's Blitz"),
      lt(campaignSchema.createdAt, startOfToday),
    ));

  if (stale.length === 0) {
    return;
  }
  const staleIds = stale.map(c => c.id);

  // 2. For each stale campaign, find purgeable content items via junction.
  const junctionRows = await db
    .select({
      contentItemId: campaignContentSchema.contentItemId,
      status: contentItemSchema.status,
    })
    .from(campaignContentSchema)
    .leftJoin(contentItemSchema, eq(campaignContentSchema.contentItemId, contentItemSchema.id))
    .where(inArray(campaignContentSchema.campaignId, staleIds));

  const purgeableItemIds = junctionRows
    .filter(r => r.status && PURGEABLE_STATUSES.includes(String(r.status)))
    .map(r => r.contentItemId)
    .filter((id): id is string => !!id);

  // 3. Delete purgeable content items first (junction rows for these
  //    cascade away via content_item_id FK).
  if (purgeableItemIds.length > 0) {
    await db
      .delete(contentItemSchema)
      .where(inArray(contentItemSchema.id, purgeableItemIds));
  }

  // 4. Delete the campaign rows themselves. Junction rows for any
  //    approved/published items cascade away via campaign_id FK, but the
  //    content items live on in contentItem — no reverse FK.
  await db
    .delete(campaignSchema)
    .where(inArray(campaignSchema.id, staleIds));
}
