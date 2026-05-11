/**
 * src/app/api/admin/support/tickets/[id]/route.ts
 *
 * GET   → full ticket + messages + org info
 * PATCH → update status, assign, set priority
 */

import { auth } from '@clerk/nextjs/server';
import { asc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getDb } from '@/libs/DB';
import {
  organizationSchema,
  supportAttachmentSchema,
  supportMessageSchema,
  supportTicketSchema,
} from '@/models/Schema';
import { sendTicketClosedNotification } from '@/lib/support-email';

type RouteContext = { params: Promise<{ id: string }> };

function isNativPostStaff(
  orgId: string | null | undefined,
  orgRole: string | null | undefined,
): boolean {
  const teamOrgId = process.env.NATIVPOST_TEAM_ORG_ID;
  if (!teamOrgId) return false;
  return orgId === teamOrgId && orgRole === 'org:admin';
}

// -----------------------------------------------------------
// GET — Full ticket with messages + org details
// -----------------------------------------------------------
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { userId, orgId, orgRole } = await auth();

  if (!userId || !isNativPostStaff(orgId, orgRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const db = await getDb();

  const [ticket] = await db
    .select()
    .from(supportTicketSchema)
    .where(eq(supportTicketSchema.id, id));

  if (!ticket) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const [org] = await db
    .select({
      id:         organizationSchema.id,
      plan:       organizationSchema.plan,
      planStatus: organizationSchema.planStatus,
    })
    .from(organizationSchema)
    .where(eq(organizationSchema.id, ticket.orgId));

  const messages = await db
    .select()
    .from(supportMessageSchema)
    .where(eq(supportMessageSchema.ticketId, id))
    .orderBy(asc(supportMessageSchema.createdAt));

  const attachments = await db
    .select()
    .from(supportAttachmentSchema)
    .where(eq(supportAttachmentSchema.ticketId, id));

  return NextResponse.json({ ticket, org, messages, attachments });
}

// -----------------------------------------------------------
// PATCH — Update ticket (status, assignment, priority)
// -----------------------------------------------------------
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { userId, orgId, orgRole } = await auth();

  if (!userId || !isNativPostStaff(orgId, orgRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const db = await getDb();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: Partial<typeof supportTicketSchema.$inferInsert> = {};

  if (body.status && typeof body.status === 'string') {
    updates.status = body.status;
    if (body.status === 'resolved') {
      updates.resolvedAt = new Date();
      const [ticket] = await db
        .select()
        .from(supportTicketSchema)
        .where(eq(supportTicketSchema.id, id));
      if (ticket?.submitterEmail) {
        sendTicketClosedNotification(
          ticket.submitterEmail,
          ticket.submitterName,
          ticket.subject,
          id,
        ).catch(() => {});
      }
    }
    if (body.status === 'closed') updates.closedAt = new Date();
  }
  if (body.assignedToUserId !== undefined) {
    updates.assignedToUserId = (body.assignedToUserId as string) || null;
  }
  if (body.aiPriority && typeof body.aiPriority === 'string') {
    updates.aiPriority = body.aiPriority;
  }

  const [updated] = await db
    .update(supportTicketSchema)
    .set(updates)
    .where(eq(supportTicketSchema.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ ticket: updated });
}