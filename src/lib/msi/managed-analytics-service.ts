// Managed Analytics service (docs §19). DB layer: generate a monthly report for
// a managed account (gated on the add-on), list an org's reports, and deliver a
// report (operator action). Post counts come from the immutable billable-event
// ledger, so the report reflects what was actually published + billed.

import { and, count, desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  managedAccountSchema,
  msiAnalyticsReportSchema,
  msiBillablePublishEventSchema,
} from '@/models/Schema';

import { isAddonActive } from './addon-service';
import {
  canDeliver,
  composeReportSummary,
  reportPeriodOf,
  type ReportStatus,
  type ReportSummary,
} from './managed-analytics';

const ANALYTICS_ADDON = 'managed_analytics';

export interface AnalyticsReport {
  id: string;
  managedAccountId: string;
  accountName: string | null;
  billingPeriod: string;
  status: string;
  summary: ReportSummary;
  deliveredAt: Date | null;
  createdAt: Date;
}

/** All reports for an org's accounts, newest first. */
export async function getReports(orgId: string): Promise<AnalyticsReport[]> {
  const rows = await db
    .select({
      id: msiAnalyticsReportSchema.id,
      managedAccountId: msiAnalyticsReportSchema.managedAccountId,
      accountName: managedAccountSchema.displayName,
      billingPeriod: msiAnalyticsReportSchema.billingPeriod,
      status: msiAnalyticsReportSchema.status,
      summary: msiAnalyticsReportSchema.summary,
      deliveredAt: msiAnalyticsReportSchema.deliveredAt,
      createdAt: msiAnalyticsReportSchema.createdAt,
    })
    .from(msiAnalyticsReportSchema)
    .leftJoin(
      managedAccountSchema,
      eq(msiAnalyticsReportSchema.managedAccountId, managedAccountSchema.id),
    )
    .where(eq(msiAnalyticsReportSchema.orgId, orgId))
    .orderBy(desc(msiAnalyticsReportSchema.createdAt));

  return rows.map(r => ({
    ...r,
    summary: (r.summary ?? {}) as unknown as ReportSummary,
  }));
}

async function postsInPeriod(managedAccountId: string, period: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(msiBillablePublishEventSchema)
    .where(
      and(
        eq(msiBillablePublishEventSchema.managedAccountId, managedAccountId),
        eq(msiBillablePublishEventSchema.billingPeriod, period),
      ),
    );
  return row?.n ?? 0;
}

export type ReportOutcome =
  | { ok: true; reportId: string; status: ReportStatus; existed: boolean }
  | { ok: false; error: string };

/**
 * Generate (or fetch) the report for a managed account + period. Gated on the
 * add-on being active and the account belonging to the org. Idempotent per
 * (account, period): a second request returns the existing report.
 */
export async function requestReport(input: {
  orgId: string;
  managedAccountId: string;
  now?: Date;
}): Promise<ReportOutcome> {
  const { orgId, managedAccountId } = input;
  const now = input.now ?? new Date();

  if (!(await isAddonActive(orgId, ANALYTICS_ADDON))) {
    return { ok: false, error: 'Managed Analytics is not active. Activate it in Add-ons first.' };
  }

  const [account] = await db
    .select({ id: managedAccountSchema.id })
    .from(managedAccountSchema)
    .where(and(eq(managedAccountSchema.id, managedAccountId), eq(managedAccountSchema.orgId, orgId)))
    .limit(1);
  if (!account) {
    return { ok: false, error: 'Managed account not found.' };
  }

  const period = reportPeriodOf(now);

  const [existing] = await db
    .select({ id: msiAnalyticsReportSchema.id, status: msiAnalyticsReportSchema.status })
    .from(msiAnalyticsReportSchema)
    .where(
      and(
        eq(msiAnalyticsReportSchema.managedAccountId, managedAccountId),
        eq(msiAnalyticsReportSchema.billingPeriod, period),
      ),
    )
    .limit(1);
  if (existing) {
    return { ok: true, reportId: existing.id, status: existing.status as ReportStatus, existed: true };
  }

  const postsPublished = await postsInPeriod(managedAccountId, period);
  const summary = composeReportSummary({ period, postsPublished });

  const [row] = await db
    .insert(msiAnalyticsReportSchema)
    .values({
      orgId,
      managedAccountId,
      billingPeriod: period,
      status: 'in_review',
      summary: summary as unknown as Record<string, unknown>,
      generatedAt: now,
    })
    .returning({ id: msiAnalyticsReportSchema.id });

  return { ok: true, reportId: row!.id, status: 'in_review', existed: false };
}

/** Operator delivers an in-review report to the customer. */
export async function deliverReport(reportId: string): Promise<{ ok: boolean; error?: string }> {
  const [report] = await db
    .select({ status: msiAnalyticsReportSchema.status })
    .from(msiAnalyticsReportSchema)
    .where(eq(msiAnalyticsReportSchema.id, reportId))
    .limit(1);
  if (!report) {
    return { ok: false, error: 'Report not found' };
  }
  if (!canDeliver(report.status as ReportStatus)) {
    return { ok: false, error: `Report is ${report.status}, not in review` };
  }
  await db
    .update(msiAnalyticsReportSchema)
    .set({ status: 'delivered', deliveredAt: new Date() })
    .where(eq(msiAnalyticsReportSchema.id, reportId));
  return { ok: true };
}
