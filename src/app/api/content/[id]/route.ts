import { clerkClient } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { sendScheduledNotification } from '@/lib/email';
import { getDb } from '@/libs/DB';
import { brandProfileSchema, contentItemSchema } from '@/models/Schema';

type RouteParams = {
  params: Promise<{ id: string }>;
};

const ENGINE_URL = process.env.NATIVPOST_ENGINE_URL || 'http://localhost:8000';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

// -----------------------------------------------------------
// Fire-and-forget: send a feedback signal to the engine.
// Never throws — errors are logged only.
// -----------------------------------------------------------
async function sendFeedbackToEngine(payload: {
  brand_name: string;
  feedback_type: 'approved' | 'rejected' | 'edited';
  caption?: string;
  reason?: string;
  original_caption?: string;
  edited_caption?: string;
}) {
  try {
    await fetch(`${ENGINE_URL}/api/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ENGINE_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[Feedback] Failed to send signal to engine:', err);
  }
}

// -----------------------------------------------------------
// GET /api/content/[id]
// -----------------------------------------------------------
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
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
//
// Phase 4: After updating, sends a feedback signal to the engine:
//   - status=approved → "approved" signal with the final caption
//   - status=rejected → "rejected" signal with optional rejectionFeedback
//   - caption changed → "edited" signal with original + new caption
//
// platformSpecific is MERGED not replaced — sending
// { platformSpecific: { linkedin: "..." } } updates only that key.
// -----------------------------------------------------------
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId, userId } = await getAuthContext();
  if (error) {
    return error;
  }

  const { id } = await params;

  try {
    const body = await request.json();

    // Fetch current item before updating — needed for feedback diff and brand name
    const [current] = await db
      .select()
      .from(contentItemSchema)
      .where(and(eq(contentItemSchema.id, id), eq(contentItemSchema.orgId, orgId!)))
      .limit(1);

    if (!current) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
    }

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
      const existing = (current?.platformSpecific as Record<string, unknown>) || {};
      updates.platformSpecific = { ...existing, ...body.platformSpecific };
    }
    if (body.isSelectedVariant !== undefined) {
      updates.isSelectedVariant = Boolean(body.isSelectedVariant);
    }
    if (body.engagementData !== undefined) {
      updates.engagementData = body.engagementData;
    }
    if (body.graphicUrls !== undefined) {
      if (!Array.isArray(body.graphicUrls)) {
        return NextResponse.json({ error: 'graphicUrls must be an array' }, { status: 400 });
      }
      const urls = body.graphicUrls.filter(
        (u: unknown) => typeof u === 'string' && u.startsWith('http'),
      );
      updates.graphicUrls = urls;
    }
    if (body.contentMode !== undefined) {
      const validModes = ['normal', 'concise', 'controversial'];
      if (validModes.includes(body.contentMode)) {
        updates.contentMode = body.contentMode;
      }
    }
    if (body.enrichmentData !== undefined) {
      updates.enrichmentData = body.enrichmentData;
    }
    if (body.enrichmentApplied !== undefined) {
      updates.enrichmentApplied = body.enrichmentApplied;
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

    // ── Phase 4: feedback signals ─────────────────────────────────────────────
    // Fetch brand name for feedback — non-blocking, best-effort
    const getBrandName = async (): Promise<string> => {
      try {
        const [profile] = await db
          .select({ brandName: brandProfileSchema.brandName })
          .from(brandProfileSchema)
          .where(eq(brandProfileSchema.orgId, orgId!))
          .limit(1);
        return profile?.brandName || 'unknown';
      } catch {
        return 'unknown';
      }
    };

    // Fire feedback signals without awaiting — never block the response
    if (body.status === 'approved') {
      getBrandName().then((brandName) => {
        sendFeedbackToEngine({
          brand_name: brandName,
          feedback_type: 'approved',
          caption: updated.caption,
        });
      });
    } else if (body.status === 'rejected') {
      getBrandName().then((brandName) => {
        sendFeedbackToEngine({
          brand_name: brandName,
          feedback_type: 'rejected',
          reason: body.rejectionFeedback || undefined,
        });
      });
    }

    // Caption edit signal — fires when caption changed but status not explicitly set
    if (
      body.caption !== undefined
      && body.caption !== current.caption
      && body.status !== 'rejected'
    ) {
      getBrandName().then((brandName) => {
        sendFeedbackToEngine({
          brand_name: brandName,
          feedback_type: 'edited',
          original_caption: current.caption,
          edited_caption: body.caption,
        });
      });
    }
    // ── End feedback signals ──────────────────────────────────────────────────

    // Scheduled notification email (unchanged from original)
    if (body.status === 'scheduled' && body.scheduledFor) {
      try {
        const clerk = await clerkClient();
        const [user, org] = await Promise.all([
          clerk.users.getUser(userId!),
          clerk.organizations.getOrganization({ organizationId: orgId! }),
        ]);
        const userEmail = user.emailAddresses[0]?.emailAddress;
        const orgName = org.name || orgId!;
        const platforms = (updated.targetPlatforms as string[]).join(', ');

        if (userEmail && updated.scheduledFor) {
          sendScheduledNotification(
            userEmail,
            orgName,
            platforms,
            updated.caption,
            updated.scheduledFor,
          ).catch(err => console.error('[Email] sendScheduledNotification failed:', err));
        }
      } catch (emailErr) {
        console.error('[Email] Failed to send schedule notification:', emailErr);
      }
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
  const db = await getDb();
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
