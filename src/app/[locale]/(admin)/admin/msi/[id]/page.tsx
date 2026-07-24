import { desc, eq, inArray } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { JobActions } from '@/components/admin/msi/JobActions';
import { VaultActions } from '@/components/admin/msi/VaultActions';
import { getDb } from '@/libs/DB';
import { stateLabel, stateTone, toneBadgeClass } from '@/lib/msi/display';
import {
  buildJobBoard,
  jobStateTone,
  taskStatusTone,
} from '@/lib/msi/job-board';
import { PLATFORM_LABELS } from '@/lib/platforms';
import {
  managedAccountSchema,
  msiCredentialSchema,
  msiJobSchema,
  msiTaskSchema,
} from '@/models/Schema';

// Per-account job board (docs §7, §8). Server-rendered, cross-org, read-only;
// gated to NativPost staff by middleware (/admin(.*)). Shows an account's jobs
// and their task checklists. No execution.
export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string; locale: string }> };

function fmt(d: Date): string {
  return new Date(d).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

const slug = (s: string) => s.replace(/_/g, ' ');

export default async function AdminMsiAccountJobsPage({ params }: RouteParams) {
  const { id } = await params;
  const db = await getDb();

  const [account] = await db
    .select({
      id: managedAccountSchema.id,
      displayName: managedAccountSchema.displayName,
      platform: managedAccountSchema.platform,
      country: managedAccountSchema.country,
      niche: managedAccountSchema.niche,
      lifecycleState: managedAccountSchema.lifecycleState,
      credentialCustody: managedAccountSchema.credentialCustody,
    })
    .from(managedAccountSchema)
    .where(eq(managedAccountSchema.id, id))
    .limit(1);

  if (!account) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <Link
          href="/admin/msi"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Operations
        </Link>
        <p className="text-sm text-muted-foreground">Account not found.</p>
      </div>
    );
  }

  const [credential] = await db
    .select({ id: msiCredentialSchema.id })
    .from(msiCredentialSchema)
    .where(eq(msiCredentialSchema.managedAccountId, id))
    .limit(1);

  const jobs = await db
    .select({
      id: msiJobSchema.id,
      jobType: msiJobSchema.jobType,
      state: msiJobSchema.state,
      priority: msiJobSchema.priority,
      attempts: msiJobSchema.attempts,
      maxAttempts: msiJobSchema.maxAttempts,
      slaDueAt: msiJobSchema.slaDueAt,
      createdAt: msiJobSchema.createdAt,
    })
    .from(msiJobSchema)
    .where(eq(msiJobSchema.managedAccountId, id))
    .orderBy(desc(msiJobSchema.createdAt));

  const jobIds = jobs.map(j => j.id);
  const tasks = jobIds.length
    ? await db
        .select({
          id: msiTaskSchema.id,
          jobId: msiTaskSchema.jobId,
          taskType: msiTaskSchema.taskType,
          status: msiTaskSchema.status,
          sequence: msiTaskSchema.sequence,
        })
        .from(msiTaskSchema)
        .where(inArray(msiTaskSchema.jobId, jobIds))
    : [];

  const board = buildJobBoard(jobs, tasks);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link
        href="/admin/msi"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Operations
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {account.displayName || 'Managed account'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {PLATFORM_LABELS[account.platform] || account.platform}
            {' · '}
            {account.country}
            {account.niche ? ` · ${account.niche}` : ''}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${toneBadgeClass(stateTone(account.lifecycleState))}`}
        >
          {stateLabel(account.lifecycleState)}
        </span>
      </div>

      <VaultActions
        accountId={account.id}
        custody={account.credentialCustody}
        hasCredentials={Boolean(credential)}
      />

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Jobs</h2>
        {board.length === 0
          ? (
              <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
                No jobs yet. Provisioning execution begins after the platform
                review (Phase 0).
              </div>
            )
          : (
              <div className="space-y-3">
                {board.map(job => (
                  <div
                    key={job.id}
                    className="rounded-xl border border-border bg-card p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium capitalize text-foreground">
                        {slug(job.jobType)}
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-micro font-medium capitalize ${toneBadgeClass(jobStateTone(job.state))}`}
                      >
                        {slug(job.state)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      priority
                      {' '}
                      {job.priority}
                      {' · attempt '}
                      {job.attempts}
                      /
                      {job.maxAttempts}
                      {job.slaDueAt ? ` · SLA ${fmt(job.slaDueAt)}` : ''}
                      {' · '}
                      {job.tasksDone}
                      /
                      {job.taskCount}
                      {' tasks'}
                    </div>

                    {job.tasks.length > 0
                      ? (
                          <ul className="mt-3 space-y-1.5">
                            {job.tasks.map(t => (
                              <li
                                key={t.id}
                                className="flex items-center justify-between gap-2 text-xs"
                              >
                                <span className="capitalize text-foreground">
                                  {t.sequence + 1}
                                  .
                                  {' '}
                                  {slug(t.taskType)}
                                </span>
                                <span
                                  className={`shrink-0 rounded-full px-2 py-0.5 text-micro font-medium capitalize ${toneBadgeClass(taskStatusTone(t.status))}`}
                                >
                                  {slug(t.status)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )
                      : null}

                    <JobActions
                      jobId={job.id}
                      jobState={job.state}
                      tasks={job.tasks}
                    />
                  </div>
                ))}
              </div>
            )}
      </section>
    </div>
  );
}
