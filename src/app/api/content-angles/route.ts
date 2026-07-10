import { eq, and, sql, asc } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { contentAngleSchema } from '@/models/Schema';

const ANGLE_COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#eab308'];

// -----------------------------------------------------------
// GET /api/content-angles
// Returns { angles: [...] } — system angles + org-specific angles
// -----------------------------------------------------------
export async function GET(_request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  try {
    const items = await db
      .select()
      .from(contentAngleSchema)
      .where(eq(contentAngleSchema.isActive, true))
      .orderBy(asc(contentAngleSchema.name));

    const filtered = items.filter(
      (item) => item.isSystem || item.orgId === orgId,
    );

    return NextResponse.json({ angles: filtered, items: filtered }, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch angles:', err);
    return NextResponse.json({ error: 'Failed to fetch angles' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// POST /api/content-angles
// Body: { name, description?, targetAudience? }
// targetAudience is serialized into the description column as JSON
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  try {
    const body = (await request.json()) as { name?: string; description?: string; targetAudience?: string; color?: string };

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    // Serialize description + targetAudience as JSON for storage
    const descriptionJson = JSON.stringify({
      description: body.description?.trim() ?? '',
      targetAudience: body.targetAudience?.trim() ?? '',
    });

    // Auto-assign color from rotation
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(contentAngleSchema)
      .where(and(eq(contentAngleSchema.orgId, orgId!), eq(contentAngleSchema.isActive, true)));
    const count = countRow?.count ?? 0;
    const color = body.color ?? ANGLE_COLORS[count % ANGLE_COLORS.length] ?? '#f97316';

    const [created] = await db
      .insert(contentAngleSchema)
      .values({
        orgId: orgId!,
        name: body.name.trim(),
        description: descriptionJson,
        color,
        isSystem: false,
        isActive: true,
      })
      .returning();

    return NextResponse.json({ angle: created, item: created }, { status: 201 });
  } catch (err) {
    console.error('Failed to create angle:', err);
    return NextResponse.json({ error: 'Failed to create angle' }, { status: 500 });
  }
}
