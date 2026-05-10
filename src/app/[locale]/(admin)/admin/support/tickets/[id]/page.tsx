'use client';

/**
 * src/app/[locale]/(admin)/admin/support/tickets/[id]/page.tsx
 *
 * Full ticket detail for the NativPost agent.
 * Two-column layout:
 *   Left:  conversation thread + reply composer + AI polish
 *   Right: ticket metadata, assignment, priority controls, org info
 */

import {
  ArrowLeft,
  Bot,
  Loader2,
  Lock,
  Send,
  Sparkles,
  User,
  UserCircle2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

// -----------------------------------------------------------
// TYPES
// -----------------------------------------------------------
type Ticket = {
  id: string;
  orgId: string;
  subject: string;
  body: string;
  aiSummary: string | null;
  aiCategory: string | null;
  aiPriority: string | null;
  aiAutoResolved: boolean;
  aiConfidence: number | null;
  status: string;
  submitterName: string;
  submitterEmail: string;
  assignedToUserId: string | null;
  source: string;
  createdAt: string;
  resolvedAt: string | null;
};

type Message = {
  id: string;
  authorType: 'client' | 'agent' | 'ai';
  authorName: string;
  body: string;
  isInternal: boolean;
  aiPolished: boolean;
  createdAt: string;
};

type OrgInfo = {
  id: string;
  plan: string;
  planStatus: string;
};

// -----------------------------------------------------------
// CONFIG
// -----------------------------------------------------------
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'] as const;
const STATUS_OPTIONS = [
  { value: 'open',             label: 'Open' },
  { value: 'in_progress',      label: 'In progress' },
  { value: 'waiting_on_client',label: 'Waiting on client' },
  { value: 'resolved',         label: 'Resolved' },
  { value: 'closed',           label: 'Closed' },
] as const;

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'text-red-600 bg-red-50 border-red-200',
  high:   'text-orange-600 bg-orange-50 border-orange-200',
  medium: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  low:    'text-zinc-500 bg-zinc-50 border-zinc-200',
};

// -----------------------------------------------------------
// HELPERS
// -----------------------------------------------------------
function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// -----------------------------------------------------------
// MESSAGE BUBBLE (same visual language as client side)
// -----------------------------------------------------------
function MessageBubble({ msg }: { msg: Message }) {
  if (msg.isInternal) {
    return (
      <div className="flex gap-3 opacity-90">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
          <Lock className="size-3.5 text-amber-600" />
        </div>
        <div className="flex-1">
          <div className="rounded-xl rounded-tl-sm border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-600">Internal note</p>
            <p className="whitespace-pre-wrap text-sm text-amber-900">{msg.body}</p>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{msg.authorName} · {formatDate(msg.createdAt)}</p>
        </div>
      </div>
    );
  }

  if (msg.authorType === 'ai') {
    return (
      <div className="flex gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-100">
          <Bot className="size-4 text-emerald-600" />
        </div>
        <div className="flex-1">
          <div className="rounded-xl rounded-tl-sm border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
              <Sparkles className="size-3" />AI Support
            </p>
            <p className="whitespace-pre-wrap text-sm text-emerald-900">{msg.body}</p>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{formatDate(msg.createdAt)}</p>
        </div>
      </div>
    );
  }

  if (msg.authorType === 'client') {
    return (
      <div className="flex justify-end gap-3">
        <div className="max-w-[78%]">
          <div className="rounded-xl rounded-tr-sm bg-primary px-4 py-3">
            <p className="whitespace-pre-wrap text-sm text-primary-foreground">{msg.body}</p>
          </div>
          <p className="mt-1 text-right text-[11px] text-muted-foreground">
            {msg.authorName} · {formatDate(msg.createdAt)}
          </p>
        </div>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <User className="size-4 text-primary" />
        </div>
      </div>
    );
  }

  // Agent
  return (
    <div className="flex gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-100">
        <UserCircle2 className="size-4 text-zinc-600" />
      </div>
      <div className="flex-1">
        <div className="rounded-xl rounded-tl-sm border bg-card px-4 py-3">
          {msg.aiPolished && (
            <p className="mb-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Sparkles className="size-3" />AI polished
            </p>
          )}
          <p className="whitespace-pre-wrap text-sm">{msg.body}</p>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">{msg.authorName} · {formatDate(msg.createdAt)}</p>
      </div>
    </div>
  );
}

