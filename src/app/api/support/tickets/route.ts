/**
 * src/app/api/support/tickets/route.ts
 *
 * GET  → list tickets for the authenticated org
 * POST → create new ticket, triggers AI processing in background
 */

import { auth, currentUser } from '@clerk/nextjs/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getDb } from '@/libs/DB';
import {
  knowledgeArticleSchema,
  supportMessageSchema,
  supportTicketSchema,
} from '@/models/Schema';
import { classifyTicket, generateAutoReply } from '@/lib/support-ai';
import { sendTicketConfirmation, sendAutoResolvedNotification } from '@/lib/support-email';

// -----------------------------------------------------------
// GET — List tickets for the current org
// -----------------------------------------------------------
export async function GET(req: NextRequest) {
  const { orgId } = await auth();
  if (!orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const status   = searchParams.get('status');
  const priority = searchParams.get('priority');
  const category = searchParams.get('category');
  const limit    = Math.min(parseInt(searchParams.get('limit') ?? '25'), 100);
  const offset   = parseInt(searchParams.get('offset') ?? '0');

  const db = await getDb();

  const conditions = [eq(supportTicketSchema.orgId, orgId)];

  if (status && status !== 'all') {
    conditions.push(eq(supportTicketSchema.status, status));
  }
  if (priority) {
    conditions.push(eq(supportTicketSchema.aiPriority, priority));
  }
  if (category) {
    conditions.push(eq(supportTicketSchema.aiCategory, category));
  }

  const tickets = await db
    .select({
      id:              supportTicketSchema.id,
      subject:         supportTicketSchema.subject,
      aiSummary:       supportTicketSchema.aiSummary,
      aiCategory:      supportTicketSchema.aiCategory,
      aiPriority:      supportTicketSchema.aiPriority,
      aiAutoResolved:  supportTicketSchema.aiAutoResolved,
      status:          supportTicketSchema.status,
      submitterName:   supportTicketSchema.submitterName,
      submitterEmail:  supportTicketSchema.submitterEmail,
      source:          supportTicketSchema.source,
      createdAt:       supportTicketSchema.createdAt,
      updatedAt:       supportTicketSchema.updatedAt,
    })
    .from(supportTicketSchema)
    .where(and(...conditions))
    .orderBy(desc(supportTicketSchema.createdAt))
    .limit(limit)
    .offset(offset);

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(supportTicketSchema)
    .where(and(...conditions));
  const total = Number(countResult[0]?.count ?? 0);

  const statsRaw = await db
    .select({
      status: supportTicketSchema.status,
      count:  sql<number>`count(*)`,
    })
    .from(supportTicketSchema)
    .where(eq(supportTicketSchema.orgId, orgId))
    .groupBy(supportTicketSchema.status);

  return NextResponse.json({ tickets, total, stats: statsRaw });
}

// -----------------------------------------------------------
// POST — Create a new ticket
// -----------------------------------------------------------
export async function POST(req: NextRequest) {
  const { orgId } = await auth();
  const user = await currentUser();

  if (!orgId || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { subject: string; body: string; source?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.subject?.trim() || !body.body?.trim()) {
    return NextResponse.json({ error: 'Subject and body are required' }, { status: 400 });
  }

  const submitterEmail = user.emailAddresses[0]?.emailAddress ?? '';
  const submitterName  = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || submitterEmail;

  const db = await getDb();

  const [ticket] = await db
    .insert(supportTicketSchema)
    .values({
      orgId,
      submitterUserId: user.id,
      submitterEmail,
      submitterName,
      subject: body.subject.trim(),
      body: body.body.trim(),
      status: 'open',
      source: body.source ?? 'web',
    })
    .returning();

  if (!ticket) {
    return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 });
  }

  // Store the client's opening message as the first thread entry
  await db.insert(supportMessageSchema).values({
    ticketId: ticket.id,
    authorType: 'client',
    authorUserId: user.id,
    authorName: submitterName,
    authorEmail: submitterEmail,
    body: body.body.trim(),
    isInternal: false,
  });

  // Fire AI processing in background — does not block the response
  processTicketWithAI(ticket.id, body.subject, body.body, submitterName, submitterEmail).catch(
    (err) => console.error('[support/tickets] AI processing error:', err),
  );

  return NextResponse.json({ ticket }, { status: 201 });
}

