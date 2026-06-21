import { clerkClient } from '@clerk/nextjs/server';
import { and, desc, eq, ne } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { sendApprovalNotification } from '@/lib/email';
// import { db } from '@/libs/DB';
import { getDb } from '@/libs/DB';
import { contentItemSchema } from '@/models/Schema';

// -----------------------------------------------------------
// GET /api/content
// List content items for the current org (with optional filters)
// Query params: ?status=draft&limit=20&offset=0
// -----------------------------------------------------------
export async function GET(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const limit = Math.min(Number(searchParams.get('limit')) || 20, 100);
  const offset = Number(searchParams.get('offset')) || 0;

  try {
    const conditions = [eq(contentItemSchema.orgId, orgId!)];
    if (status) {
      conditions.push(eq(contentItemSchema.status, status));
    } else {
      // No status filter requested — archived variants are cleanup byproducts,
      // not content anyone should see by default. Callers that explicitly
      // want them can pass ?status=archived.
      conditions.push(ne(contentItemSchema.status, 'archived'));
    }

    const items = await db
      .select()
      .from(contentItemSchema)
      .where(and(...conditions))
      .orderBy(desc(contentItemSchema.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({ items, limit, offset }, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch content items:', err);
    return NextResponse.json(
      { error: 'Failed to fetch content items' },
      { status: 500 },
    );
  }
}

// -----------------------------------------------------------
// POST /api/content
// Create a new content item (manual or engine-generated)
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const db = await getDb();
  const { error, orgId, userId } = await getAuthContext();
  if (error) {
    return error;
  }

  try {
    const body = await request.json();

    const [created] = await db
      .insert(contentItemSchema)
      .values({
        orgId: orgId!,
        brandProfileId: body.brandProfileId || null,
        caption: String(body.caption || ''),
        hashtags: Array.isArray(body.hashtags) ? body.hashtags : [],
        contentType: String(body.contentType || 'single_image'),
        topic: body.topic ? String(body.topic) : null,
        graphicUrls: Array.isArray(body.graphicUrls) ? body.graphicUrls : [],
        graphicTemplateId: body.graphicTemplateId || null,
        variantGroupId: body.variantGroupId || null,
        variantNumber: Number(body.variantNumber) || 1,
        isSelectedVariant: Boolean(body.isSelectedVariant),
        targetPlatforms: Array.isArray(body.targetPlatforms) ? body.targetPlatforms : [],
        platformSpecific: body.platformSpecific || {},
        status: body.status || 'draft',
        scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
        antiSlopScore: body.antiSlopScore ? Number(body.antiSlopScore) : null,
        qualityFlags: Array.isArray(body.qualityFlags) ? body.qualityFlags : [],
      })
      .returning();

    // Send approval notification (non-blocking — never delays the response)
    try {
      const clerk = await clerkClient();
      const [user, org] = await Promise.all([
        clerk.users.getUser(userId!),
        clerk.organizations.getOrganization({ organizationId: orgId! }),
      ]);
      const userEmail = user.emailAddresses[0]?.emailAddress;
      const orgName = org.name || orgId!;
      if (userEmail) {
        sendApprovalNotification(userEmail, orgName, 1)
          .catch(err => console.error('[Email] sendApprovalNotification failed:', err));
      }
    } catch (emailErr) {
      console.error('[Email] Failed to send creation notification:', emailErr);
    }

    return NextResponse.json({ item: created }, { status: 201 });
  } catch (err) {
    console.error('Failed to create content item:', err);
    return NextResponse.json(
      { error: 'Failed to create content item' },
      { status: 500 },
    );
  }
}
