import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { contentTemplateSchema } from '@/models/Schema';

type RouteParams = { params: Promise<{ id: string }> };

// -----------------------------------------------------------
// GET /api/templates/[id]
// Get a single template by ID
// -----------------------------------------------------------
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

  try {
    const [item] = await db
      .select()
      .from(contentTemplateSchema)
      .where(eq(contentTemplateSchema.id, id))
      .limit(1);

    if (!item) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({ item }, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch template:', err);
    return NextResponse.json({ error: 'Failed to fetch template' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// PATCH /api/templates/[id]
// Update template (curation, status, metadata)
// -----------------------------------------------------------
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

  try {
    const body = await request.json();

    const updates: Record<string, any> = {};
    if (body.curationStatus !== undefined) updates.curationStatus = body.curationStatus;
    if (body.curatedBy !== undefined) updates.curatedBy = body.curatedBy;
    if (body.curatedAt !== undefined) updates.curatedAt = new Date(body.curatedAt);
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    if (body.engagementScore !== undefined) updates.engagementScore = body.engagementScore;
    if (body.niches !== undefined) updates.niches = body.niches;
    if (body.angles !== undefined) updates.angles = body.angles;
    if (body.structure !== undefined) updates.structure = body.structure;
    if (body.thumbnailUrl !== undefined) updates.thumbnailUrl = body.thumbnailUrl;
    if (body.mediaUrl !== undefined) updates.mediaUrl = body.mediaUrl;
    updates.updatedAt = new Date();

    const [updated] = await db
      .update(contentTemplateSchema)
      .set(updates)
      .where(eq(contentTemplateSchema.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({ item: updated }, { status: 200 });
  } catch (err) {
    console.error('Failed to update template:', err);
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// DELETE /api/templates/[id]
// Soft delete by setting isActive = false
// -----------------------------------------------------------
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

  try {
    const [updated] = await db
      .update(contentTemplateSchema)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(contentTemplateSchema.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('Failed to delete template:', err);
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
  }
}