// -----------------------------------------------------------
// BACKGROUND: AI classification + optional auto-resolve
//
// This always runs when a ticket is created. It:
// 1. Classifies the ticket (category, priority, summary)
// 2. Inserts an AI acknowledgment message so the client sees
//    something immediately — even if auto-resolve doesn't fire
// 3. Attempts auto-resolve if the classifier thinks it can help
// 4. Sends the appropriate email (auto-resolved or confirmation)
// -----------------------------------------------------------
async function processTicketWithAI(
  ticketId: string,
  subject: string,
  body: string,
  clientName: string,
  clientEmail: string,
) {
  const db = await getDb();

  try {
    // Step 1: Classify
    const classification = await classifyTicket(subject, body);

    // Step 2: Fetch KB articles regardless — used for both auto-reply and context
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

    // Step 3: Always attempt an auto-reply — let the AI decide if it can help
    // The classifier's suggestedAutoReply is a hint, not a gate
    const autoReply = await generateAutoReply(subject, body, clientName, kbContext);

    const shouldAutoResolve = autoReply.canResolve === true && (autoReply.confidence ?? 0) >= 0.7;

    // Step 4: Update ticket with AI-generated fields
    await db
      .update(supportTicketSchema)
      .set({
        aiSummary:      classification.summary,
        aiCategory:     classification.category,
        aiPriority:     classification.priority,
        aiConfidence:   classification.confidence,
        aiAutoResolved: shouldAutoResolve,
        status:         shouldAutoResolve ? 'auto_resolved' : 'open',
        ...(shouldAutoResolve ? { resolvedAt: new Date() } : {}),
      })
      .where(eq(supportTicketSchema.id, ticketId));

    if (shouldAutoResolve && autoReply.reply) {
      // Step 5a: AI fully answered — insert the reply and email the client
      await db.insert(supportMessageSchema).values({
        ticketId,
        authorType:  'ai',
        authorName:  'NativPost Support',
        body:        autoReply.reply,
        isInternal:  false,
      });

      await sendAutoResolvedNotification(clientEmail, clientName, subject, autoReply.reply).catch(
        (e) => console.warn('[support] auto-resolve email failed:', e),
      );
    } else {
      // Step 5b: AI cannot fully resolve — insert a helpful acknowledgment
      // so the client sees the ticket was received and understood
      const ackBody = buildAcknowledgment(clientName, classification.category);

      await db.insert(supportMessageSchema).values({
        ticketId,
        authorType:  'ai',
        authorName:  'NativPost Support',
        body:        ackBody,
        isInternal:  false,
      });

      await sendTicketConfirmation(clientEmail, clientName, subject, ticketId).catch(
        (e) => console.warn('[support] confirmation email failed:', e),
      );
    }

    console.log(
      `[support-ai] Ticket ${ticketId} — category: ${classification.category}, priority: ${classification.priority}, auto-resolved: ${shouldAutoResolve}`,
    );
  } catch (err) {
    console.error(`[support-ai] processTicketWithAI failed for ${ticketId}:`, err);

    // Fallback: insert a plain acknowledgment so the thread is never empty
    try {
      await db.insert(supportMessageSchema).values({
        ticketId,
        authorType:  'ai',
        authorName:  'NativPost Support',
        body:        `Thank you for reaching out, ${clientName}. We have received your ticket and a member of our team will review it shortly.`,
        isInternal:  false,
      });
    } catch {
      // Silent — ticket exists, thread just starts empty
    }
  }
}

// -----------------------------------------------------------
// Build a contextual acknowledgment message when AI cannot auto-resolve.
// Avoids generic text by tailoring the message to the ticket category.
// -----------------------------------------------------------
function buildAcknowledgment(clientName: string, category: string): string {
  const categoryContext: Record<string, string> = {
    billing:            'Our billing team will look into this and get back to you.',
    content_generation: 'Our content team will review your request and respond shortly.',
    social_connection:  'We will investigate the connection issue on your account.',
    analytics:          'We will review your analytics data and respond with findings.',
    account:            'Our team will look into your account and respond shortly.',
    technical:          'Our technical team will investigate and get back to you.',
    other:              'A member of our team will review this and respond shortly.',
  };

  const context = categoryContext[category] ?? categoryContext.other!;

  return `Thank you for reaching out, ${clientName}. We have received your support request and are looking into it.\n\n${context}\n\nWe typically respond within 4 hours during business hours. You will receive an email notification when we reply.\n\nThe NativPost Support Team`;
}