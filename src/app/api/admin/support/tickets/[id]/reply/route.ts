/**
 * src/app/api/admin/support/tickets/[id]/reply/route.ts
 * Admin agent reply — NativPost staff only.
 */

import { auth, clerkClient } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getDb } from '@/libs/DB';
import { supportMessageSchema, supportTicketSchema } from '@/models/Schema';
import { sendReplyNotification } from '@/lib/support-email';

type RouteContext = { params: Promise<{ id: string }> };

function isNativPostStaff(orgId: string | null | undefined, orgRole: string | null | undefined): boolean {
  const teamOrgId = process.env.NATIVPOST_TEAM_ORG_ID;
  if (!teamOrgId) return false;
  return orgId === teamOrgId && orgRole === 'org:admin';
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { userId, orgId, orgRole } = await auth();

  if (!userId || !isNativPostStaff(orgId, orgRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

  if (!ticket) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
  }

  const clerk = await clerkClient();
  const clerkUser = await clerk.users.getUser(userId).catch(() => null);
  const agentName = clerkUser
    ? `${clerkUser.firstName ?? ''} ${clerkUser.lastName ?? ''}`.trim() || 'Support Agent'
    : 'Support Agent';
  const agentEmail = clerkUser?.emailAddresses[0]?.emailAddress ?? '';
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

  if (['open', 'auto_resolved'].includes(ticket.status)) {
    await db
      .update(supportTicketSchema)
      .set({ status: 'in_progress', assignedToUserId: userId })
      .where(eq(supportTicketSchema.id, id));
  }

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