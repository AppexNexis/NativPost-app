import { NextResponse } from 'next/server';

import { and, desc, eq } from 'drizzle-orm';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { aiStudioJobSchema } from '@/models/Schema';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get('limit') ?? 50), 1), 200);
  const kind = searchParams.get('kind');

  const db = await getDb();
  const rows = await db
    .select()
    .from(aiStudioJobSchema)
    .where(
      kind
        ? and(eq(aiStudioJobSchema.orgId, orgId!), eq(aiStudioJobSchema.kind, kind))
        : eq(aiStudioJobSchema.orgId, orgId!),
    )
    .orderBy(desc(aiStudioJobSchema.createdAt))
    .limit(limit);

  const res = NextResponse.json({ jobs: rows });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
