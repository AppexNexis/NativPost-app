/**
 * POST /api/v1/campaigns/[id]/launch
 *   Flips a draft campaign to `active` and fires a webhook.
 *   Content generation for the campaign is handled by the internal engine
 *   asynchronously — this endpoint returns 202 immediately.
 */

import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';

import { apiError, apiOk, serializeCampaign } from '@/lib/api-v1';
import { requireApiKey } from '@/lib/require-api-key';
import { fireWebhook } from '@/lib/webhook-dispatcher';
import { getDb } from '@/libs/DB';
import { campaignSchema } from '@/models/Schema';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { error, ctx } = await requireApiKey(request);
  if (error) return error;

  const { id } = await params;
  const db = await getDb();

  const [existing] = await db
    .select({ id: campaignSchema.id, status: campaignSchema.status })
    .from(campaignSchema)
    .where(and(eq(campaignSchema.id, id), eq(campaignSchema.orgId, ctx.orgId)))
    .limit(1);

  if (!existing) return apiError(404, 'not_found', 'Campaign not found.');
  if (existing.status !== 'draft' && existing.status !== 'paused') {
    return apiError(
      409,
      'invalid_state',
      `Cannot launch a campaign in status "${existing.status}". Only draft or paused campaigns can be launched.`,
    );
  }

  const [row] = await db
    .update(campaignSchema)
    .set({ status: 'active', startDate: new Date() })
    .where(and(eq(campaignSchema.id, id), eq(campaignSchema.orgId, ctx.orgId)))
    .returning();

  if (!row) return apiError(500, 'internal', 'Failed to launch campaign.');

  const serialized = serializeCampaign(row);
  await fireWebhook(ctx.orgId, 'campaign.launched', { campaign: serialized });

  return apiOk(serialized, { status: 202 });
}
