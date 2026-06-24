import { eq, and, desc, gte } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { engineRequestLogSchema } from '@/models/Schema';

// -----------------------------------------------------------
// GET /api/analytics/engine-logs
// Returns engine request logs for cost tracking
// Query: ?timeRange=30d&limit=50
// -----------------------------------------------------------
export async function GET(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const timeRange = searchParams.get('timeRange') || '30d';
  const limit = Math.min(Number(searchParams.get('limit')) || 50, 100);

  const days = Number(timeRange.replace('d', '')) || 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const logs = await db
      .select()
      .from(engineRequestLogSchema)
      .where(
        and(
          eq(engineRequestLogSchema.orgId, orgId!),
          gte(engineRequestLogSchema.createdAt, since),
        ),
      )
      .orderBy(desc(engineRequestLogSchema.createdAt))
      .limit(limit);

    return NextResponse.json({ logs }, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch engine logs:', err);
    return NextResponse.json({ error: 'Failed to fetch engine logs' }, { status: 500 });
  }
}
