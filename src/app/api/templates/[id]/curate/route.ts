import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { contentTemplateSchema } from '@/models/Schema';

export const dynamic = 'force-dynamic';

const ADMIN_ORG_ID = process.env.NATIVPOST_TEAM_ORG_ID;

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
}

/**
 * PATCH /api/templates/[id]/curate
 *
 * Update a single template's curation status.
 * Body:
 *   {
 *     "status": "approved" | "rejected" | "pending",
 *     "reviewedBy": "admin@nativpost.com" // optional
 *   }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const db = await getDb();
  const { error, orgId, userId } = await getAuthContext();
  if (error) return error;

  if (!ADMIN_ORG_ID || orgId !== ADMIN_ORG_ID) {
    return forbidden('Admin access required.');
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { status, reviewedBy } = body;

    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const [existing] = await db
      .select({ id: contentTemplateSchema.id })
      .from(contentTemplateSchema)
      .where(eq(contentTemplateSchema.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const now = new Date();
    const [updated] = await db
      .update(contentTemplateSchema)
      .set({
        curationStatus: status,
        curatedBy: reviewedBy ?? userId ?? 'admin',
        curatedAt: status === 'pending' ? null : now,
        isActive: status === 'approved',
        updatedAt: now,
      })
      .where(eq(contentTemplateSchema.id, id))
      .returning();

    return NextResponse.json({ item: updated });
  } catch (err) {
    console.error('[Curate Template] PATCH failed:', err);
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
  }
}
