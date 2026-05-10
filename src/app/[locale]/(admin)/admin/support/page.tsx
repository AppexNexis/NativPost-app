'use client';

/**
 * src/app/[locale]/(admin)/admin/support/page.tsx
 *
 * The ops overview — the first thing the team sees when they open admin.
 * Shows: live stat cards, urgent queue, unassigned tickets, recent activity.
 */

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquare,
  RefreshCw,
  UserX,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

// -----------------------------------------------------------
// TYPES
// -----------------------------------------------------------
type Ticket = {
  id: string;
  orgId: string;
  subject: string;
  aiSummary: string | null;
  aiCategory: string | null;
  aiPriority: string | null;
  aiAutoResolved: boolean;
  status: string;
  submitterName: string;
  submitterEmail: string;
  assignedToUserId: string | null;
  awaitingReply: boolean;
  replyCount: number;
  createdAt: string;
  updatedAt: string;
};

type Stats = {
  byStatus: { status: string; count: number }[];
  byPriority: { priority: string; count: number }[];
  unassigned: number;
};

// -----------------------------------------------------------
// HELPERS
// -----------------------------------------------------------
const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500',
  high:   'bg-orange-400',
  medium: 'bg-yellow-400',
  low:    'bg-zinc-300',
};

const CATEGORY_LABEL: Record<string, string> = {
  billing:            'Billing',
  content_generation: 'Content',
  social_connection:  'Connections',
  analytics:          'Analytics',
  account:            'Account',
  technical:          'Technical',
  other:              'General',
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// -----------------------------------------------------------
// STAT CARD
// -----------------------------------------------------------
function StatCard({
  label, value, sub, icon, accent,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className={`mb-3 inline-flex rounded-lg p-2.5 ${accent}`}>
        {icon}
      </div>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-sm font-medium">{label}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// -----------------------------------------------------------
// TICKET ROW (compact, for queue lists)
// -----------------------------------------------------------
function TicketRow({ ticket }: { ticket: Ticket }) {
  return (
    <Link
      href={`/admin/support/tickets/${ticket.id}`}
      className="group flex items-start gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-muted/50"
    >
      <div className={`mt-1.5 size-2 shrink-0 rounded-full ${PRIORITY_DOT[ticket.aiPriority ?? 'medium'] ?? 'bg-zinc-300'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-medium group-hover:text-primary">
            {ticket.subject}
          </p>
          <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(ticket.createdAt)}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          {ticket.aiCategory && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {CATEGORY_LABEL[ticket.aiCategory] ?? ticket.aiCategory}
            </span>
          )}
          {ticket.awaitingReply && (
            <span className="text-[10px] font-medium text-amber-600">awaiting reply</span>
          )}
          {ticket.aiAutoResolved && (
            <span className="flex items-center gap-0.5 text-[10px] text-emerald-600">
              <Zap className="size-2.5" />AI resolved
            </span>
          )}
          <span className="text-[11px] text-muted-foreground">{ticket.submitterName}</span>
        </div>
      </div>
      <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

// -----------------------------------------------------------
// MAIN PAGE
// -----------------------------------------------------------
export default function AdminSupportOverview() {
  const [stats, setStats]       = useState<Stats | null>(null);
  const [urgent, setUrgent]     = useState<Ticket[]>([]);
  const [unassigned, setUnassigned] = useState<Ticket[]>([]);
  const [recent, setRecent]     = useState<Ticket[]>([]);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [urgentRes, unassignedRes, recentRes] = await Promise.all([
        fetch('/api/admin/support/tickets?priority=urgent&status=open&limit=5'),
        fetch('/api/admin/support/tickets?assigned=unassigned&status=open&limit=5'),
        fetch('/api/admin/support/tickets?limit=8'),
      ]);

      const urgentData      = await urgentRes.json();
      const unassignedData  = await unassignedRes.json();
      const recentData      = await recentRes.json();

      setUrgent(urgentData.tickets ?? []);
      setUnassigned(unassignedData.tickets ?? []);
      setRecent(recentData.tickets ?? []);
      setStats(recentData.stats ?? null);
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const getCount = (status: string) =>
    Number(stats?.byStatus.find((s) => s.status === status)?.count ?? 0);

  const openCount        = getCount('open') + getCount('in_progress');
  const aiResolvedCount  = getCount('auto_resolved');
  const resolvedCount    = getCount('resolved') + getCount('closed');
  const urgentCount      = Number(stats?.byPriority.find((p) => p.priority === 'urgent')?.count ?? 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Support overview</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">All client tickets across NativPost</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              label="Open tickets"
              value={openCount}
              sub="open + in progress"
              icon={<MessageSquare className="size-4 text-blue-600" />}
              accent="bg-blue-50"
            />
            <StatCard
              label="Urgent"
              value={urgentCount}
              sub="need immediate attention"
              icon={<AlertTriangle className="size-4 text-red-600" />}
              accent="bg-red-50"
            />
            <StatCard
              label="Unassigned"
              value={stats?.unassigned ?? 0}
              sub="no agent assigned"
              icon={<UserX className="size-4 text-amber-600" />}
              accent="bg-amber-50"
            />
            <StatCard
              label="AI resolved"
              value={aiResolvedCount}
              sub={`${resolvedCount} total resolved`}
              icon={<Zap className="size-4 text-emerald-600" />}
              accent="bg-emerald-50"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Urgent queue */}
            <div className="rounded-xl border bg-card lg:col-span-1">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="size-2 rounded-full bg-red-500" />
                  <p className="text-sm font-medium">Urgent</p>
                </div>
                <Link href="/admin/support/tickets?priority=urgent" className="text-xs text-primary hover:underline">
                  View all
                </Link>
              </div>
              <div className="divide-y">
                {urgent.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                    <CheckCircle2 className="size-4 text-emerald-500" />
                    No urgent tickets
                  </div>
                ) : (
                  urgent.map((t) => <TicketRow key={t.id} ticket={t} />)
                )}
              </div>
            </div>

            {/* Unassigned queue */}
            <div className="rounded-xl border bg-card lg:col-span-1">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="size-2 rounded-full bg-amber-400" />
                  <p className="text-sm font-medium">Unassigned</p>
                </div>
                <Link href="/admin/support/tickets?assigned=unassigned" className="text-xs text-primary hover:underline">
                  View all
                </Link>
              </div>
              <div className="divide-y">
                {unassigned.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                    <CheckCircle2 className="size-4 text-emerald-500" />
                    All tickets assigned
                  </div>
                ) : (
                  unassigned.map((t) => <TicketRow key={t.id} ticket={t} />)
                )}
              </div>
            </div>

            {/* Recent activity */}
            <div className="rounded-xl border bg-card lg:col-span-1">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  <Clock className="size-4 text-muted-foreground" />
                  <p className="text-sm font-medium">Recent</p>
                </div>
                <Link href="/admin/support/tickets" className="text-xs text-primary hover:underline">
                  All tickets
                </Link>
              </div>
              <div className="divide-y">
                {recent.map((t) => <TicketRow key={t.id} ticket={t} />)}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}