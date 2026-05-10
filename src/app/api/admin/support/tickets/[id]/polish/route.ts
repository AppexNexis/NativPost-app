/**
 * src/app/api/admin/support/tickets/[id]/polish/route.ts
 * AI polish for admin agent drafts — NativPost staff only.
 */

import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getDb } from '@/libs/DB';
import { supportTicketSchema } from '@/models/Schema';
import { polishAgentReply } from '@/lib/support-ai';

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

  let body: { draft: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.draft?.trim()) {
    return NextResponse.json({ error: 'Draft text required' }, { status: 400 });
  }

  const db = await getDb();

  const [ticket] = await db
    .select({ subject: supportTicketSchema.subject, submitterName: supportTicketSchema.submitterName })
    .from(supportTicketSchema)
    .where(eq(supportTicketSchema.id, id));

  if (!ticket) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
  }

  const result = await polishAgentReply(body.draft, {
    subject: ticket.subject,
    clientName: ticket.submitterName,
  });

  return NextResponse.json(result);
}