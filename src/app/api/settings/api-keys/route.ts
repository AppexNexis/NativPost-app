/**
 * GET  /api/settings/api-keys   — list API keys for the current org (metadata only)
 * POST /api/settings/api-keys   — create a new API key (plaintext returned ONCE)
 *
 * Pro plan and above (checked via requirePlanFeature('apiAccess')).
 */

import { and, desc, eq, isNull } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { API_KEY_PREFIX, generateApiKey } from '@/lib/api-key';
import { getAuthContext } from '@/lib/auth';
import { requirePlanFeature } from '@/lib/require-plan';
import { getDb } from '@/libs/DB';
import { apiKeySchema } from '@/models/Schema';

const CreateKeySchema = z.object({
  name: z.string().min(1).max(80),
  expiresInDays: z.number().int().positive().max(3650).optional(),
});

export async function GET(_request: NextRequest) {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const gate = await requirePlanFeature(orgId!, 'apiAccess');
  if (gate.error) return gate.error;

  try {
    const db = await getDb();
    const rows = await db
      .select({
        id: apiKeySchema.id,
        name: apiKeySchema.name,
        prefix: apiKeySchema.prefix,
        lastFour: apiKeySchema.lastFour,
        createdByUserId: apiKeySchema.createdByUserId,
        lastUsedAt: apiKeySchema.lastUsedAt,
        expiresAt: apiKeySchema.expiresAt,
        createdAt: apiKeySchema.createdAt,
      })
      .from(apiKeySchema)
      .where(and(eq(apiKeySchema.orgId, orgId!), isNull(apiKeySchema.revokedAt)))
      .orderBy(desc(apiKeySchema.createdAt));

    return NextResponse.json({ keys: rows });
  } catch (err) {
    console.error('[settings/api-keys] GET failed', err);
    return NextResponse.json({ error: 'Failed to load API keys' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { error, orgId, userId } = await getAuthContext();
  if (error) return error;

  const gate = await requirePlanFeature(orgId!, 'apiAccess');
  if (gate.error) return gate.error;

  try {
    const body = await request.json();
    const parsed = CreateKeySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid body', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { plaintext, hashedKey, lastFour } = generateApiKey();

    const expiresAt = parsed.data.expiresInDays
      ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const db = await getDb();
    const [row] = await db
      .insert(apiKeySchema)
      .values({
        orgId: orgId!,
        name: parsed.data.name,
        prefix: API_KEY_PREFIX,
        hashedKey,
        lastFour,
        createdByUserId: userId!,
        expiresAt,
      })
      .returning({
        id: apiKeySchema.id,
        name: apiKeySchema.name,
        prefix: apiKeySchema.prefix,
        lastFour: apiKeySchema.lastFour,
        expiresAt: apiKeySchema.expiresAt,
        createdAt: apiKeySchema.createdAt,
      });

    return NextResponse.json({
      key: { ...row, plaintext },
      warning: 'Copy this key now — it will never be shown again.',
    });
  } catch (err) {
    console.error('[settings/api-keys] POST failed', err);
    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
  }
}
