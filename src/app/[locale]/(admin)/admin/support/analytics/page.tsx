'use client';

/**
 * src/app/[locale]/(admin)/admin/support/analytics/page.tsx
 *
 * Support analytics dashboard.
 * Volume trends, category breakdown, auto-resolve rate, CSAT, source breakdown.
 */

import {
  // BarChart3,
  Bot,
  Loader2,
  MessageSquare,
  RefreshCw,
  Star,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

// -----------------------------------------------------------
// TYPES
// -----------------------------------------------------------
type Analytics = {
  period: { days: number; since: string };
  summary: {
    total: number;
    autoResolved: number;
    autoResolveRate: number;
    avgCsat: number | null;
    csatRated: number;
    avgMessages: number;
  };
  byStatus:   { status: string; count: number }[];
  byCategory: { category: string | null; count: number }[];
  byPriority: { priority: string | null; count: number }[];
  bySource:   { source: string; count: number }[];
  dailyVolume:{ date: string; count: number }[];
};

// -----------------------------------------------------------
// CONFIG
// -----------------------------------------------------------
const CATEGORY_LABELS: Record<string, string> = {
  billing:            'Billing',
  content_generation: 'Content',
  social_connection:  'Connections',
  analytics:          'Analytics',
  account:            'Account',
  technical:          'Technical',
  other:              'General',
};

const STATUS_COLORS: Record<string, string> = {
  open:             'bg-blue-500',
  in_progress:      'bg-purple-500',
  auto_resolved:    'bg-emerald-500',
  waiting_on_client:'bg-amber-500',
  resolved:         'bg-teal-500',
  closed:           'bg-zinc-400',
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-500',
  high:   'bg-orange-400',
  medium: 'bg-yellow-400',
  low:    'bg-zinc-300',
};

// -----------------------------------------------------------
// STAT CARD
// -----------------------------------------------------------
function StatCard({
  label, value, sub, icon, accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className={`mb-3 inline-flex rounded-lg p-2.5 ${accent}`}>{icon}</div>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-sm font-medium">{label}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// -----------------------------------------------------------
// BAR CHART (simple CSS bars — no external lib needed)
// -----------------------------------------------------------
function BarRow({ label, count, total, color }: {
  label: string; count: number; total: number; color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">{label}</span>
      <div className="flex-1 overflow-hidden rounded-full bg-muted h-2">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-xs font-medium">{count}</span>
    </div>
  );
}

// -----------------------------------------------------------
// SPARKLINE (daily volume)
// -----------------------------------------------------------
function Sparkline({ data }: { data: { date: string; count: number }[] }) {
  if (data.length === 0) return <p className="text-sm text-muted-foreground">No data</p>;

  const max = Math.max(...data.map((d) => Number(d.count)), 1);
  const barW = Math.max(8, Math.floor(560 / Math.max(data.length, 1)));

  return (
    <div className="flex items-end gap-0.5 h-24">
      {data.map((d) => {
        const h = Math.max(4, Math.round((Number(d.count) / max) * 96));
        const date = new Date(d.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        return (
          <div
            key={d.date}
            title={`${date}: ${d.count} tickets`}
            className="group relative flex flex-col items-center justify-end"
            style={{ width: `${barW}px`, height: '96px' }}
          >
            <div
              className="w-full rounded-t bg-primary/70 transition-colors group-hover:bg-primary"
              style={{ height: `${h}px` }}
            />
            <div className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] text-background group-hover:block">
              {date}: {d.count}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// -----------------------------------------------------------
// MAIN PAGE
// -----------------------------------------------------------
export default function SupportAnalyticsPage() {
  const [data,    setData]    = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [days,    setDays]    = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/support/analytics?days=${days}`);
      const d   = await res.json();
      setData(d);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const total = data?.summary.total ?? 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Support analytics</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Performance metrics across all client tickets
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : !data ? (
        <p className="text-muted-foreground">Failed to load analytics.</p>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              label="Total tickets"
              value={data.summary.total}
              sub={`last ${days} days`}
              icon={<MessageSquare className="size-4 text-blue-600" />}
              accent="bg-blue-50"
            />
            <StatCard
              label="AI resolved"
              value={`${data.summary.autoResolveRate}%`}
              sub={`${data.summary.autoResolved} of ${data.summary.total}`}
              icon={<Zap className="size-4 text-emerald-600" />}
              accent="bg-emerald-50"
            />
            <StatCard
              label="CSAT score"
              value={data.summary.avgCsat != null ? `${data.summary.avgCsat}/5` : 'No data'}
              sub={data.summary.csatRated > 0 ? `${data.summary.csatRated} ratings` : 'No ratings yet'}
              icon={<Star className="size-4 text-amber-600" />}
              accent="bg-amber-50"
            />
            <StatCard
              label="Avg messages"
              value={data.summary.avgMessages}
              sub="per conversation"
              icon={<TrendingUp className="size-4 text-purple-600" />}
              accent="bg-purple-50"
            />
          </div>

          {/* Daily volume chart */}
          <div className="rounded-xl border bg-card p-5">
            <p className="mb-4 text-sm font-medium">Daily ticket volume</p>
            <Sparkline data={data.dailyVolume} />
            {data.dailyVolume.length === 0 && (
              <p className="text-sm text-muted-foreground">No tickets in this period.</p>
            )}
          </div>

          {/* Breakdown grid */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* By category */}
            <div className="rounded-xl border bg-card p-5">
              <p className="mb-4 text-sm font-medium">By category</p>
              <div className="space-y-3">
                {data.byCategory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data</p>
                ) : (
                  data.byCategory
                    .sort((a, b) => Number(b.count) - Number(a.count))
                    .map((c) => (
                      <BarRow
                        key={c.category}
                        label={CATEGORY_LABELS[c.category ?? ''] ?? c.category ?? 'Unknown'}
                        count={Number(c.count)}
                        total={total}
                        color="bg-primary"
                      />
                    ))
                )}
              </div>
            </div>

            {/* By status */}
            <div className="rounded-xl border bg-card p-5">
              <p className="mb-4 text-sm font-medium">By status</p>
              <div className="space-y-3">
                {data.byStatus.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data</p>
                ) : (
                  data.byStatus
                    .sort((a, b) => Number(b.count) - Number(a.count))
                    .map((s) => (
                      <BarRow
                        key={s.status}
                        label={s.status.replace('_', ' ')}
                        count={Number(s.count)}
                        total={total}
                        color={STATUS_COLORS[s.status] ?? 'bg-zinc-400'}
                      />
                    ))
                )}
              </div>
            </div>

            {/* By priority */}
            <div className="rounded-xl border bg-card p-5">
              <p className="mb-4 text-sm font-medium">By priority</p>
              <div className="space-y-3">
                {data.byPriority.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data</p>
                ) : (
                  ['urgent', 'high', 'medium', 'low'].map((p) => {
                    const found = data.byPriority.find((x) => x.priority === p);
                    if (!found) return null;
                    return (
                      <BarRow
                        key={p}
                        label={p.charAt(0).toUpperCase() + p.slice(1)}
                        count={Number(found.count)}
                        total={total}
                        color={PRIORITY_COLORS[p] ?? 'bg-zinc-300'}
                      />
                    );
                  })
                )}
              </div>
            </div>

            {/* By source */}
            <div className="rounded-xl border bg-card p-5">
              <p className="mb-4 text-sm font-medium">By source</p>
              <div className="space-y-3">
                {data.bySource.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data</p>
                ) : (
                  data.bySource
                    .sort((a, b) => Number(b.count) - Number(a.count))
                    .map((s) => (
                      <BarRow
                        key={s.source}
                        label={s.source.charAt(0).toUpperCase() + s.source.slice(1)}
                        count={Number(s.count)}
                        total={total}
                        color="bg-primary/60"
                      />
                    ))
                )}
              </div>
            </div>
          </div>

          {/* AI performance note */}
          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <Bot className="size-4 text-emerald-600" />
              <p className="text-sm font-medium">AI performance</p>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {data.summary.autoResolveRate >= 50
                ? `Your AI is resolving ${data.summary.autoResolveRate}% of tickets automatically. Adding more knowledge base articles can push this higher.`
                : `Your AI auto-resolve rate is ${data.summary.autoResolveRate}%. Expand the knowledge base to handle more ticket types automatically.`}
            </p>
          </div>
        </>
      )}
    </div>
  );
}