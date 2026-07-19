/**
 * GET /api/v1/social-accounts
 *   List connected social accounts for the org.
 *   Access/refresh tokens are NEVER included in the response.
 */

import { desc, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';

import { apiOk, serializeSocialAccount } from '@/lib/api-v1';
import { requireApiKey } from '@/lib/require-api-key';
import { getDb } from '@/libs/DB';
import { socialAccountSchema } from '@/models/Schema';

export async function GET(request: NextRequest) {
  const { error, ctx } = await requireApiKey(request);
  if (error) return error;

  const db = await getDb();
  const rows = await db
    .select()
    .from(socialAccountSchema)
    .where(eq(socialAccountSchema.orgId, ctx.orgId))
    .orderBy(desc(socialAccountSchema.connectedAt));

  return apiOk({
    object: 'list',
    data: rows.map(serializeSocialAccount),
    has_more: false,
    next_cursor: null,
  });
}
