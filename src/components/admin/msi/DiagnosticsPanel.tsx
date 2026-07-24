'use client';

import { Activity } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

type CheckStatus = 'ok' | 'warn' | 'fail' | 'info' | 'unknown';
type Check = { key: string; label: string; status: CheckStatus; detail: string };
type Report = {
  platform: string;
  strategy: string;
  overall: CheckStatus;
  checks: Check[];
  generatedAt: string;
};

const ICON: Record<CheckStatus, string> = {
  ok: '✓',
  warn: '▲',
  fail: '✗',
  info: 'ℹ',
  unknown: '?',
};

const TONE: Record<CheckStatus, string> = {
  ok: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  fail: 'text-red-600 dark:text-red-400',
  info: 'text-muted-foreground',
  unknown: 'text-muted-foreground',
};

// Ops diagnostics: run DB/vault checks + a live platform probe on demand, so a
// failing account can be triaged from one place instead of hunting through logs.
export function DiagnosticsPanel({ accountId }: { accountId: string }) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);

  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/msi/accounts/${accountId}/diagnose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(b.error || `Server returned ${res.status}`);
      }
      setReport(b as Report);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Diagnostics failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Activity className="size-4" />
          Diagnostics
        </h2>
        <Button size="sm" variant="outline" disabled={busy} onClick={run}>
          {busy ? 'Running…' : report ? 'Re-run' : 'Run diagnostics'}
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        {report === null
          ? (
              <p className="text-xs text-muted-foreground">
                Run a live check of this account's credentials, token, permissions,
                and last publish.
              </p>
            )
          : (
              <div>
                <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className={`font-semibold ${TONE[report.overall]}`}>
                    {ICON[report.overall]}
                    {' '}
                    {report.overall.toUpperCase()}
                  </span>
                  <span>·</span>
                  <span>{report.platform}</span>
                  <span>·</span>
                  <span>{report.strategy}</span>
                  <span className="ml-auto">
                    {new Date(report.generatedAt).toLocaleString('en-US', {
                      timeStyle: 'short',
                      dateStyle: 'medium',
                    })}
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {report.checks.map(c => (
                    <li key={c.key} className="flex items-start gap-2 text-xs">
                      <span className={`shrink-0 font-semibold ${TONE[c.status]}`}>
                        {ICON[c.status]}
                      </span>
                      <span className="w-40 shrink-0 text-foreground">{c.label}</span>
                      <span className="text-muted-foreground">{c.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
      </div>
    </section>
  );
}
