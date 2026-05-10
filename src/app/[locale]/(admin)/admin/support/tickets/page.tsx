'use client';

/**
 * src/app/[locale]/(admin)/admin/support/tickets/page.tsx
 *
 * Full cross-org ticket queue for the NativPost team.
 * Filters: status, priority, category, assigned, org search.
 * Clicking a row goes to the ticket detail.
 */

import {
  CheckCircle2,
  Loader2,
  RefreshCw,
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
};

// -----------------------------------------------------------
// CONFIG
// -----------------------------------------------------------
const PRIORITY_CONFIG: Record<string, { dot: string; label: string; badge: string }> = {
  urgent: { dot: 'bg-red-500',    label: 'Urgent',  badge: 'bg-red-50 text-red-700 border-red-200' },
  high:   { dot: 'bg-orange-400', label: 'High',    badge: 'bg-orange-50 text-orange-700 border-orange-200' },
  medium: { dot: 'bg-yellow-400', label: 'Medium',  badge: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  low:    { dot: 'bg-zinc-300',   label: 'Low',     badge: 'bg-zinc-50 text-zinc-600 border-zinc-200' },
};

const STATUS_CONFIG: Record<string, { label: string; badge: string }> = {
  open:             { label: 'Open',        badge: 'bg-blue-50 text-blue-700' },
  in_progress:      { label: 'In progress', badge: 'bg-purple-50 text-purple-700' },
  auto_resolved:    { label: 'AI resolved', badge: 'bg-emerald-50 text-emerald-700' },
  waiting_on_client:{ label: 'Waiting',     badge: 'bg-amber-50 text-amber-700' },
  resolved:         { label: 'Resolved',    badge: 'bg-emerald-50 text-emerald-700' },
  closed:           { label: 'Closed',      badge: 'bg-zinc-100 text-zinc-500' },
};

const CATEGORY_LABELS: Record<string, string> = {
  billing:            'Billing',
  content_generation: 'Content',
  social_connection:  'Connections',
  analytics:          'Analytics',
  account:            'Account',
  technical:          'Technical',
  other:              'General',
};

// -----------------------------------------------------------
// HELPERS
// -----------------------------------------------------------
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
// FILTER PILL BUTTON
// -----------------------------------------------------------
function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'border bg-background text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

// -----------------------------------------------------------
// MAIN PAGE
// -----------------------------------------------------------
export default function AdminTicketsQueue() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [status,   setStatus]   = useState('all');
  const [priority, setPriority] = useState('all');
  const [assigned, setAssigned] = useState('all');
  const [offset,   setOffset]   = useState(0);
  const LIMIT = 30;

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
      if (status   !== 'all') p.set('status', status);
      if (priority !== 'all') p.set('priority', priority);
      if (assigned !== 'all') p.set('assigned', assigned);

      const res  = await fetch(`/api/admin/support/tickets?${p}`);
      const data = await res.json();
      setTickets(data.tickets ?? []);
      setTotal(data.total ?? 0);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  }, [status, priority, assigned, offset]);

  useEffect(() => {
    setOffset(0);
  }, [status, priority, assigned]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">All tickets</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {total} total · across all client organisations
          </p>
        </div>
        <button
          onClick={fetchTickets}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="mb-5 space-y-3">
        {/* Status */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground w-16">Status</span>
          {['all', 'open', 'in_progress', 'auto_resolved', 'resolved', 'closed'].map((s) => (
            <FilterPill
              key={s}
              label={STATUS_CONFIG[s]?.label ?? 'All'}
              active={status === s}
              onClick={() => setStatus(s)}
            />
          ))}
        </div>
        {/* Priority */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground w-16">Priority</span>
          {['all', 'urgent', 'high', 'medium', 'low'].map((p) => (
            <FilterPill
              key={p}
              label={p === 'all' ? 'All' : PRIORITY_CONFIG[p]!.label}
              active={priority === p}
              onClick={() => setPriority(p)}
            />
          ))}
        </div>
        {/* Assignment */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground w-16">Assigned</span>
          {[
            { value: 'all',        label: 'All' },
            { value: 'me',         label: 'Mine' },
            { value: 'unassigned', label: 'Unassigned' },
          ].map(({ value, label }) => (
            <FilterPill
              key={value}
              label={label}
              active={assigned === value}
              onClick={() => setAssigned(value)}
            />
          ))}
        </div>
      </div>

      {/* Ticket table */}
      <div className="rounded-xl border bg-card">
        {/* Table header */}
        <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-4 border-b bg-muted/40 px-4 py-2.5">
          <span />
          <p className="text-xs font-medium text-muted-foreground">Subject</p>
          <p className="text-xs font-medium text-muted-foreground">Status</p>
          <p className="hidden text-xs font-medium text-muted-foreground sm:block">Category</p>
          <p className="hidden text-xs font-medium text-muted-foreground sm:block">Assigned</p>
          <p className="text-xs font-medium text-muted-foreground">Time</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <CheckCircle2 className="size-8 text-emerald-500" />
            <p className="text-sm">No tickets match these filters</p>
          </div>
        ) : (
          <div className="divide-y">
            {tickets.map((ticket) => {
              const pc = PRIORITY_CONFIG[ticket.aiPriority ?? 'medium'];
              const sc = STATUS_CONFIG[ticket.status];
              return (
                <Link
                  key={ticket.id}
                  href={`/admin/support/tickets/${ticket.id}`}
                  className="group grid grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-4 px-4 py-3.5 transition-colors hover:bg-muted/40"
                >
                  {/* Priority dot */}
                  <div className={`size-2.5 rounded-full ${pc?.dot ?? 'bg-zinc-300'}`} />

                  {/* Subject + summary */}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium group-hover:text-primary">
                      {ticket.subject}
                    </p>
                    {ticket.aiSummary && (
                      <p className="truncate text-xs text-muted-foreground">{ticket.aiSummary}</p>
                    )}
                    <div className="mt-0.5 flex items-center gap-2">
                      {ticket.awaitingReply && (
                        <span className="text-[10px] font-medium text-amber-600">awaiting reply</span>
                      )}
                      {ticket.aiAutoResolved && (
                        <span className="flex items-center gap-0.5 text-[10px] text-emerald-600">
                          <Zap className="size-2.5" />auto
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground">{ticket.submitterName}</span>
                    </div>
                  </div>

                  {/* Status badge */}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${sc?.badge ?? ''}`}>
                    {sc?.label ?? ticket.status}
                  </span>

                  {/* Category */}
                  <span className="hidden rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">
                    {CATEGORY_LABELS[ticket.aiCategory ?? ''] ?? '—'}
                  </span>

                  {/* Assigned */}
                  <span className="hidden text-[11px] text-muted-foreground sm:block">
                    {ticket.assignedToUserId ? 'Assigned' : (
                      <span className="text-amber-600">Unassigned</span>
                    )}
                  </span>

                  {/* Time */}
                  <span className="text-[11px] text-muted-foreground">{timeAgo(ticket.createdAt)}</span>
                </Link>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {total > LIMIT && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                disabled={offset === 0}
                className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-muted"
              >
                Previous
              </button>
              <button
                onClick={() => setOffset(offset + LIMIT)}
                disabled={offset + LIMIT >= total}
                className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-muted"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}