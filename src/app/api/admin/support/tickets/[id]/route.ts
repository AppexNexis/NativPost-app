/**
 * src/app/api/admin/support/tickets/[id]/route.ts
 *
 * Admin ticket operations — no orgId restriction.
 *
 * GET   → full ticket + messages + org info
 * PATCH → update status, assign, set priority override
 */

import { auth, clerkClient } from '@clerk/nextjs/server';
import { asc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getDb } from '@/libs/DB';
import {
  organizationSchema,
  supportAttachmentSchema,
  supportMessageSchema,
  supportTicketSchema,
} from '@/models/Schema';
import { sendReplyNotification, sendTicketClosedNotification } from '@/lib/support-email';
import { polishAgentReply } from '@/lib/support-ai';

type RouteContext = { params: Promise<{ id: string }> };

// -----------------------------------------------------------
// GET — Full ticket with messages + org details
// -----------------------------------------------------------
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { userId, orgRole } = await auth();
  if (!userId || orgRole !== 'org:admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const db = await getDb();

  const [ticket] = await db
    .select()
    .from(supportTicketSchema)
    .where(eq(supportTicketSchema.id, id));

  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Fetch the org name for display
  const [org] = await db
    .select({ id: organizationSchema.id, plan: organizationSchema.plan, planStatus: organizationSchema.planStatus })
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
// Body: { status?, assignedToUserId?, aiPriority? }
// -----------------------------------------------------------
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { userId, orgRole } = await auth();
  if (!userId || orgRole !== 'org:admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const db = await getDb();
  const body = await req.json();

  const updates: Partial<typeof supportTicketSchema.$inferInsert> = {};

  if (body.status) {
    updates.status = body.status;
    if (body.status === 'resolved') {
      updates.resolvedAt = new Date();
      // Fetch ticket to send CSAT email
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
    updates.assignedToUserId = body.assignedToUserId || null;
  }
  if (body.aiPriority) {
    updates.aiPriority = body.aiPriority;
  }

  const [updated] = await db
    .update(supportTicketSchema)
    .set(updates)
    .where(eq(supportTicketSchema.id, id))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ticket: updated });
}

// -----------------------------------------------------------
// POST — Agent reply or AI polish (sub-action via URL)
// -----------------------------------------------------------
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { userId, orgRole } = await auth();
  if (!userId || orgRole !== 'org:admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const url = req.nextUrl.pathname;
  const db = await getDb();

  // Fetch agent name from Clerk
  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId).catch(() => null);
  const agentName = clerkUser
    ? `${clerkUser.firstName ?? ''} ${clerkUser.lastName ?? ''}`.trim() || 'Support Agent'
    : 'Support Agent';
  const agentEmail = clerkUser?.emailAddresses[0]?.emailAddress ?? '';

  if (url.endsWith('/reply')) {
    const body = await req.json();
    if (!body.body?.trim()) {
      return NextResponse.json({ error: 'Reply body required' }, { status: 400 });
    }

    const [ticket] = await db
      .select()
      .from(supportTicketSchema)
      .where(eq(supportTicketSchema.id, id));

    if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const isInternal = body.isInternal === true;

    const [message] = await db
      .insert(supportMessageSchema)
      .values({
        ticketId: id,
        authorType: 'agent',
        authorUserId: userId,
        authorName: agentName,
        authorEmail: agentEmail,
        body: body.body.trim(),
        isInternal,
        aiPolished: body.aiPolished === true,
        originalBody: body.originalBody ?? null,
      })
      .returning();

    // Move ticket to in_progress if open
    if (['open', 'auto_resolved'].includes(ticket.status)) {
      await db
        .update(supportTicketSchema)
        .set({ status: 'in_progress', assignedToUserId: userId })
        .where(eq(supportTicketSchema.id, id));
    }

    // Email client (not for internal notes)
    if (!isInternal && ticket.submitterEmail) {
      sendReplyNotification(
        ticket.submitterEmail,
        ticket.submitterName,
        ticket.subject,
        body.body.trim(),
        id,
      ).catch(() => {});
    }

    return NextResponse.json({ message }, { status: 201 });
  }

  if (url.endsWith('/polish')) {
    const body = await req.json();
    if (!body.draft?.trim()) {
      return NextResponse.json({ error: 'Draft required' }, { status: 400 });
    }

    const [ticket] = await db
      .select({ subject: supportTicketSchema.subject, submitterName: supportTicketSchema.submitterName })
      .from(supportTicketSchema)
      .where(eq(supportTicketSchema.id, id));

    if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const result = await polishAgentReply(body.draft, {
      subject: ticket.subject,
      clientName: ticket.submitterName,
    });

    return NextResponse.json(result);
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}