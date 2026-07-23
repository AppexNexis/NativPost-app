/**
 * src/app/api/support/tickets/route.ts
 *
 * GET  → list tickets for the authenticated org
 * POST → create ticket, then process with AI using waitUntil
 *
 * WHY waitUntil:
 * Vercel kills serverless functions the moment a Response is returned.
 * Any unawaited async work is silently discarded before it completes.
 * waitUntil() from @vercel/functions registers a promise that keeps
 * the function alive after the response is sent — the client gets an
 * instant response and the AI work is guaranteed to complete.
 *
 * Install: npm install @vercel/functions
 */

import { waitUntil } from '@vercel/functions';
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
import { sendFeedbackToDiscord } from '@/lib/support-discord';

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

  if (status && status !== 'all') conditions.push(eq(supportTicketSchema.status, status));
  if (priority) conditions.push(eq(supportTicketSchema.aiPriority, priority));
  if (category) conditions.push(eq(supportTicketSchema.aiCategory, category));

  const tickets = await db
    .select({
      id:             supportTicketSchema.id,
      subject:        supportTicketSchema.subject,
      aiSummary:      supportTicketSchema.aiSummary,
      aiCategory:     supportTicketSchema.aiCategory,
      aiPriority:     supportTicketSchema.aiPriority,
      aiAutoResolved: supportTicketSchema.aiAutoResolved,
      status:         supportTicketSchema.status,
      submitterName:  supportTicketSchema.submitterName,
      submitterEmail: supportTicketSchema.submitterEmail,
      source:         supportTicketSchema.source,
      createdAt:      supportTicketSchema.createdAt,
      updatedAt:      supportTicketSchema.updatedAt,
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
      body:    body.body.trim(),
      status:  'open',
      source:  body.source ?? 'web',
    })
    .returning();

  if (!ticket) {
    return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 });
  }

  // Store the client's opening message as the first thread entry
  await db.insert(supportMessageSchema).values({
    ticketId:     ticket.id,
    authorType:   'client',
    authorUserId: user.id,
    authorName:   submitterName,
    authorEmail:  submitterEmail,
    body:         body.body.trim(),
    isInternal:   false,
  });

  // waitUntil keeps the Vercel function alive after the response is sent.
  // Without this, Vercel kills the function and the AI work is discarded.
  waitUntil(
    processTicketWithAI(ticket.id, body.subject, body.body, submitterName, submitterEmail),
  );

  // Fire the Discord webhook in the background if configured (doesn't block).
  waitUntil(
    sendFeedbackToDiscord({
      id: ticket.id,
      subject: body.subject,
      body: body.body,
      submitterName,
      submitterEmail,
      source: body.source,
    }),
  );

  return NextResponse.json({ ticket }, { status: 201 });
}

// -----------------------------------------------------------
// AI processing — guaranteed to complete via waitUntil
// -----------------------------------------------------------
async function processTicketWithAI(
  ticketId: string,
  subject: string,
  body: string,
  clientName: string,
  clientEmail: string,
) {
  let db: Awaited<ReturnType<typeof getDb>>;

  try {
    db = await getDb();
  } catch (err) {
    console.error('[support-ai] Failed to get DB connection:', err);
    return;
  }

  try {
    const classification = await classifyTicket(subject, body);

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

    const autoReply = await generateAutoReply(subject, body, clientName, kbContext);
    const shouldAutoResolve = autoReply.canResolve === true && (autoReply.confidence ?? 0) >= 0.7;

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
      await db.insert(supportMessageSchema).values({
        ticketId,
        authorType: 'ai',
        authorName: 'NativPost Support',
        body:       autoReply.reply,
        isInternal: false,
      });

      await sendAutoResolvedNotification(clientEmail, clientName, subject, autoReply.reply).catch(
        (e) => console.warn('[support] auto-resolve email failed:', e),
      );
    } else {
      await db.insert(supportMessageSchema).values({
        ticketId,
        authorType: 'ai',
        authorName: 'NativPost Support',
        body:       buildAcknowledgment(clientName, classification.category),
        isInternal: false,
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

    try {
      await db.insert(supportMessageSchema).values({
        ticketId,
        authorType: 'ai',
        authorName: 'NativPost Support',
        body:       `Thank you for reaching out, ${clientName}. We have received your request and a member of our team will respond shortly.`,
        isInternal: false,
      });
    } catch (fallbackErr) {
      console.error('[support-ai] Fallback message insert failed:', fallbackErr);
    }
  }
}

// -----------------------------------------------------------
// Contextual acknowledgment when AI cannot fully resolve
// -----------------------------------------------------------
function buildAcknowledgment(clientName: string, category: string): string {
  const context: Record<string, string> = {
    billing:            'Our billing team will look into this and get back to you.',
    content_generation: 'Our content team will review your request and respond shortly.',
    social_connection:  'We will investigate the connection issue on your account.',
    analytics:          'We will review your analytics and respond with findings.',
    account:            'Our team will look into your account and respond shortly.',
    technical:          'Our technical team will investigate and get back to you.',
    other:              'A member of our team will review this and respond shortly.',
  };

  const line = context[category] ?? context.other!;

  return `Thank you for reaching out, ${clientName}. We have received your support request and are looking into it.\n\n${line}\n\nWe typically respond within 4 hours during business hours. You will receive an email notification when we reply.\n\nThe NativPost Support Team`;
}