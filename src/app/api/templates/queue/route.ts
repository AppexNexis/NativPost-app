import { sql, eq, and, desc } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { contentTemplateSchema } from '@/models/Schema';

// -----------------------------------------------------------
// GET /api/templates/queue
// Returns templates pending curation (admin only)
// Query: ?limit=20&offset=0&status=pending
// -----------------------------------------------------------
export async function GET(request: NextRequest) {
  const db = await getDb();
  // const { error, orgId, userId } = await getAuthContext();
  const { error } = await getAuthContext();
  if (error) return error;

  // Admin check: in production, verify user has admin role via Clerk metadata
  // or a roles table. For now, allow any authenticated user to view queue.
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'pending';
  const limit = Math.min(Number(searchParams.get('limit')) || 20, 100);
  const offset = Number(searchParams.get('offset')) || 0;

  try {
    const conditions = [
      eq(contentTemplateSchema.curationStatus, status),
    ];

    const items = await db
      .select()
      .from(contentTemplateSchema)
      .where(and(...conditions))
      .orderBy(desc(contentTemplateSchema.createdAt))
      .limit(limit)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(contentTemplateSchema)
      .where(and(...conditions));

    return NextResponse.json({
      items,
      total: countResult[0]?.count ?? 0,
      limit,
      offset,
    }, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch curation queue:', err);
    return NextResponse.json({ error: 'Failed to fetch curation queue' }, { status: 500 });
  }
}
