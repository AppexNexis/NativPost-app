/**
 * PATCH  /api/settings/webhooks/[id] — update url, events, enabled, description,
 *                                       or rotate the secret (`rotateSecret: true`)
 * DELETE /api/settings/webhooks/[id] — hard-delete the endpoint (deliveries cascade)
 */

import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getAuthContext } from '@/lib/auth';
import { requirePlanFeature } from '@/lib/require-plan';
import { ALL_WEBHOOK_EVENTS } from '@/lib/webhook-dispatcher';
import { generateWebhookSecret } from '@/lib/webhook-signing';
import { getDb } from '@/libs/DB';
import { webhookEndpointSchema } from '@/models/Schema';

const PatchSchema = z.object({
  url: z.string().url().max(2048).optional(),
  events: z.array(z.enum(ALL_WEBHOOK_EVENTS as [string, ...string[]])).optional(),
  description: z.string().max(280).nullable().optional(),
  enabled: z.boolean().optional(),
  rotateSecret: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const gate = await requirePlanFeature(orgId!, 'apiAccess');
  if (gate.error) return gate.error;

  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.url !== undefined) updates.url = parsed.data.url;
    if (parsed.data.events !== undefined) updates.events = parsed.data.events;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;
    if (parsed.data.enabled !== undefined) {
      updates.enabled = parsed.data.enabled;
      if (parsed.data.enabled) {
        // Re-enabling clears failure counter and disabledAt so it starts fresh.
        updates.consecutiveFailures = 0;
        updates.disabledAt = null;
      }
    }
    if (parsed.data.rotateSecret) {
      updates.secret = generateWebhookSecret();
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const db = await getDb();
    const [row] = await db
      .update(webhookEndpointSchema)
      .set(updates)
      .where(and(eq(webhookEndpointSchema.id, id), eq(webhookEndpointSchema.orgId, orgId!)))
      .returning();

    if (!row) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    return NextResponse.json({ endpoint: row });
  } catch (err) {
    console.error('[settings/webhooks/[id]] PATCH failed', err);
    return NextResponse.json({ error: 'Failed to update webhook' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const gate = await requirePlanFeature(orgId!, 'apiAccess');
  if (gate.error) return gate.error;

  const { id } = await params;

  try {
    const db = await getDb();
    const result = await db
      .delete(webhookEndpointSchema)
      .where(and(eq(webhookEndpointSchema.id, id), eq(webhookEndpointSchema.orgId, orgId!)))
      .returning({ id: webhookEndpointSchema.id });

    if (result.length === 0) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[settings/webhooks/[id]] DELETE failed', err);
    return NextResponse.json({ error: 'Failed to delete webhook' }, { status: 500 });
  }
}
