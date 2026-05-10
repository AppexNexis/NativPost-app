/**
 * src/app/api/support/tickets/route.ts
 *
 * GET  /api/support/tickets   → list tickets for org (with filters)
 * POST /api/support/tickets   → create new ticket (triggers AI classification)
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
// Query params: status, priority, category, limit, offset
// -----------------------------------------------------------
export async function GET(req: NextRequest) {
  const { orgId } = await auth();
  if (!orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const status = searchParams.get('status');         // open | in_progress | resolved | closed | all
  const priority = searchParams.get('priority');     // low | medium | high | urgent
  const category = searchParams.get('category');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '25'), 100);
  const offset = parseInt(searchParams.get('offset') ?? '0');

  try {
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
        id: supportTicketSchema.id,
        subject: supportTicketSchema.subject,
        aiSummary: supportTicketSchema.aiSummary,
        aiCategory: supportTicketSchema.aiCategory,
        aiPriority: supportTicketSchema.aiPriority,
        aiAutoResolved: supportTicketSchema.aiAutoResolved,
        status: supportTicketSchema.status,
        submitterName: supportTicketSchema.submitterName,
        submitterEmail: supportTicketSchema.submitterEmail,
        source: supportTicketSchema.source,
        createdAt: supportTicketSchema.createdAt,
        updatedAt: supportTicketSchema.updatedAt,
      })
      .from(supportTicketSchema)
      .where(and(...conditions))
      .orderBy(desc(supportTicketSchema.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count for pagination
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(supportTicketSchema)
      .where(and(...conditions));
    const total = Number(countResult[0]?.count ?? 0);

    // Get summary stats
    const stats = await db
      .select({
        status: supportTicketSchema.status,
        count: sql<number>`count(*)`,
      })
      .from(supportTicketSchema)
      .where(eq(supportTicketSchema.orgId, orgId))
      .groupBy(supportTicketSchema.status);

    return NextResponse.json({ tickets, total, stats });
  } catch (err) {
    console.error('[support/tickets GET]', err);
    return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// POST — Create a new ticket
// Triggers: AI classification → optional auto-resolve → confirmation email
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
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.subject?.trim() || !body.body?.trim()) {
    return NextResponse.json({ error: 'Subject and body are required' }, { status: 400 });
  }

  const submitterEmail = user.emailAddresses[0]?.emailAddress ?? '';
  const submitterName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || submitterEmail;

  try {
    const db = await getDb();

    // 1. Create ticket with initial status
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

    if (!ticket) throw new Error('Ticket insert returned nothing');

    // 2. Insert the client's original message as the first thread message
    await db.insert(supportMessageSchema).values({
      ticketId: ticket.id,
      authorType: 'client',
      authorUserId: user.id,
      authorName: submitterName,
      authorEmail: submitterEmail,
      body: body.body.trim(),
      isInternal: false,
    });

    // 3. Run AI classification in the background (don't block response)
    processTicketWithAI(ticket.id, body.subject, body.body, submitterName, submitterEmail).catch(
      (err) => console.error('[support/tickets] AI processing error:', err),
    );

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (err) {
    console.error('[support/tickets POST]', err);
    return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// BACKGROUND: AI classification + optional auto-resolve
// Runs after ticket is created — doesn't block the API response.
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

    // Step 2: Fetch relevant KB articles for context
    let kbContext = '';
    if (classification.suggestedAutoReply) {
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

      kbContext = articles
        .map((a) => `## ${a.title}\n${a.body}`)
        .join('\n\n---\n\n');
    }

    // Step 3: Attempt auto-resolve if AI suggests it
    let autoReply: Awaited<ReturnType<typeof generateAutoReply>> | null = null;
    if (classification.suggestedAutoReply && kbContext) {
      autoReply = await generateAutoReply(subject, body, clientName, kbContext);
    }

    const shouldAutoResolve = autoReply?.canResolve === true && (autoReply.confidence ?? 0) >= 0.75;

    // Step 4: Update ticket with AI fields
    await db
      .update(supportTicketSchema)
      .set({
        aiSummary: classification.summary,
        aiCategory: classification.category,
        aiPriority: classification.priority,
        aiConfidence: classification.confidence,
        aiAutoResolved: shouldAutoResolve,
        status: shouldAutoResolve ? 'auto_resolved' : 'open',
        ...(shouldAutoResolve ? { resolvedAt: new Date() } : {}),
      })
      .where(eq(supportTicketSchema.id, ticketId));

    // Step 5: If auto-resolved, insert the AI reply as a message
    if (shouldAutoResolve && autoReply?.reply) {
      await db.insert(supportMessageSchema).values({
        ticketId,
        authorType: 'ai',
        authorName: 'NativPost AI Support',
        body: autoReply.reply,
        isInternal: false,
      });

      // Send email with the auto-reply
      await sendAutoResolvedNotification(clientEmail, clientName, subject, autoReply.reply).catch(
        (e) => console.warn('[support] auto-resolve email failed:', e),
      );
    } else {
      // Send acknowledgment email
      await sendTicketConfirmation(clientEmail, clientName, subject, ticketId).catch(
        (e) => console.warn('[support] confirmation email failed:', e),
      );
    }

    console.log(`[support-ai] Ticket ${ticketId} processed — category: ${classification.category}, priority: ${classification.priority}, auto-resolved: ${shouldAutoResolve}`);
  } catch (err) {
    console.error(`[support-ai] processTicketWithAI failed for ${ticketId}:`, err);
    // Don't crash — ticket exists, AI fields just won't be populated
  }
}