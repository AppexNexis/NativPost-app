import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { contentTemplateSchema } from '@/models/Schema';

type RouteParams = { params: Promise<{ id: string }> };

// -----------------------------------------------------------
// POST /api/templates/[id]/curate
// Approve, reject, or feature a template
// Body: { action: 'approve' | 'reject' | 'feature', feedback?: string }
// -----------------------------------------------------------
export async function POST(request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, userId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

  try {
    const body = await request.json();
    const { action, feedback } = body as {
      action: 'approve' | 'reject' | 'feature';
      feedback?: string;
    };

    if (!['approve', 'reject', 'feature'].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'approve', 'reject', or 'feature'" },
        { status: 400 }
      );
    }

    const updates: Record<string, any> = {
      curatedBy: userId,
      curatedAt: new Date(),
      updatedAt: new Date(),
    };

    if (action === 'approve') {
      updates.curationStatus = 'approved';
      updates.isActive = true;
    } else if (action === 'reject') {
      updates.curationStatus = 'rejected';
      updates.isActive = false;
    } else if (action === 'feature') {
      updates.curationStatus = 'featured';
      updates.isActive = true;
      // Store featured flag in structure metadata
      const [existing] = await db
        .select({ structure: contentTemplateSchema.structure })
        .from(contentTemplateSchema)
        .where(eq(contentTemplateSchema.id, id))
        .limit(1);
      const existingStructure = (existing?.structure as Record<string, any>) || {};
      updates.structure = { ...existingStructure, featured: true, curationFeedback: feedback || null };
    }

    // If feedback provided and not feature (which already stores it), add to structure
    if (feedback && action !== 'feature') {
      const [existing] = await db
        .select({ structure: contentTemplateSchema.structure })
        .from(contentTemplateSchema)
        .where(eq(contentTemplateSchema.id, id))
        .limit(1);
      const existingStructure = (existing?.structure as Record<string, any>) || {};
      updates.structure = { ...existingStructure, curationFeedback: feedback };
    }

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
    console.error('Failed to curate template:', err);
    return NextResponse.json({ error: 'Failed to curate template' }, { status: 500 });
  }
}
