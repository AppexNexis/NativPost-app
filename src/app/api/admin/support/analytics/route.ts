/**
 * src/app/api/admin/support/analytics/route.ts
 *
 * GET → aggregated support analytics across all orgs
 */

import { auth } from '@clerk/nextjs/server';
import { and, gte, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { getDb } from '@/libs/DB';
import { supportMessageSchema, supportTicketSchema } from '@/models/Schema';

function isNativPostStaff(orgId?: string | null, orgRole?: string | null): boolean {
  const teamOrgId = process.env.NATIVPOST_TEAM_ORG_ID;
  if (!teamOrgId) return false;
  return orgId === teamOrgId && orgRole === 'org:admin';
}

export async function GET(req: NextRequest) {
  const { userId, orgId, orgRole } = await auth();
  if (!userId || !isNativPostStaff(orgId, orgRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const days = parseInt(searchParams.get('days') ?? '30');
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const db = await getDb();

  // Total ticket counts by status
  const byStatus = await db
    .select({
      status: supportTicketSchema.status,
      count:  sql<number>`count(*)`,
    })
    .from(supportTicketSchema)
    .where(gte(supportTicketSchema.createdAt, since))
    .groupBy(supportTicketSchema.status);

  // Tickets by category
  const byCategory = await db
    .select({
      category: supportTicketSchema.aiCategory,
      count:    sql<number>`count(*)`,
    })
    .from(supportTicketSchema)
    .where(gte(supportTicketSchema.createdAt, since))
    .groupBy(supportTicketSchema.aiCategory);

  // Tickets by priority
  const byPriority = await db
    .select({
      priority: supportTicketSchema.aiPriority,
      count:    sql<number>`count(*)`,
    })
    .from(supportTicketSchema)
    .where(gte(supportTicketSchema.createdAt, since))
    .groupBy(supportTicketSchema.aiPriority);

  // Auto-resolve rate
  const [totalResult] = await db
    .select({ total: sql<number>`count(*)` })
    .from(supportTicketSchema)
    .where(gte(supportTicketSchema.createdAt, since));

  const [autoResolvedResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(supportTicketSchema)
    .where(
      and(
        gte(supportTicketSchema.createdAt, since),
        sql`${supportTicketSchema.aiAutoResolved} = true`,
      ),
    );

  const total      = Number(totalResult?.total ?? 0);
  const autoResolved = Number(autoResolvedResult?.count ?? 0);
  const autoResolveRate = total > 0 ? Math.round((autoResolved / total) * 100) : 0;

  // Average CSAT score
  const [csatResult] = await db
    .select({
      avg:   sql<number>`avg(${supportTicketSchema.csatScore})`,
      rated: sql<number>`count(${supportTicketSchema.csatScore})`,
    })
    .from(supportTicketSchema)
    .where(
      and(
        gte(supportTicketSchema.createdAt, since),
        sql`${supportTicketSchema.csatScore} IS NOT NULL`,
      ),
    );

  // Daily ticket volume (last N days)
  const dailyVolume = await db
    .select({
      date:  sql<string>`date_trunc('day', ${supportTicketSchema.createdAt})::date`,
      count: sql<number>`count(*)`,
    })
    .from(supportTicketSchema)
    .where(gte(supportTicketSchema.createdAt, since))
    .groupBy(sql`date_trunc('day', ${supportTicketSchema.createdAt})::date`)
    .orderBy(sql`date_trunc('day', ${supportTicketSchema.createdAt})::date`);

  // Average messages per ticket (conversation depth)
  const [depthResult] = await db
    .select({
      avg: sql<number>`avg(msg_count)`,
    })
    .from(
      db
        .select({
          ticketId:  supportMessageSchema.ticketId,
          msg_count: sql<number>`count(*)`.as('msg_count'),
        })
        .from(supportMessageSchema)
        .groupBy(supportMessageSchema.ticketId)
        .as('msg_counts'),
    );

  // Source breakdown
  const bySource = await db
    .select({
      source: supportTicketSchema.source,
      count:  sql<number>`count(*)`,
    })
    .from(supportTicketSchema)
    .where(gte(supportTicketSchema.createdAt, since))
    .groupBy(supportTicketSchema.source);

  return NextResponse.json({
    period: { days, since: since.toISOString() },
    summary: {
      total,
      autoResolved,
      autoResolveRate,
      avgCsat:       csatResult?.avg ? Math.round(Number(csatResult.avg) * 10) / 10 : null,
      csatRated:     Number(csatResult?.rated ?? 0),
      avgMessages:   depthResult?.avg ? Math.round(Number(depthResult.avg) * 10) / 10 : 0,
    },
    byStatus,
    byCategory,
    byPriority,
    bySource,
    dailyVolume,
  });
}