import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { longFormProjectSchema } from '@/models/Schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;
  const db = await getDb();

  const [project] = await db
    .select()
    .from(longFormProjectSchema)
    .where(eq(longFormProjectSchema.id, id));

  if (!project || project.orgId !== orgId) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  return NextResponse.json({ project });
}
