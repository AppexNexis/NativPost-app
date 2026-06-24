import { eq, and } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { contentAngleSchema } from '@/models/Schema';

// -----------------------------------------------------------
// GET /api/content-angles
// List content angles (system + org-specific)
// -----------------------------------------------------------
export async function GET(_request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  try {
    const items = await db
      .select()
      .from(contentAngleSchema)
      .where(
        and(
          eq(contentAngleSchema.isActive, true),
          // Either system angles (orgId IS NULL) or org-specific angles
          // Using a raw SQL approach for the OR condition
        )
      )
      .orderBy(contentAngleSchema.name);

    // Filter in application layer for the OR condition
    // System angles (orgId is null) OR org-specific angles for this org
    const filtered = items.filter(
      (item) => item.isSystem || item.orgId === orgId
    );

    return NextResponse.json({ items: filtered }, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch angles:', err);
    return NextResponse.json({ error: 'Failed to fetch angles' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// POST /api/content-angles
// Create a new org-specific content angle
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  try {
    const body = await request.json();

    const [created] = await db
      .insert(contentAngleSchema)
      .values({
        orgId: orgId!,
        name: body.name,
        description: body.description || null,
        color: body.color || null,
        isSystem: false,
      })
      .returning();

    return NextResponse.json({ item: created }, { status: 201 });
  } catch (err) {
    console.error('Failed to create angle:', err);
    return NextResponse.json({ error: 'Failed to create angle' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// PATCH /api/content-angles/[id]
// Update a content angle
// -----------------------------------------------------------
export async function PATCH(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID required' }, { status: 400 });
    }

    const body = await request.json();

    // Verify this is an org-specific angle (not system)
    const [existing] = await db
      .select()
      .from(contentAngleSchema)
      .where(and(eq(contentAngleSchema.id, id), eq(contentAngleSchema.orgId, orgId!)))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: 'Angle not found or is system default' }, { status: 404 });
    }

    const updates: Record<string, any> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.color !== undefined) updates.color = body.color;
    if (body.isActive !== undefined) updates.isActive = body.isActive;

    const [updated] = await db
      .update(contentAngleSchema)
      .set(updates)
      .where(eq(contentAngleSchema.id, id))
      .returning();

    return NextResponse.json({ item: updated }, { status: 200 });
  } catch (err) {
    console.error('Failed to update angle:', err);
    return NextResponse.json({ error: 'Failed to update angle' }, { status: 500 });
  }
}