// -----------------------------------------------------------
// METADATA SIDEBAR
// -----------------------------------------------------------
function MetadataSidebar({
  ticket,
  org,
  onUpdate,
}: {
  ticket: Ticket;
  org: OrgInfo | null;
  onUpdate: (patch: Record<string, string>) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  const update = async (patch: Record<string, string>) => {
    setSaving(true);
    await onUpdate(patch);
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      {/* Status */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Status</p>
        <select
          value={ticket.status}
          onChange={(e) => update({ status: e.target.value })}
          disabled={saving}
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Priority */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Priority</p>
        <div className="flex gap-1.5 flex-wrap">
          {PRIORITY_OPTIONS.map((p) => (
            <button
              key={p}
              onClick={() => update({ aiPriority: p })}
              disabled={saving}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                ticket.aiPriority === p
                  ? PRIORITY_COLORS[p]
                  : 'border-transparent bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Assign to me */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Assignment</p>
        <div className="flex gap-2">
          <button
            onClick={() => update({ assignedToUserId: 'me' })}
            disabled={saving}
            className="flex-1 rounded-lg border px-3 py-2 text-xs hover:bg-muted disabled:opacity-40"
          >
            Assign to me
          </button>
          {ticket.assignedToUserId && (
            <button
              onClick={() => update({ assignedToUserId: '' })}
              disabled={saving}
              className="rounded-lg border px-3 py-2 text-xs hover:bg-muted disabled:opacity-40"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        {ticket.assignedToUserId && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Assigned · {ticket.assignedToUserId.slice(0, 8)}…
          </p>
        )}
      </div>

      <div className="border-t pt-4 space-y-3">
        {/* Submitter */}
        <div>
          <p className="text-xs font-medium text-muted-foreground">Submitted by</p>
          <p className="text-sm">{ticket.submitterName}</p>
          <p className="text-xs text-muted-foreground">{ticket.submitterEmail}</p>
        </div>

        {/* Org */}
        {org && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Organisation</p>
            <p className="font-mono text-xs">{org.id.slice(0, 12)}…</p>
            <p className="text-xs text-muted-foreground capitalize">{org.plan} · {org.planStatus}</p>
          </div>
        )}

        {/* AI info */}
        <div>
          <p className="text-xs font-medium text-muted-foreground">AI classification</p>
          <p className="text-sm capitalize">{ticket.aiCategory?.replace('_', ' ') ?? '—'}</p>
          {ticket.aiConfidence != null && (
            <p className="text-xs text-muted-foreground">{Math.round(ticket.aiConfidence * 100)}% confidence</p>
          )}
        </div>

        {/* Dates */}
        <div>
          <p className="text-xs font-medium text-muted-foreground">Created</p>
          <p className="text-xs">{formatDate(ticket.createdAt)}</p>
        </div>
        {ticket.resolvedAt && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Resolved</p>
            <p className="text-xs">{formatDate(ticket.resolvedAt)}</p>
          </div>
        )}

        {/* Source */}
        <div>
          <p className="text-xs font-medium text-muted-foreground">Source</p>
          <p className="text-xs capitalize">{ticket.source}</p>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------
// MAIN PAGE
// -----------------------------------------------------------
export default function AdminTicketDetail() {
  const params   = useParams();
  const ticketId = params.id as string;

  const [ticket,   setTicket]   = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [org,      setOrg]      = useState<OrgInfo | null>(null);
  const [loading,  setLoading]  = useState(true);

  // Reply state
  const [reply,        setReply]        = useState('');
  const [isInternal,   setIsInternal]   = useState(false);
  const [sending,      setSending]      = useState(false);
  const [polishing,    setPolishing]    = useState(false);
  const [polishInfo,   setPolishInfo]   = useState<string | null>(null);
  const [originalDraft, setOriginalDraft] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchTicket = useCallback(async () => {
    try {
      const res  = await fetch(`/api/admin/support/tickets/${ticketId}`);
      const data = await res.json();
      setTicket(data.ticket);
      setMessages(data.messages ?? []);
      setOrg(data.org ?? null);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { fetchTicket(); }, [fetchTicket]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const updateTicket = async (patch: Record<string, string>) => {
    await fetch(`/api/admin/support/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    fetchTicket();
  };

  const sendReply = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await fetch(`/api/admin/support/tickets/${ticketId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: reply.trim(),
          isInternal,
          aiPolished: !!originalDraft,
          originalBody: originalDraft,
        }),
      });
      setReply('');
      setOriginalDraft(null);
      setPolishInfo(null);
      fetchTicket();
    } finally {
      setSending(false);
    }
  };

  const polishReply = async () => {
    if (!reply.trim()) return;
    setPolishing(true);
    try {
      const res  = await fetch(`/api/admin/support/tickets/${ticketId}/polish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: reply }),
      });
      const data = await res.json();
      setOriginalDraft(reply);
      setReply(data.polishedReply);
      setPolishInfo(data.changesMade);
    } finally {
      setPolishing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-10">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-10">
        <p className="text-muted-foreground">Ticket not found</p>
        <Link href="/admin/support/tickets" className="text-sm text-primary hover:underline">
          Back to queue
        </Link>
      </div>
    );
  }

  const isClosed = ['resolved', 'closed'].includes(ticket.status);

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/support/tickets"
            className="rounded-lg p-1.5 hover:bg-muted"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <p className="truncate text-base font-semibold">{ticket.subject}</p>
            <p className="text-xs text-muted-foreground">
              #{ticketId.slice(0, 8).toUpperCase()} · {ticket.submitterName} · {ticket.submitterEmail}
            </p>
          </div>
        </div>
      </div>

      {/* Body — two columns */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: thread + composer */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {messages.map((m) => <MessageBubble key={m.id} msg={m} />)}
            <div ref={bottomRef} />
          </div>

          {/* Composer */}
          {!isClosed ? (
            <div className="border-t bg-background p-4">
              {/* Internal toggle */}
              <div className="mb-2 flex items-center gap-3">
                <button
                  onClick={() => setIsInternal(false)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${!isInternal ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
                >
                  Reply to client
                </button>
                <button
                  onClick={() => setIsInternal(true)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${isInternal ? 'bg-amber-50 text-amber-700' : 'text-muted-foreground hover:bg-muted'}`}
                >
                  <Lock className="size-3" />
                  Internal note
                </button>
              </div>

              {polishInfo && (
                <div className="mb-2 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  <Sparkles className="size-3.5 shrink-0" />
                  <span>{polishInfo}</span>
                  <button
                    onClick={() => {
                      if (originalDraft) setReply(originalDraft);
                      setOriginalDraft(null);
                      setPolishInfo(null);
                    }}
                    className="ml-auto"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )}

              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder={isInternal ? 'Add an internal note (not visible to client)…' : 'Write a reply to the client…'}
                rows={4}
                className={`mb-2 w-full resize-none rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                  isInternal ? 'bg-amber-50/50 border-amber-200' : 'bg-muted/30'
                }`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendReply();
                }}
              />

              <div className="flex items-center justify-between">
                {!isInternal && (
                  <button
                    onClick={polishReply}
                    disabled={polishing || !reply.trim()}
                    className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-40"
                  >
                    {polishing ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                    AI Polish
                  </button>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">⌘↵ to send</span>
                  <button
                    onClick={sendReply}
                    disabled={sending || !reply.trim()}
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    {isInternal ? 'Add note' : 'Send reply'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="border-t bg-muted/20 p-4 text-center text-sm text-muted-foreground">
              Ticket is {ticket.status}.{' '}
              <button onClick={() => updateTicket({ status: 'open' })} className="text-primary hover:underline">
                Reopen
              </button>
            </div>
          )}
        </div>

        {/* Right: metadata */}
        <div className="hidden w-64 shrink-0 overflow-y-auto border-l bg-muted/20 p-4 lg:block">
          <MetadataSidebar ticket={ticket} org={org} onUpdate={updateTicket} />
        </div>
      </div>
    </div>
  );
}