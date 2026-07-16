import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { longFormProjectSchema } from '@/models/Schema';
import { desc, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const url = new URL(request.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);

  const db = await getDb();

  const projects = await db
    .select({
      id: longFormProjectSchema.id,
      title: longFormProjectSchema.title,
      topic: longFormProjectSchema.topic,
      status: longFormProjectSchema.status,
      sceneCount: longFormProjectSchema.scenes,
      assembledVideoUrl: longFormProjectSchema.assembledVideoUrl,
      creditsReserved: longFormProjectSchema.creditsReserved,
      creditsCharged: longFormProjectSchema.creditsCharged,
      updatedAt: longFormProjectSchema.updatedAt,
      createdAt: longFormProjectSchema.createdAt,
    })
    .from(longFormProjectSchema)
    .where(eq(longFormProjectSchema.orgId, orgId!))
    .orderBy(desc(longFormProjectSchema.updatedAt))
    .limit(limit)
    .offset(offset);

  const serialized = projects.map(p => ({
    ...p,
    sceneCount: Array.isArray(p.sceneCount) ? p.sceneCount.length : 0,
  }));

  return NextResponse.json({ projects: serialized });
}
