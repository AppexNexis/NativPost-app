import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { contentTemplateSchema } from '@/models/Schema';

const ADMIN_ORG_ID = process.env.NATIVPOST_TEAM_ORG_ID;

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
}

/**
 * GET /api/templates/admin
 *
 * Admin list of templates for curation.
 * Query params:
 *   ?status=pending|approved|rejected  (default: pending)
 *   ?limit=20
 *   ?offset=0
 *   ?source=pexels|youtube|...
 */
export async function GET(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  if (!ADMIN_ORG_ID || orgId !== ADMIN_ORG_ID) {
    return forbidden('Admin access required.');
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'pending';
  const source = searchParams.get('source');
  const limit = Math.min(Number(searchParams.get('limit')) || 50, 100);
  const offset = Number(searchParams.get('offset')) || 0;

  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  try {
    const conditions = [eq(contentTemplateSchema.curationStatus, status)];
    if (source) {
      conditions.push(eq(contentTemplateSchema.sourcePlatform, source));
    }

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
    });
  } catch (err) {
    console.error('[Admin Templates] GET failed:', err);
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
  }
}

/**
 * POST /api/templates/admin
 *
 * Bulk curation action.
 * Body:
 *   {
 *     "action": "approve" | "reject",
 *     "ids": ["uuid", "uuid"],
 *     "reviewedBy": "admin@nativpost.com" // optional
 *   }
 */
export async function POST(request: NextRequest) {
  const db = await getDb();
  const { error, orgId, userId } = await getAuthContext();
  if (error) return error;

  if (!ADMIN_ORG_ID || orgId !== ADMIN_ORG_ID) {
    return forbidden('Admin access required.');
  }

  try {
    const body = await request.json();
    const { action, ids, reviewedBy } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 });
    }

    const status = action === 'approve' ? 'approved' : 'rejected';
    const now = new Date();

    const result = await db
      .update(contentTemplateSchema)
      .set({
        curationStatus: status,
        curatedBy: reviewedBy ?? userId ?? 'admin',
        curatedAt: now,
        updatedAt: now,
      })
      .where(inArray(contentTemplateSchema.id, ids))
      .returning({ id: contentTemplateSchema.id });

    return NextResponse.json({
      action,
      status,
      updated: result.length,
      ids: result.map((r) => r.id),
    });
  } catch (err) {
    console.error('[Admin Templates] POST failed:', err);
    return NextResponse.json({ error: 'Failed to update templates' }, { status: 500 });
  }
}
