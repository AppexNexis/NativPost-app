/**
 * src/app/api/support/tickets/[id]/route.ts
 *
 * GET   /api/support/tickets/:id          → full ticket with messages
 * PATCH /api/support/tickets/:id          → update status, assignee
 * POST  /api/support/tickets/:id/reply    → add reply message
 * POST  /api/support/tickets/:id/polish   → AI polish a draft reply
 */

import { auth, currentUser } from '@clerk/nextjs/server';
import { and, asc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getDb } from '@/libs/DB';
import {
  supportAttachmentSchema,
  supportMessageSchema,
  supportTicketSchema,
} from '@/models/Schema';
import { polishAgentReply } from '@/lib/support-ai';
import { sendReplyNotification } from '@/lib/support-email';

type RouteContext = { params: Promise<{ id: string }> };

// -----------------------------------------------------------
// GET — Full ticket with message thread
// -----------------------------------------------------------
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const db = await getDb();

  const [ticket] = await db
    .select()
    .from(supportTicketSchema)
    .where(and(eq(supportTicketSchema.id, id), eq(supportTicketSchema.orgId, orgId)));

  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const messages = await db
    .select()
    .from(supportMessageSchema)
    .where(eq(supportMessageSchema.ticketId, id))
    .orderBy(asc(supportMessageSchema.createdAt));

  const attachments = await db
    .select()
    .from(supportAttachmentSchema)
    .where(eq(supportAttachmentSchema.ticketId, id));

  return NextResponse.json({ ticket, messages, attachments });
}

// -----------------------------------------------------------
// PATCH — Update ticket status or assignment
// Body: { status?, assignedToUserId?, csatScore?, csatFeedback? }
// -----------------------------------------------------------
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const db = await getDb();
  const body = await req.json();

  const updates: Partial<typeof supportTicketSchema.$inferInsert> = {};

  if (body.status) {
    updates.status = body.status;
    if (body.status === 'resolved') updates.resolvedAt = new Date();
    if (body.status === 'closed') updates.closedAt = new Date();
  }
  if (body.assignedToUserId !== undefined) updates.assignedToUserId = body.assignedToUserId;
  if (body.csatScore !== undefined) updates.csatScore = body.csatScore;
  if (body.csatFeedback !== undefined) updates.csatFeedback = body.csatFeedback;

  const [updated] = await db
    .update(supportTicketSchema)
    .set(updates)
    .where(and(eq(supportTicketSchema.id, id), eq(supportTicketSchema.orgId, orgId)))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ ticket: updated });
}

// -----------------------------------------------------------
// POST /api/support/tickets/:id/reply — Add a message to thread
// Body: { body, isInternal? }
// -----------------------------------------------------------
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { orgId } = await auth();
  const user = await currentUser();
  if (!orgId || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const url = req.nextUrl.pathname;
  const db = await getDb();

  // Route: /reply
  if (url.endsWith('/reply')) {
    const body = await req.json();
    if (!body.body?.trim()) return NextResponse.json({ error: 'Reply body required' }, { status: 400 });

    const [ticket] = await db
      .select()
      .from(supportTicketSchema)
      .where(and(eq(supportTicketSchema.id, id), eq(supportTicketSchema.orgId, orgId)));

    if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });

    const agentName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
      || user.emailAddresses[0]?.emailAddress
      || 'Support Agent';
    const agentEmail = user.emailAddresses[0]?.emailAddress ?? '';
    const isInternal = body.isInternal === true;

    const [message] = await db
      .insert(supportMessageSchema)
      .values({
        ticketId: id,
        authorType: 'agent',
        authorUserId: user.id,
        authorName: agentName,
        authorEmail: agentEmail,
        body: body.body.trim(),
        isInternal,
        aiPolished: body.aiPolished === true,
        originalBody: body.originalBody ?? null,
      })
      .returning();

    // Move ticket to in_progress if it was open/auto_resolved
    if (['open', 'auto_resolved'].includes(ticket.status)) {
      await db
        .update(supportTicketSchema)
        .set({ status: 'in_progress' })
        .where(eq(supportTicketSchema.id, id));
    }

    // Email the client if this is an external reply
    if (!isInternal && ticket.submitterEmail) {
      await sendReplyNotification(
        ticket.submitterEmail,
        ticket.submitterName,
        ticket.subject,
        body.body.trim(),
        id,
      ).catch((e) => console.warn('[support] reply email failed:', e));
    }

    return NextResponse.json({ message }, { status: 201 });
  }

  // Route: /polish
  if (url.endsWith('/polish')) {
    const body = await req.json();
    if (!body.draft?.trim()) return NextResponse.json({ error: 'Draft required' }, { status: 400 });

    const [ticket] = await db
      .select({ subject: supportTicketSchema.subject, submitterName: supportTicketSchema.submitterName })
      .from(supportTicketSchema)
      .where(and(eq(supportTicketSchema.id, id), eq(supportTicketSchema.orgId, orgId)));

    if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });

    const result = await polishAgentReply(body.draft, {
      subject: ticket.subject,
      clientName: ticket.submitterName,
    });

    return NextResponse.json(result);
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}