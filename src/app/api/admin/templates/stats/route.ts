import { auth } from '@clerk/nextjs/server';
import { and, avg, count, eq, gte, max, sql } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getDb } from '@/libs/DB';
import { contentTemplateSchema } from '@/models/Schema';

/**
 * NativPost admin guard — same check as middleware + AdminShell.
 * Must be org:admin AND the org must be the NativPost team org.
 */
async function requireAdmin() {
  const { userId, orgId, orgRole } = await auth();

  if (!userId || !orgId) {
    return {
      error: NextResponse.json(
        { error: 'Unauthorized — sign in and select an organization' },
        { status: 401 },
      ),
      orgId: null,
    };
  }

  const teamOrgId = process.env.NEXT_PUBLIC_NATIVPOST_TEAM_ORG_ID;
  const isNativPostStaff = !!(
    teamOrgId && orgId === teamOrgId && orgRole === 'org:admin'
  );

  if (!isNativPostStaff) {
    return {
      error: NextResponse.json(
        { error: 'Forbidden — NativPost admin access required' },
        { status: 403 },
      ),
      orgId: null,
    };
  }

  return { error: null, orgId };
}

export async function GET(_req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) {
    return error;
  }

  const db = await getDb();

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  try {
    // ── Today ────────────────────────────────────────────────────────────
    const todayProcessed = await db
      .select({ count: count() })
      .from(contentTemplateSchema)
      .where(
        and(
          gte(contentTemplateSchema.updatedAt, today),
          sql`${contentTemplateSchema.curationStatus} IS NOT NULL`,
        ),
      );

    const todayApproved = await db
      .select({ count: count() })
      .from(contentTemplateSchema)
      .where(
        and(
          gte(contentTemplateSchema.updatedAt, today),
          eq(contentTemplateSchema.curationStatus, 'approved'),
        ),
      );

    const todayRejected = await db
      .select({ count: count() })
      .from(contentTemplateSchema)
      .where(
        and(
          gte(contentTemplateSchema.updatedAt, today),
          eq(contentTemplateSchema.curationStatus, 'rejected'),
        ),
      );

    // ── This week ──────────────────────────────────────────────────────
    const weekProcessed = await db
      .select({ count: count() })
      .from(contentTemplateSchema)
      .where(
        and(
          gte(contentTemplateSchema.updatedAt, weekStart),
          sql`${contentTemplateSchema.curationStatus} IS NOT NULL`,
        ),
      );

    const weekApproved = await db
      .select({ count: count() })
      .from(contentTemplateSchema)
      .where(
        and(
          gte(contentTemplateSchema.updatedAt, weekStart),
          eq(contentTemplateSchema.curationStatus, 'approved'),
        ),
      );

    const weekRejected = await db
      .select({ count: count() })
      .from(contentTemplateSchema)
      .where(
        and(
          gte(contentTemplateSchema.updatedAt, weekStart),
          eq(contentTemplateSchema.curationStatus, 'rejected'),
        ),
      );

    // ── This month ───────────────────────────────────────────────────────
    const monthProcessed = await db
      .select({ count: count() })
      .from(contentTemplateSchema)
      .where(
        and(
          gte(contentTemplateSchema.updatedAt, monthStart),
          sql`${contentTemplateSchema.curationStatus} IS NOT NULL`,
        ),
      );

    const monthApproved = await db
      .select({ count: count() })
      .from(contentTemplateSchema)
      .where(
        and(
          gte(contentTemplateSchema.updatedAt, monthStart),
          eq(contentTemplateSchema.curationStatus, 'approved'),
        ),
      );

    const monthRejected = await db
      .select({ count: count() })
      .from(contentTemplateSchema)
      .where(
        and(
          gte(contentTemplateSchema.updatedAt, monthStart),
          eq(contentTemplateSchema.curationStatus, 'rejected'),
        ),
      );

    // ── Queue health ─────────────────────────────────────────────────────
    const pendingCount = await db
      .select({ count: count() })
      .from(contentTemplateSchema)
      .where(eq(contentTemplateSchema.curationStatus, 'pending'));

    const avgTimeInQueue = await db
      .select({ avg: avg(sql`EXTRACT(EPOCH FROM (${contentTemplateSchema.updatedAt} - ${contentTemplateSchema.createdAt})) / 3600`) })
      .from(contentTemplateSchema)
      .where(eq(contentTemplateSchema.curationStatus, 'pending'));

    const oldestPending = await db
      .select({ max: max(sql`EXTRACT(EPOCH FROM (NOW() - ${contentTemplateSchema.createdAt})) / 3600`) })
      .from(contentTemplateSchema)
      .where(eq(contentTemplateSchema.curationStatus, 'pending'));

    // ── Velocity (last 7 days) ───────────────────────────────────────────
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const velocity = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);

      const row = await db
        .select({ count: count() })
        .from(contentTemplateSchema)
        .where(
          and(
            gte(contentTemplateSchema.createdAt, d),
            sql`${contentTemplateSchema.createdAt} < ${nextDay}`,
          ),
        );

      velocity.push({
        day: days[d.getDay()] ?? '—',
        processed: row[0]?.count ?? 0,
      });
    }

    // ── Top niches ───────────────────────────────────────────────────────
    const topNiches = await db
      .select({
        name: sql`jsonb_array_elements_text(${contentTemplateSchema.niches})`,
        count: count(),
      })
      .from(contentTemplateSchema)
      .groupBy(sql`jsonb_array_elements_text(${contentTemplateSchema.niches})`)
      .orderBy(sql`count(*) DESC`)
      .limit(8);

    // ── Top angles ───────────────────────────────────────────────────────
    const topAngles = await db
      .select({
        name: sql`jsonb_array_elements_text(${contentTemplateSchema.angles})`,
        count: count(),
      })
      .from(contentTemplateSchema)
      .groupBy(sql`jsonb_array_elements_text(${contentTemplateSchema.angles})`)
      .orderBy(sql`count(*) DESC`)
      .limit(8);

    // ── Approval rate history (last 4 weeks) ───────────────────────────
    const approvalRateHistory = [];
    for (let w = 3; w >= 0; w--) {
      const wStart = new Date(today);
      wStart.setDate(wStart.getDate() - w * 7 - today.getDay());
      const wEnd = new Date(wStart);
      wEnd.setDate(wEnd.getDate() + 7);

      const total = await db
        .select({ count: count() })
        .from(contentTemplateSchema)
        .where(
          and(
            gte(contentTemplateSchema.updatedAt, wStart),
            sql`${contentTemplateSchema.updatedAt} < ${wEnd}`,
          ),
        );

      const approved = await db
        .select({ count: count() })
        .from(contentTemplateSchema)
        .where(
          and(
            gte(contentTemplateSchema.updatedAt, wStart),
            sql`${contentTemplateSchema.updatedAt} < ${wEnd}`,
            eq(contentTemplateSchema.curationStatus, 'approved'),
          ),
        );

      const totalCount = total[0]?.count ?? 0;
      const approvedCount = approved[0]?.count ?? 0;
      const rate = totalCount > 0 ? Math.round((approvedCount / totalCount) * 100) : 0;

      approvalRateHistory.push({ week: `W${4 - w}`, rate });
    }

    // ── Platform breakdown ─────────────────────────────────────────────
    const platformBreakdown = await db
      .select({
        name: contentTemplateSchema.sourcePlatform,
        value: count(),
      })
      .from(contentTemplateSchema)
      .groupBy(contentTemplateSchema.sourcePlatform)
      .orderBy(sql`count(*) DESC`);

    const colors: Record<string, string> = {
      tiktok: '#0f172a',
      instagram: '#e11d48',
      youtube: '#ef4444',
      facebook: '#3b82f6',
      linkedin: '#0a66c2',
      twitter: '#1da1f2',
    };

    const metrics = {
      today: {
        processed: todayProcessed[0]?.count ?? 0,
        approved: todayApproved[0]?.count ?? 0,
        rejected: todayRejected[0]?.count ?? 0,
      },
      thisWeek: {
        processed: weekProcessed[0]?.count ?? 0,
        approved: weekApproved[0]?.count ?? 0,
        rejected: weekRejected[0]?.count ?? 0,
      },
      thisMonth: {
        processed: monthProcessed[0]?.count ?? 0,
        approved: monthApproved[0]?.count ?? 0,
        rejected: monthRejected[0]?.count ?? 0,
      },
      avgTimeInQueue: avgTimeInQueue[0]?.avg
        ? Number(Number.parseFloat(String(avgTimeInQueue[0].avg)).toFixed(1))
        : 0,
      oldestPending: oldestPending[0]?.max
        ? Number(Number.parseFloat(String(oldestPending[0].max)).toFixed(1))
        : 0,
      avgQueueLength: pendingCount[0]?.count ?? 0,
      velocity,
      topNiches: topNiches.map(n => ({
        name: String(n.name),
        count: Number(n.count),
      })),
      topAngles: topAngles.map(a => ({
        name: String(a.name),
        count: Number(a.count),
      })),
      approvalRateHistory,
      platformBreakdown: platformBreakdown.map(p => ({
        name: String(p.name ?? 'unknown'),
        value: Number(p.value),
        color: colors[String(p.name ?? 'unknown')] ?? '#6b7280',
      })),
    };

    return NextResponse.json(metrics, { status: 200 });
  } catch (err) {
    console.error('Stats API error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
