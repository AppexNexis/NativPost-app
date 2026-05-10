/**
 * src/app/api/support/tickets/[id]/reply/route.ts
 *
 * POST /api/support/tickets/:id/reply
 *
 * Saves the client's message to the DB and returns immediately.
 * The client then opens /stream to get Claude's response in real time.
 * No background AI processing here — streaming handles it all.
 */

import { auth, currentUser } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getDb } from '@/libs/DB';
import { supportMessageSchema, supportTicketSchema } from '@/models/Schema';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { userId, orgId } = await auth();
  const user = await currentUser();

  if (!userId || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  let body: { body: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.body?.trim()) {
    return NextResponse.json({ error: 'Reply body required' }, { status: 400 });
  }

  const db = await getDb();

  const [ticket] = await db
    .select()
    .from(supportTicketSchema)
    .where(eq(supportTicketSchema.id, id));

  if (!ticket) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
  }

  if (ticket.orgId !== orgId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const authorName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
    || user.emailAddresses[0]?.emailAddress
    || 'Client';
  const authorEmail = user.emailAddresses[0]?.emailAddress ?? '';

  const [message] = await db
    .insert(supportMessageSchema)
    .values({
      ticketId:     id,
      authorType:   'client',
      authorUserId: user.id,
      authorName,
      authorEmail,
      body:         body.body.trim(),
      isInternal:   false,
      aiPolished:   false,
      originalBody: null,
    })
    .returning();

  // Reopen ticket if it was resolved so the team sees the new message
  if (['resolved', 'closed', 'auto_resolved'].includes(ticket.status)) {
    await db
      .update(supportTicketSchema)
      .set({ status: 'open' })
      .where(eq(supportTicketSchema.id, id));
  }

  // Return the saved message — client will open /stream next
  return NextResponse.json({ message }, { status: 201 });
}