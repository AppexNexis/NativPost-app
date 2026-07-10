import { eq, and } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { contentAngleSchema } from '@/models/Schema';

type RouteParams = { params: Promise<{ id: string }> };

function parseAngleDescription(raw: string | null): { description: string; targetAudience: string } {
  if (!raw) return { description: '', targetAudience: '' };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      return {
        description: String(parsed.description ?? ''),
        targetAudience: String(parsed.targetAudience ?? ''),
      };
    }
  } catch {
    // Not JSON — treat as plain description (legacy angles)
  }
  return { description: raw, targetAudience: '' };
}

// -----------------------------------------------------------
// PATCH /api/content-angles/[id]
// Body: { name?, description?, targetAudience? }
// Only org-owned (non-system) angles can be edited
// -----------------------------------------------------------
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

  try {
    const [existing] = await db
      .select()
      .from(contentAngleSchema)
      .where(
        and(
          eq(contentAngleSchema.id, id),
          eq(contentAngleSchema.orgId, orgId!),
        ),
      )
      .limit(1);

    if (!existing || existing.isSystem) {
      return NextResponse.json(
        { error: 'Angle not found or is a system angle' },
        { status: 404 },
      );
    }

    const body = (await request.json()) as {
      name?: string;
      description?: string;
      targetAudience?: string;
      color?: string;
    };

    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      updates.name = body.name.trim();
    }

    if (body.description !== undefined || body.targetAudience !== undefined) {
      const existing_parsed = parseAngleDescription(existing.description);
      updates.description = JSON.stringify({
        description: body.description?.trim() ?? existing_parsed.description,
        targetAudience: body.targetAudience?.trim() ?? existing_parsed.targetAudience,
      });
    }

    if (body.color !== undefined) {
      updates.color = body.color;
    }

    const [updated] = await db
      .update(contentAngleSchema)
      .set(updates)
      .where(eq(contentAngleSchema.id, id))
      .returning();

    return NextResponse.json({ angle: updated, item: updated }, { status: 200 });
  } catch (err) {
    console.error('[ContentAngles] PATCH failed:', err);
    return NextResponse.json({ error: 'Failed to update angle' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// DELETE /api/content-angles/[id]
// Soft-deletes (sets isActive=false) — org-owned only
// -----------------------------------------------------------
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

  try {
    const [existing] = await db
      .select()
      .from(contentAngleSchema)
      .where(
        and(
          eq(contentAngleSchema.id, id),
          eq(contentAngleSchema.orgId, orgId!),
        ),
      )
      .limit(1);

    if (!existing || existing.isSystem) {
      return NextResponse.json(
        { error: 'Angle not found or is a system angle' },
        { status: 404 },
      );
    }

    await db
      .update(contentAngleSchema)
      .set({ isActive: false })
      .where(eq(contentAngleSchema.id, id));

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('[ContentAngles] DELETE failed:', err);
    return NextResponse.json({ error: 'Failed to delete angle' }, { status: 500 });
  }
}
