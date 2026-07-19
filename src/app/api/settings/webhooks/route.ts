/**
 * GET  /api/settings/webhooks — list webhook endpoints (secret INCLUDED so
 *                               the settings UI can render "Reveal" on demand)
 * POST /api/settings/webhooks — create a new webhook endpoint
 *
 * Pro plan and above.
 */

import { desc, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getAuthContext } from '@/lib/auth';
import { requirePlanFeature } from '@/lib/require-plan';
import { ALL_WEBHOOK_EVENTS } from '@/lib/webhook-dispatcher';
import { generateWebhookSecret } from '@/lib/webhook-signing';
import { getDb } from '@/libs/DB';
import { webhookEndpointSchema } from '@/models/Schema';

const CreateWebhookSchema = z.object({
  url: z.string().url().max(2048),
  events: z.array(z.enum(ALL_WEBHOOK_EVENTS as [string, ...string[]])).default([]),
  description: z.string().max(280).optional(),
  enabled: z.boolean().default(true),
});

export async function GET(_request: NextRequest) {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const gate = await requirePlanFeature(orgId!, 'apiAccess');
  if (gate.error) return gate.error;

  try {
    const db = await getDb();
    const rows = await db
      .select()
      .from(webhookEndpointSchema)
      .where(eq(webhookEndpointSchema.orgId, orgId!))
      .orderBy(desc(webhookEndpointSchema.createdAt));

    return NextResponse.json({
      endpoints: rows,
      availableEvents: ALL_WEBHOOK_EVENTS,
    });
  } catch (err) {
    console.error('[settings/webhooks] GET failed', err);
    return NextResponse.json({ error: 'Failed to load webhooks' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { error, orgId, userId } = await getAuthContext();
  if (error) return error;

  const gate = await requirePlanFeature(orgId!, 'apiAccess');
  if (gate.error) return gate.error;

  try {
    const body = await request.json();
    const parsed = CreateWebhookSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const db = await getDb();
    const [row] = await db
      .insert(webhookEndpointSchema)
      .values({
        orgId: orgId!,
        url: parsed.data.url,
        secret: generateWebhookSecret(),
        events: parsed.data.events,
        description: parsed.data.description ?? null,
        enabled: parsed.data.enabled,
        createdByUserId: userId!,
      })
      .returning();

    return NextResponse.json({ endpoint: row });
  } catch (err) {
    console.error('[settings/webhooks] POST failed', err);
    return NextResponse.json({ error: 'Failed to create webhook' }, { status: 500 });
  }
}
