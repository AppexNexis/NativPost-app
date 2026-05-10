/**
 * src/app/api/admin/support/tickets/route.ts
 *
 * Admin-only ticket API. Key difference from the client API:
 * NO orgId filter — returns tickets across ALL organisations.
 *
 * GET  → list all tickets with org info, filters, pagination
 * POST → (not needed — tickets are created by clients)
 */

import { auth } from '@clerk/nextjs/server';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getDb } from '@/libs/DB';
import {
  supportMessageSchema,
  supportTicketSchema,
} from '@/models/Schema';

// -----------------------------------------------------------
// GET — All tickets, cross-org, with full filter surface
// Query params:
//   status    open | in_progress | auto_resolved | resolved | closed | all
//   priority  low | medium | high | urgent
//   category  billing | content_generation | social_connection | analytics | account | technical | other
//   orgId     filter to a specific org
//   assigned  me | unassigned | all
//   limit     default 30, max 100
//   offset    default 0
// -----------------------------------------------------------
export async function GET(req: NextRequest) {
  const { userId, orgRole } = await auth();

  if (!userId || orgRole !== 'org:admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const status   = searchParams.get('status');
  const priority = searchParams.get('priority');
  const category = searchParams.get('category');
  const filterOrgId = searchParams.get('orgId');
  const assigned = searchParams.get('assigned'); // me | unassigned | all
  const limit    = Math.min(parseInt(searchParams.get('limit') ?? '30'), 100);
  const offset   = parseInt(searchParams.get('offset') ?? '0');

  const db = await getDb();

  // Build where conditions — NO orgId restriction
  const conditions = [];

  if (status && status !== 'all') {
    conditions.push(eq(supportTicketSchema.status, status));
  }
  if (priority) {
    conditions.push(eq(supportTicketSchema.aiPriority, priority));
  }
  if (category) {
    conditions.push(eq(supportTicketSchema.aiCategory, category));
  }
  if (filterOrgId) {
    conditions.push(eq(supportTicketSchema.orgId, filterOrgId));
  }
  if (assigned === 'me') {
    conditions.push(eq(supportTicketSchema.assignedToUserId, userId));
  } else if (assigned === 'unassigned') {
    conditions.push(
      sql`${supportTicketSchema.assignedToUserId} IS NULL`,
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Main query — join org name for display
  const tickets = await db
    .select({
      id:              supportTicketSchema.id,
      orgId:           supportTicketSchema.orgId,
      subject:         supportTicketSchema.subject,
      aiSummary:       supportTicketSchema.aiSummary,
      aiCategory:      supportTicketSchema.aiCategory,
      aiPriority:      supportTicketSchema.aiPriority,
      aiAutoResolved:  supportTicketSchema.aiAutoResolved,
      aiConfidence:    supportTicketSchema.aiConfidence,
      status:          supportTicketSchema.status,
      submitterName:   supportTicketSchema.submitterName,
      submitterEmail:  supportTicketSchema.submitterEmail,
      assignedToUserId: supportTicketSchema.assignedToUserId,
      source:          supportTicketSchema.source,
      createdAt:       supportTicketSchema.createdAt,
      updatedAt:       supportTicketSchema.updatedAt,
      resolvedAt:      supportTicketSchema.resolvedAt,
    })
    .from(supportTicketSchema)
    .where(where)
    .orderBy(
      // Urgent + high first, then by created_at
      sql`CASE ${supportTicketSchema.aiPriority}
        WHEN 'urgent' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
        ELSE 5
      END`,
      desc(supportTicketSchema.createdAt),
    )
    .limit(limit)
    .offset(offset);

  // Total count for pagination
  const totalResult = await db
    .select({ total: sql<number>`count(*)` })
    .from(supportTicketSchema)
    .where(where);
  const total = Number(totalResult[0]?.total ?? 0);

  // Aggregate stats (always across all orgs for the summary bar)
  const statsRaw = await db
    .select({
      status: supportTicketSchema.status,
      count:  sql<number>`count(*)`,
    })
    .from(supportTicketSchema)
    .groupBy(supportTicketSchema.status);

  // Priority breakdown
  const priorityStats = await db
    .select({
      priority: supportTicketSchema.aiPriority,
      count:    sql<number>`count(*)`,
    })
    .from(supportTicketSchema)
    .where(
      inArray(supportTicketSchema.status, ['open', 'in_progress']),
    )
    .groupBy(supportTicketSchema.aiPriority);

  // Unassigned count
  const unassignedResult = await db
    .select({ unassigned: sql<number>`count(*)` })
    .from(supportTicketSchema)
    .where(
      and(
        sql`${supportTicketSchema.assignedToUserId} IS NULL`,
        inArray(supportTicketSchema.status, ['open', 'in_progress']),
      ),
    );
  const unassignedCount = Number(unassignedResult[0]?.unassigned ?? 0);

  // Reply count per ticket (for "awaiting reply" signal)
  const replyCounts = await db
    .select({
      ticketId: supportMessageSchema.ticketId,
      replies:  sql<number>`count(*)`,
      lastAuthorType: sql<string>`max(${supportMessageSchema.authorType})`,
    })
    .from(supportMessageSchema)
    .where(
      inArray(
        supportMessageSchema.ticketId,
        tickets.map((t) => t.id),
      ),
    )
    .groupBy(supportMessageSchema.ticketId);

  const replyMap = Object.fromEntries(
    replyCounts.map((r) => [r.ticketId, r]),
  );

  // Enrich tickets with reply info
  const enriched = tickets.map((t) => ({
    ...t,
    replyCount: replyMap[t.id]?.replies ?? 0,
    lastAuthorType: replyMap[t.id]?.lastAuthorType ?? 'client',
    awaitingReply: (replyMap[t.id]?.lastAuthorType ?? 'client') === 'client',
  }));

  return NextResponse.json({
    tickets: enriched,
    total,
    stats: {
      byStatus: statsRaw,
      byPriority: priorityStats,
      unassigned: unassignedCount,
    },
    pagination: { limit, offset, hasMore: offset + limit < total },
  });
}