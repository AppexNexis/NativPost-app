/**
 * DELETE /api/settings/api-keys/[id]
 *   — Revoke an API key (soft delete via revokedAt).
 *   Revoked keys fail requireApiKey at the edge on the very next request.
 */

import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { requirePlanFeature } from '@/lib/require-plan';
import { getDb } from '@/libs/DB';
import { apiKeySchema } from '@/models/Schema';

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
      .update(apiKeySchema)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeySchema.id, id), eq(apiKeySchema.orgId, orgId!)))
      .returning({ id: apiKeySchema.id });

    if (result.length === 0) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[settings/api-keys/[id]] DELETE failed', err);
    return NextResponse.json({ error: 'Failed to revoke API key' }, { status: 500 });
  }
}
