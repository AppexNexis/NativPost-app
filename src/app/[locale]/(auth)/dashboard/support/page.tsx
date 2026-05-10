'use client';

/**
 * src/app/[locale]/(auth)/dashboard/support/page.tsx
 *
 * Drop path: src/app/[locale]/(auth)/dashboard/support/page.tsx
 *
 * The main support hub. Shows:
 * - Stats bar (open, in progress, auto-resolved)
 * - Ticket list with priority badges and category labels
 * - Create ticket modal
 * - Click through to individual ticket (handled by /support/[id]/page.tsx)
 */

import {
  AlertCircle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  X,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { EmptyState } from '@/features/dashboard/EmptyState';
import { PageHeader } from '@/features/dashboard/PageHeader';

// -----------------------------------------------------------
// TYPES
// -----------------------------------------------------------
type Ticket = {
  id: string;
  subject: string;
  aiSummary: string | null;
  aiCategory: string | null;
  aiPriority: string | null;
  aiAutoResolved: boolean;
  status: string;
  submitterName: string;
  submitterEmail: string;
  source: string;
  createdAt: string;
  updatedAt: string;
};

type Stats = { status: string; count: number }[];

// -----------------------------------------------------------
// CONFIG
// -----------------------------------------------------------
const PRIORITY_CONFIG: Record<string, { label: string; classes: string }> = {
  urgent: { label: 'Urgent', classes: 'bg-red-50 text-red-700 border-red-200' },
  high:   { label: 'High',   classes: 'bg-orange-50 text-orange-700 border-orange-200' },
  medium: { label: 'Medium', classes: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  low:    { label: 'Low',    classes: 'bg-zinc-50 text-zinc-600 border-zinc-200' },
};

const CATEGORY_LABELS: Record<string, string> = {
  billing: 'Billing',
  content_generation: 'Content',
  social_connection: 'Connections',
  analytics: 'Analytics',
  account: 'Account',
  technical: 'Technical',
  other: 'General',
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; classes: string }> = {
  open:               { label: 'Open',        icon: Clock,         classes: 'bg-blue-50 text-blue-700' },
  in_progress:        { label: 'In progress', icon: RefreshCw,     classes: 'bg-purple-50 text-purple-700' },
  auto_resolved:      { label: 'AI resolved', icon: Bot,           classes: 'bg-emerald-50 text-emerald-700' },
  waiting_on_client:  { label: 'Waiting',     icon: Clock,         classes: 'bg-amber-50 text-amber-700' },
  resolved:           { label: 'Resolved',    icon: CheckCircle2,  classes: 'bg-emerald-50 text-emerald-700' },
  closed:             { label: 'Closed',      icon: CheckCircle2,  classes: 'bg-zinc-100 text-zinc-500' },
};

// -----------------------------------------------------------
// SUB-COMPONENTS
// -----------------------------------------------------------
function PriorityBadge({ priority }: { priority: string | null }) {
  const cfg = PRIORITY_CONFIG[priority ?? 'medium'] ?? PRIORITY_CONFIG.medium!;
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${cfg.classes}`}>
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.open!;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.classes}`}>
      <Icon className="size-3" />
      {cfg.label}
    </span>
  );
}

function StatCard({ label, value, icon, color }: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className={`mb-2 inline-flex rounded-lg p-2 ${color}`}>{icon}</div>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

// -----------------------------------------------------------
// CREATE TICKET MODAL
// -----------------------------------------------------------
function CreateTicketModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!subject.trim() || !body.trim()) {
      setError('Please fill in both fields.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), body: body.trim() }),
      });
      if (!res.ok) throw new Error('Failed to create ticket');
      setSubject('');
      setBody('');
      onCreated();
      onClose();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-xl rounded-2xl border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b p-5">
          <div>
            <h2 className="text-base font-semibold">Open a support ticket</h2>
            <p className="text-sm text-muted-foreground">Our team usually responds within 4 hours</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. My Instagram post didn't publish"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Describe your issue</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Include as much detail as possible — what you tried, what you expected, what happened instead."
              rows={5}
              className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Our AI will instantly try to resolve common issues — if it can't, a human takes over.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t p-5">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <MessageSquare className="size-4" />}
            {submitting ? 'Submitting…' : 'Submit ticket'}
          </button>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------
