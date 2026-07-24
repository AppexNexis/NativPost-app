import { desc, inArray } from 'drizzle-orm';
import Link from 'next/link';

import { getDb } from '@/libs/DB';
import { toneBadgeClass } from '@/lib/msi/display';
import { jobStateTone } from '@/lib/msi/job-board';
import { groupJobsByState, jobSlaBreached } from '@/lib/msi/job-queue';
import { PLATFORM_LABELS } from '@/lib/platforms';
import { managedAccountSchema, msiJobSchema } from '@/models/Schema';

// Cross-org job queue (docs §8). Server-rendered, staff-gated by middleware,
// read-only: every job grouped by state (attention first), with SLA flags.
export const dynamic = 'force-dynamic';

const slug = (s: string) => s.replace(/_/g, ' ');

export default async function AdminMsiQueuePage() {
  const db = await getDb();
  const now = new Date();

  const jobs = await db
    .select({
      id: msiJobSchema.id,
      jobType: msiJobSchema.jobType,
      state: msiJobSchema.state,
      slaDueAt: msiJobSchema.slaDueAt,
      managedAccountId: msiJobSchema.managedAccountId,
    })
    .from(msiJobSchema)
    .orderBy(desc(msiJobSchema.createdAt));

  const accountIds = [...new Set(jobs.map(j => j.managedAccountId))];
  const accounts = accountIds.length
    ? await db
        .select({
          id: managedAccountSchema.id,
          displayName: managedAccountSchema.displayName,
          platform: managedAccountSchema.platform,
          country: managedAccountSchema.country,
        })
        .from(managedAccountSchema)
        .where(inArray(managedAccountSchema.id, accountIds))
    : [];
  const accountById = new Map(accounts.map(a => [a.id, a]));

  const groups = groupJobsByState(jobs);
  const breached = jobs.filter(j => jobSlaBreached(j, now)).length;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Managed Social
      </div>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        Queue
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        All jobs across accounts, grouped by state (attention first). Read-only.
      </p>

      {jobs.length === 0
        ? (
            <div className="mt-6 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
              No jobs yet. Provisioning execution begins after the platform review
              (Phase 0).
            </div>
          )
        : (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>
                  {jobs.length}
                  {' jobs'}
                </span>
                {breached > 0
                  ? (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700 dark:bg-red-900/20 dark:text-red-400">
                        {breached}
                        {' past SLA'}
                      </span>
                    )
                  : null}
              </div>

              <div className="mt-6 space-y-6">
                {groups.map(group => (
                  <section key={group.state}>
                    <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold capitalize text-foreground">
                      {slug(group.state)}
                      <span className="text-xs font-normal text-muted-foreground">
                        {group.jobs.length}
                      </span>
                    </h2>
                    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                      {group.jobs.map((job) => {
                        const acc = accountById.get(job.managedAccountId);
                        const breach = jobSlaBreached(job, now);
                        return (
                          <Link
                            key={job.id}
                            href={`/admin/msi/${job.managedAccountId}`}
                            className="flex items-center justify-between gap-3 bg-card px-4 py-3 text-sm transition hover:bg-muted/50"
                          >
                            <div className="min-w-0">
                              <div className="font-medium capitalize text-foreground">
                                {slug(job.jobType)}
                              </div>
                              <div className="truncate text-xs text-muted-foreground">
                                {acc?.displayName || 'account'}
                                {acc
                                  ? ` · ${PLATFORM_LABELS[acc.platform] || acc.platform} · ${acc.country}`
                                  : ''}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {breach
                                ? (
                                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-micro font-medium text-red-700 dark:bg-red-900/20 dark:text-red-400">
                                      past SLA
                                    </span>
                                  )
                                : null}
                              <span
                                className={`rounded-full px-2 py-0.5 text-micro font-medium capitalize ${toneBadgeClass(jobStateTone(job.state))}`}
                              >
                                {slug(job.state)}
                              </span>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </>
          )}
    </div>
  );
}
