/**
 * src/app/api/support/tickets/[id]/polish/route.ts
 *
 * POST /api/support/tickets/:id/polish
 * AI-polishes an agent's draft reply without changing its meaning.
 */

import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getDb } from '@/libs/DB';
import { supportTicketSchema } from '@/models/Schema';
import { polishAgentReply } from '@/lib/support-ai';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { orgId } = await auth();

  if (!orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    .select({
      subject: supportTicketSchema.subject,
      submitterName: supportTicketSchema.submitterName,
      orgId: supportTicketSchema.orgId,
    })
    .from(supportTicketSchema)
    .where(eq(supportTicketSchema.id, id));

  if (!ticket || ticket.orgId !== orgId) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
  }

  const result = await polishAgentReply(body.draft, {
    subject: ticket.subject,
    clientName: ticket.submitterName,
  });

  return NextResponse.json(result);
}