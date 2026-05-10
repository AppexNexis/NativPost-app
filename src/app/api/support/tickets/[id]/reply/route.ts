/**
 * src/app/api/support/tickets/[id]/reply/route.ts
 *
 * POST /api/support/tickets/:id/reply
 *
 * Saves the client's reply, then uses waitUntil to generate an
 * AI response in the background without blocking the client.
 */

import { waitUntil } from '@vercel/functions';
import { auth, currentUser } from '@clerk/nextjs/server';
import { and, asc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getDb } from '@/libs/DB';
import {
  knowledgeArticleSchema,
  supportMessageSchema,
  supportTicketSchema,
} from '@/models/Schema';
import { generateAutoReply } from '@/lib/support-ai';

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

  // Reopen ticket if it was resolved so the team sees the new reply
  if (['resolved', 'closed', 'auto_resolved'].includes(ticket.status)) {
    await db
      .update(supportTicketSchema)
      .set({ status: 'open' })
      .where(eq(supportTicketSchema.id, id));
  }

  // Generate AI response in background — kept alive by waitUntil
  waitUntil(
    generateAIReply(id, ticket.subject, ticket.submitterName),
  );

  return NextResponse.json({ message }, { status: 201 });
}

// -----------------------------------------------------------
// Generate an AI response to a client reply.
// Pulls the full conversation history for context so the AI
// understands what has already been discussed.
// -----------------------------------------------------------
async function generateAIReply(
  ticketId: string,
  subject: string,
  clientName: string,
) {
  let db: Awaited<ReturnType<typeof getDb>>;

  try {
    db = await getDb();
  } catch (err) {
    console.error('[support-ai] generateAIReply: DB connection failed:', err);
    return;
  }

  try {
    // Fetch full conversation so the AI has context
    const allMessages = await db
      .select({
        authorType: supportMessageSchema.authorType,
        authorName: supportMessageSchema.authorName,
        body:       supportMessageSchema.body,
      })
      .from(supportMessageSchema)
      .where(
        and(
          eq(supportMessageSchema.ticketId, ticketId),
          eq(supportMessageSchema.isInternal, false),
        ),
      )
      .orderBy(asc(supportMessageSchema.createdAt));

    // Build a readable conversation thread for the AI
    const conversationThread = allMessages
      .map((m) => {
        const role = m.authorType === 'client' ? 'Client' : 'Support';
        return `${role} (${m.authorName}): ${m.body}`;
      })
      .join('\n\n');

    // Fetch KB articles for context
    const articles = await db
      .select({ title: knowledgeArticleSchema.title, body: knowledgeArticleSchema.body })
      .from(knowledgeArticleSchema)
      .where(
        and(
          eq(knowledgeArticleSchema.isPublished, true),
          eq(knowledgeArticleSchema.isInternal, false),
        ),
      )
      .limit(5);

    const kbContext = articles
      .map((a) => `## ${a.title}\n${a.body}`)
      .join('\n\n---\n\n');

    // Use generateAutoReply with the full thread as the "body" so the AI
    // understands the ongoing conversation, not just the latest message
    const aiResponse = await generateAutoReply(
      subject,
      conversationThread,
      clientName,
      kbContext,
    );

    // Always insert a response — either the AI answer or a helpful acknowledgment
    const responseBody = aiResponse.canResolve && aiResponse.reply
      ? aiResponse.reply
      : buildFollowUpAcknowledgment(clientName);

    await db.insert(supportMessageSchema).values({
      ticketId,
      authorType: 'ai',
      authorName: 'NativPost Support',
      body:       responseBody,
      isInternal: false,
    });

    // If AI fully resolved, update ticket status
    if (aiResponse.canResolve && (aiResponse.confidence ?? 0) >= 0.7) {
      await db
        .update(supportTicketSchema)
        .set({ status: 'auto_resolved', aiAutoResolved: true, resolvedAt: new Date() })
        .where(eq(supportTicketSchema.id, ticketId));
    }
  } catch (err) {
    console.error(`[support-ai] generateAIReply failed for ticket ${ticketId}:`, err);

    // Fallback — always leave something in the thread
    try {
      await db.insert(supportMessageSchema).values({
        ticketId,
        authorType: 'ai',
        authorName: 'NativPost Support',
        body:       `Thank you for the follow-up, ${clientName}. A member of our team will review your message and respond shortly.`,
        isInternal: false,
      });
    } catch (fallbackErr) {
      console.error('[support-ai] Fallback reply insert failed:', fallbackErr);
    }
  }
}

function buildFollowUpAcknowledgment(clientName: string): string {
  return `Thank you for the follow-up, ${clientName}. We have noted your message and a member of our team will review it and get back to you shortly.\n\nThe NativPost Support Team`;
}