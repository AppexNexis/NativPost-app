import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { db } from '@/libs/DB';
import { contentItemSchema } from '@/models/Schema';

type RouteParams = {
  params: Promise<{ id: string }>;
};

// -----------------------------------------------------------
// GET /api/content/[id]
// -----------------------------------------------------------
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const { id } = await params;

  try {
    const [item] = await db
      .select()
      .from(contentItemSchema)
      .where(
        and(
          eq(contentItemSchema.id, id),
          eq(contentItemSchema.orgId, orgId!),
        ),
      )
      .limit(1);

    if (!item) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
    }

    return NextResponse.json({ item }, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch content item:', err);
    return NextResponse.json({ error: 'Failed to fetch content item' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// PATCH /api/content/[id]
// Update caption, status, scheduledFor, graphicUrls, etc.
// -----------------------------------------------------------
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const { id } = await params;

  try {
    const body = await request.json();

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (body.caption !== undefined) {
      updates.caption = String(body.caption);
    }
    if (body.hashtags !== undefined) {
      updates.hashtags = body.hashtags;
    }

    if (body.status !== undefined) {
      const validStatuses = ['draft', 'pending_review', 'approved', 'scheduled', 'published', 'rejected'];
      if (validStatuses.includes(body.status)) {
        updates.status = body.status;
      }
    }

    if (body.scheduledFor !== undefined) {
      updates.scheduledFor = body.scheduledFor ? new Date(body.scheduledFor) : null;
    }

    if (body.publishedAt !== undefined) {
      updates.publishedAt = body.publishedAt ? new Date(body.publishedAt) : null;
    }

    if (body.rejectionFeedback !== undefined) {
      updates.rejectionFeedback = body.rejectionFeedback;
    }

    if (body.targetPlatforms !== undefined) {
      updates.targetPlatforms = body.targetPlatforms;
    }

    if (body.platformSpecific !== undefined) {
      updates.platformSpecific = body.platformSpecific;
    }

    if (body.isSelectedVariant !== undefined) {
      updates.isSelectedVariant = Boolean(body.isSelectedVariant);
    }

    if (body.engagementData !== undefined) {
      updates.engagementData = body.engagementData;
    }

    // --- Graphic URLs (image/carousel media) ---
    if (body.graphicUrls !== undefined) {
      if (!Array.isArray(body.graphicUrls)) {
        return NextResponse.json({ error: 'graphicUrls must be an array' }, { status: 400 });
      }
      // Validate each entry is a string URL
      const urls = body.graphicUrls.filter(
        (u: unknown) => typeof u === 'string' && u.startsWith('http'),
      );
      updates.graphicUrls = urls;
    }

    const [updated] = await db
      .update(contentItemSchema)
      .set(updates)
      .where(
        and(
          eq(contentItemSchema.id, id),
          eq(contentItemSchema.orgId, orgId!),
        ),
      )
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
    }

    return NextResponse.json({ item: updated }, { status: 200 });
  } catch (err) {
    console.error('Failed to update content item:', err);
    return NextResponse.json({ error: 'Failed to update content item' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// DELETE /api/content/[id]
// -----------------------------------------------------------
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const { id } = await params;

  try {
    const [deleted] = await db
      .delete(contentItemSchema)
      .where(
        and(
          eq(contentItemSchema.id, id),
          eq(contentItemSchema.orgId, orgId!),
        ),
      )
      .returning({ id: contentItemSchema.id });

    if (!deleted) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
    }

    return NextResponse.json({ deleted: true }, { status: 200 });
  } catch (err) {
    console.error('Failed to delete content item:', err);
    return NextResponse.json({ error: 'Failed to delete content item' }, { status: 500 });
  }
}