// TICKET ROW
// -----------------------------------------------------------
function TicketRow({ ticket }: { ticket: Ticket }) {
  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const h = Math.floor(diff / 3_600_000);
    if (h < 1) return 'just now';
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  };

  return (
    <Link
      href={`/dashboard/support/${ticket.id}`}
      className="group flex items-start gap-4 border-b px-5 py-4 transition-colors hover:bg-muted/40 last:border-b-0"
    >
      {/* Priority indicator */}
      <div className={`mt-1 size-2 shrink-0 rounded-full ${
        ticket.aiPriority === 'urgent' ? 'bg-red-500' :
        ticket.aiPriority === 'high' ? 'bg-orange-400' :
        ticket.aiPriority === 'medium' ? 'bg-yellow-400' : 'bg-zinc-300'
      }`} />

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <p className="truncate text-sm font-medium group-hover:text-primary">{ticket.subject}</p>
          <div className="flex shrink-0 items-center gap-2">
            <StatusBadge status={ticket.status} />
            <ArrowRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        {ticket.aiSummary && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{ticket.aiSummary}</p>
        )}
        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
          {ticket.aiCategory && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {CATEGORY_LABELS[ticket.aiCategory] ?? ticket.aiCategory}
            </span>
          )}
          <PriorityBadge priority={ticket.aiPriority} />
          {ticket.aiAutoResolved && (
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600">
              <Zap className="size-3" />AI resolved
            </span>
          )}
          <span className="text-[11px] text-muted-foreground">{timeAgo(ticket.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}

// -----------------------------------------------------------
// MAIN PAGE
// -----------------------------------------------------------
export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<Stats>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: statusFilter, limit: '50' });
      const res = await fetch(`/api/support/tickets?${params}`);
      const data = await res.json();
      setTickets(data.tickets ?? []);
      setStats(data.stats ?? []);
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const getStatCount = (status: string) =>
    Number(stats.find((s) => s.status === status)?.count ?? 0);

  const openCount = getStatCount('open') + getStatCount('in_progress');
  const aiResolvedCount = getStatCount('auto_resolved');
  const resolvedCount = getStatCount('resolved') + getStatCount('closed');

  const STATUS_FILTERS = [
    { value: 'all',          label: 'All tickets' },
    { value: 'open',         label: 'Open' },
    { value: 'in_progress',  label: 'In progress' },
    { value: 'auto_resolved',label: 'AI resolved' },
    { value: 'resolved',     label: 'Resolved' },
  ];

  return (
    <>
      <div className="flex flex-col gap-6 p-6">
        <PageHeader
          title="Support"
          description="Get help with your NativPost account"
          actions={
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="size-4" />
              Open ticket
            </button>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            label="Open tickets"
            value={openCount}
            icon={<MessageSquare className="size-4 text-blue-600" />}
            color="bg-blue-50"
          />
          <StatCard
            label="AI resolved"
            value={aiResolvedCount}
            icon={<Zap className="size-4 text-emerald-600" />}
            color="bg-emerald-50"
          />
          <StatCard
            label="Resolved"
            value={resolvedCount}
            icon={<CheckCircle2 className="size-4 text-zinc-500" />}
            color="bg-zinc-50"
          />
        </div>

        {/* Ticket list */}
        <div className="rounded-xl border bg-card">
          {/* Filters */}
          <div className="flex items-center gap-1 border-b px-4 py-3">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  statusFilter === f.value
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : tickets.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="No tickets"
              description={statusFilter === 'all' ? "You haven't opened any support tickets yet." : `No ${statusFilter} tickets.`}
              actionLabel="Open your first ticket"
              onAction={() => setShowCreate(true)}
            />
          ) : (
            <div>
              {tickets.map((t) => <TicketRow key={t.id} ticket={t} />)}
            </div>
          )}
        </div>

        {/* Quick links */}
        <div className="rounded-xl border bg-card p-5">
          <p className="mb-3 text-sm font-medium">Quick links</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              { label: 'Connect a platform', href: '/dashboard/connections' },
              { label: 'Billing & plans', href: '/dashboard/billing' },
              { label: 'Brand Profile', href: '/dashboard/brand-profile' },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm hover:bg-muted"
              >
                {link.label}
                <ExternalLink className="size-3.5 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      </div>

      <CreateTicketModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={fetchTickets}
      />
    </>
  );
}