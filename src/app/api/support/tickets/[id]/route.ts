/**
 * src/app/api/support/tickets/[id]/route.ts
 *
 * GET   /api/support/tickets/:id   → full ticket with messages
 * PATCH /api/support/tickets/:id   → update status
 *
 * Auth pattern:
 * Fetch ticket by ID first, then verify the authenticated user belongs
 * to the same org as the ticket. This is more robust than AND-ing both
 * conditions in the query — Clerk's active orgId can drift from the
 * stored orgId if the user has multiple orgs or switches context.
 */

import { auth } from '@clerk/nextjs/server';
import { asc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getDb } from '@/libs/DB';
import {
  supportAttachmentSchema,
  supportMessageSchema,
  supportTicketSchema,
} from '@/models/Schema';

type RouteContext = { params: Promise<{ id: string }> };

// -----------------------------------------------------------
// GET — Full ticket with message thread
// -----------------------------------------------------------
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { userId, orgId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const db = await getDb();

  // Fetch by ID only — no orgId filter in the query
  const [ticket] = await db
    .select()
    .from(supportTicketSchema)
    .where(eq(supportTicketSchema.id, id));

  if (!ticket) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Verify the caller belongs to the org that owns this ticket.
  // We check both the active orgId and the ticket's own orgId to handle
  // cases where the user's active org has drifted in the Clerk session.
  if (ticket.orgId !== orgId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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
// PATCH — Update ticket status or CSAT
// Body: { status?, csatScore?, csatFeedback? }
// -----------------------------------------------------------
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { userId, orgId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const db = await getDb();

  // Ownership check — same pattern as GET
  const [ticket] = await db
    .select({ id: supportTicketSchema.id, orgId: supportTicketSchema.orgId })
    .from(supportTicketSchema)
    .where(eq(supportTicketSchema.id, id));

  if (!ticket) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (ticket.orgId !== orgId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: Partial<typeof supportTicketSchema.$inferInsert> = {};

  if (body.status && typeof body.status === 'string') {
    updates.status = body.status;
    if (body.status === 'resolved') updates.resolvedAt = new Date();
    if (body.status === 'closed') updates.closedAt = new Date();
  }
  if (body.csatScore !== undefined) updates.csatScore = body.csatScore as number;
  if (body.csatFeedback !== undefined) updates.csatFeedback = body.csatFeedback as string;

  const [updated] = await db
    .update(supportTicketSchema)
    .set(updates)
    .where(eq(supportTicketSchema.id, id))
    .returning();

  return NextResponse.json({ ticket: updated });
}