/**
 * src/app/api/support/tickets/[id]/reply/route.ts
 *
 * POST /api/support/tickets/:id/reply
 * Adds a reply message to a ticket thread and emails the client.
 */

import { auth, currentUser } from '@clerk/nextjs/server';
import { eq, inArray } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getDb } from '@/libs/DB';
import { supportMessageSchema, supportTicketSchema } from '@/models/Schema';
import { sendReplyNotification } from '@/lib/support-email';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { orgId } = await auth();
  const user = await currentUser();

  if (!orgId || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  let body: { body: string; isInternal?: boolean; aiPolished?: boolean; originalBody?: string };
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

  if (!ticket || ticket.orgId !== orgId) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
  }

  const authorName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
    || user.emailAddresses[0]?.emailAddress
    || 'Support Agent';
  const authorEmail = user.emailAddresses[0]?.emailAddress ?? '';
  const isInternal = body.isInternal === true;

  const [message] = await db
    .insert(supportMessageSchema)
    .values({
      ticketId: id,
      authorType: 'agent',
      authorUserId: user.id,
      authorName,
      authorEmail,
      body: body.body.trim(),
      isInternal,
      aiPolished: body.aiPolished === true,
      originalBody: body.originalBody ?? null,
    })
    .returning();

  // Move ticket to in_progress if it was open or auto_resolved
  if (inArray(supportTicketSchema.status, ['open', 'auto_resolved'])) {
    await db
      .update(supportTicketSchema)
      .set({ status: 'in_progress' })
      .where(eq(supportTicketSchema.id, id));
  }

  // Email the client for external replies only
  if (!isInternal && ticket.submitterEmail) {
    sendReplyNotification(
      ticket.submitterEmail,
      ticket.submitterName,
      ticket.subject,
      body.body.trim(),
      id,
    ).catch((e) => console.warn('[support] reply email failed:', e));
  }

  return NextResponse.json({ message }, { status: 201 });
}