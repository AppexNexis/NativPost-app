/**
 * GET    /api/v1/campaigns/[id]  — fetch one campaign
 * PATCH  /api/v1/campaigns/[id]  — update mutable fields
 * DELETE /api/v1/campaigns/[id]  — hard-delete (content_item.campaignId → null)
 */

import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { apiError, apiOk, serializeCampaign } from '@/lib/api-v1';
import { requireApiKey } from '@/lib/require-api-key';
import { getDb } from '@/libs/DB';
import { campaignSchema } from '@/models/Schema';

const PatchSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  description: z.string().max(1000).nullable().optional(),
  status: z.enum(['draft', 'active', 'paused', 'completed', 'archived']).optional(),
  posts_per_day: z.number().int().positive().max(50).optional(),
  campaign_length_days: z.number().int().positive().max(365).optional(),
  start_date: z.string().datetime().nullable().optional(),
  content_mix: z.record(z.string(), z.number()).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { error, ctx } = await requireApiKey(request);
  if (error) return error;

  const { id } = await params;
  const db = await getDb();
  const [row] = await db
    .select()
    .from(campaignSchema)
    .where(and(eq(campaignSchema.id, id), eq(campaignSchema.orgId, ctx.orgId)))
    .limit(1);

  if (!row) return apiError(404, 'not_found', 'Campaign not found.');
  return apiOk(serializeCampaign(row));
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { error, ctx } = await requireApiKey(request);
  if (error) return error;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, 'invalid_body', 'Request body must be valid JSON.');
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, 'invalid_body', 'Validation failed.', { details: parsed.error.flatten() });
  }

  const updates: Record<string, unknown> = {};
  const d = parsed.data;
  if (d.name !== undefined) updates.name = d.name;
  if (d.description !== undefined) updates.description = d.description;
  if (d.status !== undefined) updates.status = d.status;
  if (d.posts_per_day !== undefined) updates.postsPerDay = d.posts_per_day;
  if (d.campaign_length_days !== undefined) updates.campaignLengthDays = d.campaign_length_days;
  if (d.start_date !== undefined) updates.startDate = d.start_date ? new Date(d.start_date) : null;
  if (d.content_mix !== undefined) updates.contentMix = d.content_mix;

  if (Object.keys(updates).length === 0) {
    return apiError(400, 'no_updates', 'Request body has no updatable fields.');
  }

  const db = await getDb();
  const [row] = await db
    .update(campaignSchema)
    .set(updates)
    .where(and(eq(campaignSchema.id, id), eq(campaignSchema.orgId, ctx.orgId)))
    .returning();

  if (!row) return apiError(404, 'not_found', 'Campaign not found.');
  return apiOk(serializeCampaign(row));
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { error, ctx } = await requireApiKey(request);
  if (error) return error;

  const { id } = await params;
  const db = await getDb();
  const [row] = await db
    .delete(campaignSchema)
    .where(and(eq(campaignSchema.id, id), eq(campaignSchema.orgId, ctx.orgId)))
    .returning({ id: campaignSchema.id });

  if (!row) return apiError(404, 'not_found', 'Campaign not found.');
  return apiOk({ id, object: 'campaign', deleted: true });
}
