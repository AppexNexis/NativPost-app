import { NextResponse } from 'next/server';

import { and, eq } from 'drizzle-orm';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { aiStudioJobSchema } from '@/models/Schema';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;
  const db = await getDb();
  const [job] = await db
    .select()
    .from(aiStudioJobSchema)
    .where(and(eq(aiStudioJobSchema.id, id), eq(aiStudioJobSchema.orgId, orgId!)))
    .limit(1);

  if (!job) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const res = NextResponse.json({ job });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
