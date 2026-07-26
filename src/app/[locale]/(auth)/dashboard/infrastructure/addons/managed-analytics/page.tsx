'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BarChart3, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/features/dashboard/ErrorBanner';
import { PageHeader } from '@/features/dashboard/PageHeader';
import { GridPageSkeleton } from '@/features/dashboard/PageSkeletons';

type ReportSummary = {
  headline: string;
  sections: { title: string; body: string }[];
  recommendations: string[];
};
type Report = {
  id: string;
  managedAccountId: string;
  accountName: string | null;
  billingPeriod: string;
  status: string;
  summary: ReportSummary;
  deliveredAt: string | null;
  createdAt: string;
};
type ManagedAccount = { id: string; platform: string; displayName: string | null; lifecycleState: string };

function fmtPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) {
    return period;
  }
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function ManagedAnalyticsPage() {
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const reportsQuery = useQuery({
    queryKey: ['managed-analytics-reports'],
    queryFn: async (): Promise<Report[]> => {
      const res = await fetch('/api/msi/addons/managed-analytics');
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}.`);
      }
      const body = await res.json();
      return body.reports ?? [];
    },
  });

  const accountsQuery = useQuery({
    queryKey: ['msi-accounts'],
    queryFn: async (): Promise<ManagedAccount[]> => {
      const res = await fetch('/api/msi/accounts');
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}.`);
      }
      const body = await res.json();
      return body.accounts ?? [];
    },
  });

  const accounts = (accountsQuery.data ?? []).filter(a => a.lifecycleState === 'live');
  const reports = reportsQuery.data ?? [];

  async function generate() {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch('/api/msi/addons/managed-analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managedAccountId: accountId }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Could not generate the report.');
      }
      await queryClient.invalidateQueries({ queryKey: ['managed-analytics-reports'] });
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Link
        href="/dashboard/infrastructure/addons"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Add-ons
      </Link>

      <PageHeader
        title="Managed Analytics"
        description="A monthly growth report for each managed account — what worked, what didn't, and a plan for next month."
      />

      {/* Generate */}
      <div className="mb-6 rounded-xl border border-border bg-card p-5">
        <p className="mb-3 text-sm font-medium">Generate this month's report</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={accountId}
            onChange={e => setAccountId(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Select an account…</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.displayName || 'Managed account'} · {a.platform}
              </option>
            ))}
          </select>
          <Button className="gap-2" disabled={!accountId || generating} onClick={generate}>
            {generating ? <Loader2 className="size-4 animate-spin" /> : <BarChart3 className="size-4" />}
            Generate
          </Button>
        </div>
        {accounts.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">No live managed accounts yet.</p>
        )}
        {genError && <p className="mt-2 text-xs text-red-500">{genError}</p>}
      </div>

      {/* Reports */}
      {reportsQuery.isLoading ? (
        <GridPageSkeleton cards={2} />
      ) : reportsQuery.error ? (
        <ErrorBanner title="Couldn't load reports" detail={(reportsQuery.error as Error).message} />
      ) : reports.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <BarChart3 className="mx-auto size-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium text-foreground">No reports yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Generate a report for a managed account above. It's reviewed by our team before it lands here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map(report => {
            const delivered = report.status === 'delivered';
            return (
              <div key={report.id} className="rounded-xl border border-border bg-card p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">
                      {report.accountName || 'Managed account'} · {fmtPeriod(report.billingPeriod)}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      delivered
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400'
                        : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300'
                    }`}
                  >
                    {delivered ? <CheckCircle2 className="size-2.5" /> : <Clock className="size-2.5" />}
                    {delivered ? 'Delivered' : 'In review'}
                  </span>
                </div>

                {delivered ? (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-foreground">{report.summary.headline}</p>
                    {report.summary.sections?.map(s => (
                      <div key={s.title}>
                        <p className="text-xs font-semibold text-foreground">{s.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{s.body}</p>
                      </div>
                    ))}
                    {report.summary.recommendations?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-foreground">Recommendations</p>
                        <ul className="mt-1 space-y-1">
                          {report.summary.recommendations.map(r => (
                            <li key={r} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                              <span className="mt-1 size-1 shrink-0 rounded-full bg-primary" />
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Our team is reviewing this report. It'll appear here once delivered.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
