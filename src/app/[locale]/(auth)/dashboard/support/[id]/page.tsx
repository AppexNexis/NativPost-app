'use client';

/**
 * src/app/[locale]/(auth)/dashboard/support/[id]/page.tsx
 *
 * Full ticket conversation view.
 * Features:
 * - Complete message thread (client, agent, AI messages styled differently)
 * - Reply composer with AI Polish button
 * - Status management (resolve, close)
 * - Ticket metadata sidebar
 */

import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Loader2,
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

// -----------------------------------------------------------
// HELPERS
// -----------------------------------------------------------
function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// -----------------------------------------------------------
// MESSAGE BUBBLE
// -----------------------------------------------------------
function MessageBubble({ message }: { message: Message }) {
  const isClient = message.authorType === 'client';
  const isAI = message.authorType === 'ai';

  if (message.isInternal) {
    return (
      <div className="flex gap-3 opacity-80">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
          <UserCircle2 className="size-4 text-amber-600" />
        </div>
        <div className="flex-1">
          <div className="rounded-xl rounded-tl-sm border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-amber-600">Internal note</p>
            <p className="whitespace-pre-wrap text-sm text-amber-900">{message.body}</p>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{message.authorName} · {formatDate(message.createdAt)}</p>
        </div>
      </div>
    );
  }

  if (isAI) {
    return (
      <div className="flex gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-100">
          <Bot className="size-4 text-emerald-600" />
        </div>
        <div className="flex-1">
          <div className="rounded-xl rounded-tl-sm border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
              <Sparkles className="size-3" /> AI Support
            </p>
            <p className="whitespace-pre-wrap text-sm text-emerald-900">{message.body}</p>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{formatDate(message.createdAt)}</p>
        </div>
      </div>
    );
  }

  if (isClient) {
    return (
      <div className="flex justify-end gap-3">
        <div className="max-w-[80%]">
          <div className="rounded-xl rounded-tr-sm bg-primary px-4 py-3 text-primary-foreground">
            <p className="whitespace-pre-wrap text-sm">{message.body}</p>
          </div>
          <p className="mt-1 text-right text-[11px] text-muted-foreground">{message.authorName} · {formatDate(message.createdAt)}</p>
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
          {message.aiPolished && (
            <p className="mb-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Sparkles className="size-3" /> AI polished
            </p>
          )}
          <p className="whitespace-pre-wrap text-sm">{message.body}</p>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">{message.authorName} · {formatDate(message.createdAt)}</p>
      </div>
    </div>
  );
}

// -----------------------------------------------------------
// MAIN PAGE
// -----------------------------------------------------------
export default function TicketDetailPage() {
  const params = useParams();
  const ticketId = params.id as string;

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [polishInfo, setPolishInfo] = useState<string | null>(null);
  const [originalDraft, setOriginalDraft] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchTicket = useCallback(async () => {
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}`);
      const data = await res.json();
      setTicket(data.ticket);
      setMessages(data.messages ?? []);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { fetchTicket(); }, [fetchTicket]);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendReply = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await fetch(`/api/support/tickets/${ticketId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: reply.trim(),
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
      const res = await fetch(`/api/support/tickets/${ticketId}/polish`, {
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

  const updateStatus = async (status: string) => {
    await fetch(`/api/support/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    fetchTicket();
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
        <p className="text-muted-foreground">Ticket not found</p>
        <Link href="/dashboard/support" className="text-sm text-primary hover:underline">
          Back to support
        </Link>
      </div>
    );
  }

  const isClosed = ['resolved', 'closed'].includes(ticket.status);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/support" className="rounded-lg p-1.5 hover:bg-muted">
            <ArrowLeft className="size-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <p className="truncate text-base font-semibold">{ticket.subject}</p>
            <p className="text-xs text-muted-foreground">
              #{ticketId.slice(0, 8).toUpperCase()} · {ticket.submitterName} · opened {formatDate(ticket.createdAt)}
            </p>
          </div>
          {/* Status actions */}
          <div className="flex items-center gap-2">
            {!isClosed && ticket.status !== 'resolved' && (
              <button
                onClick={() => updateStatus('resolved')}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted"
              >
                <CheckCircle2 className="size-4 text-emerald-600" />
                Mark resolved
              </button>
            )}
            {ticket.status === 'resolved' && (
              <button
                onClick={() => updateStatus('closed')}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted"
              >
                <X className="size-4" />
                Close ticket
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Message thread */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {messages.map((m) => <MessageBubble key={m.id} message={m as Message} />)}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply composer */}
      {!isClosed ? (
        <div className="border-t bg-background p-4">
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
                className="ml-auto hover:opacity-70"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Write a reply…"
            rows={3}
            className="mb-2 w-full resize-none rounded-xl border bg-muted/30 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendReply();
            }}
          />
          <div className="flex items-center justify-between">
            <button
              onClick={polishReply}
              disabled={polishing || !reply.trim()}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-40"
            >
              {polishing ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              AI Polish
            </button>
            <button
              onClick={sendReply}
              disabled={sending || !reply.trim()}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Send reply
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t bg-muted/20 p-4 text-center text-sm text-muted-foreground">
          This ticket is {ticket.status}. Reopen by replying — or{' '}
          <button onClick={() => updateStatus('open')} className="text-primary hover:underline">
            reopen now
          </button>.
        </div>
      )}
    </div>
  );
}