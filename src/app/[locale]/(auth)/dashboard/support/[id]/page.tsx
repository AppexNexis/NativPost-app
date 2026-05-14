'use client';

/**
 * src/app/[locale]/(auth)/dashboard/support/[id]/page.tsx
 *
 * Real-time streaming ticket conversation.
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
  ChevronDown,
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
  aiCategory: string | null;
  aiPriority: string | null;
  status: string;
  submitterName: string;
  submitterEmail: string;
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
  streaming?: boolean;
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
      <div className="flex gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
          <UserCircle2 className="size-4 text-amber-600" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="rounded-xl rounded-tl-sm border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-600">
              Internal note
            </p>
            <p className="whitespace-pre-wrap text-sm text-amber-900">{message.body}</p>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {message.authorName} · {formatDate(message.createdAt)}
          </p>
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
        <div className="min-w-0 flex-1">
          <div className="rounded-xl rounded-tl-sm border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
              <Sparkles className="size-3 shrink-0" />
              AI Support
              {message.streaming && (
                <span className="ml-1 inline-flex gap-0.5">
                  <span className="size-1 animate-bounce rounded-full bg-emerald-500 [animation-delay:0ms]" />
                  <span className="size-1 animate-bounce rounded-full bg-emerald-500 [animation-delay:150ms]" />
                  <span className="size-1 animate-bounce rounded-full bg-emerald-500 [animation-delay:300ms]" />
                </span>
              )}
            </p>
            <p className="whitespace-pre-wrap text-sm text-emerald-900">
              {message.body || (message.streaming ? '\u00A0' : '')}
            </p>
          </div>
          {!message.streaming && (
            <p className="mt-1 text-[11px] text-muted-foreground">{formatDate(message.createdAt)}</p>
          )}
        </div>
      </div>
    );
  }

  if (isClient) {
    return (
      <div className="flex justify-end gap-3">
        <div className="max-w-[85%] sm:max-w-[75%]">
          <div className="rounded-xl rounded-tr-sm bg-foreground px-4 py-3 text-background">
            <p className="whitespace-pre-wrap text-sm">{message.body}</p>
          </div>
          <p className="mt-1 text-right text-[11px] text-muted-foreground">
            {message.authorName} · {formatDate(message.createdAt)}
          </p>
        </div>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <User className="size-4 text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Agent message
  return (
    <div className="flex gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-100">
        <UserCircle2 className="size-4 text-zinc-600" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="rounded-xl rounded-tl-sm border bg-card px-4 py-3">
          {message.aiPolished && (
            <p className="mb-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Sparkles className="size-3" />
              AI polished
            </p>
          )}
          <p className="whitespace-pre-wrap text-sm">{message.body}</p>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {message.authorName} · {formatDate(message.createdAt)}
        </p>
      </div>
    </div>
  );
}

const STREAMING_MSG_ID = '__streaming__';

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
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const statusMenuRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchTicket = useCallback(async () => {
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}`);
      const data = await res.json();
      setTicket(data.ticket ?? null);
      setMessages(data.messages ?? []);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    fetchTicket();
  }, [fetchTicket]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Close status menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
        setShowStatusMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // -----------------------------------------------------------
  // SEND REPLY + OPEN STREAM
  // -----------------------------------------------------------
  const sendReply = async () => {
    if (!reply.trim() || sending) return;

    const text = reply.trim();
    setSending(true);
    setReply('');
    setPolishInfo(null);
    setOriginalDraft(null);

    const optimisticMsg: Message = {
      id: `opt-${Date.now()}`,
      authorType: 'client',
      authorName: ticket?.submitterName ?? 'You',
      body: text,
      isInternal: false,
      aiPolished: false,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    scrollToBottom();

    try {
      await fetch(`/api/support/tickets/${ticketId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      });

      const streamingMsg: Message = {
        id: STREAMING_MSG_ID,
        authorType: 'ai',
        authorName: 'NativPost Support',
        body: '',
        isInternal: false,
        aiPolished: false,
        createdAt: new Date().toISOString(),
        streaming: true,
      };
      setMessages((prev) => [...prev, streamingMsg]);
      scrollToBottom();

      const abort = new AbortController();
      abortRef.current = abort;

      const streamRes = await fetch(`/api/support/tickets/${ticketId}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abort.signal,
      });

      if (!streamRes.body) throw new Error('No stream body');

      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
            continue;
          }

          if (line.startsWith('data: ')) {
            const rawData = line.slice(6);

            if (currentEvent === 'token') {
              try {
                const token = JSON.parse(rawData);
                if (typeof token === 'string') {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === STREAMING_MSG_ID ? { ...m, body: m.body + token } : m,
                    ),
                  );
                  scrollToBottom();
                }
              } catch {
                // skip malformed token
              }
            } else if (currentEvent === 'done') {
              try {
                const saved = JSON.parse(rawData) as { messageId?: string; createdAt?: string };
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === STREAMING_MSG_ID
                      ? {
                          ...m,
                          id: saved.messageId ?? `ai-${Date.now()}`,
                          streaming: false,
                          createdAt: saved.createdAt ?? new Date().toISOString(),
                        }
                      : m,
                  ),
                );
              } catch {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === STREAMING_MSG_ID
                      ? { ...m, id: `ai-${Date.now()}`, streaming: false }
                      : m,
                  ),
                );
              }
              currentEvent = '';
            } else if (currentEvent === 'error') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === STREAMING_MSG_ID
                    ? {
                        ...m,
                        body: 'Something went wrong. Our team has been notified.',
                        streaming: false,
                      }
                    : m,
                ),
              );
              currentEvent = '';
            }
          }

          if (line === '') {
            currentEvent = '';
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setMessages((prev) => prev.filter((m) => m.id !== STREAMING_MSG_ID));
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  };

  // -----------------------------------------------------------
  // AI POLISH
  // -----------------------------------------------------------
  const polishReply = async () => {
    if (!reply.trim() || polishing) return;
    setPolishing(true);
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}/polish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: reply }),
      });
      const data = await res.json();
      setOriginalDraft(reply);
      setReply(data.polishedReply ?? reply);
      setPolishInfo(data.changesMade ?? null);
    } finally {
      setPolishing(false);
    }
  };

  const updateStatus = async (status: string) => {
    setShowStatusMenu(false);
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
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-muted-foreground">Ticket not found.</p>
        <Link
          href="/dashboard/support"
          className="text-sm font-medium text-foreground underline underline-offset-2 hover:opacity-70"
        >
          Back to support
        </Link>
      </div>
    );
  }

  const isClosed = ['resolved', 'closed'].includes(ticket.status);
  const isStreaming = messages.some((m) => m.id === STREAMING_MSG_ID && m.streaming);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b bg-background px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-start gap-3">
          <Link
            href="/dashboard/support"
            className="mt-0.5 shrink-0 rounded-lg p-1.5 hover:bg-muted"
          >
            <ArrowLeft className="size-4" />
          </Link>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold sm:text-base">{ticket.subject}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              #{ticketId.slice(0, 8).toUpperCase()} · {ticket.submitterName} · opened {formatDate(ticket.createdAt)}
            </p>
          </div>

          {/* Status actions */}
          <div className="relative shrink-0" ref={statusMenuRef}>
            {!isClosed ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateStatus('resolved')}
                  className="hidden items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium hover:bg-muted sm:flex"
                >
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  Mark resolved
                </button>
                {/* Mobile dropdown trigger */}
                <button
                  type="button"
                  onClick={() => setShowStatusMenu((v) => !v)}
                  className="flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-sm hover:bg-muted sm:hidden"
                >
                  Actions
                  <ChevronDown className="size-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => updateStatus('open')}
                className="flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium hover:bg-muted"
              >
                <X className="size-4" />
                <span className="hidden sm:inline">Reopen ticket</span>
                <span className="sm:hidden">Reopen</span>
              </button>
            )}

            {/* Mobile dropdown */}
            {showStatusMenu && (
              <div className="absolute right-0 top-full z-20 mt-1 min-w-[160px] overflow-hidden rounded-xl border bg-background shadow-lg">
                <button
                  type="button"
                  onClick={() => updateStatus('resolved')}
                  className="flex w-full items-center gap-2 px-4 py-3 text-sm hover:bg-muted"
                >
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  Mark resolved
                </button>
                <button
                  type="button"
                  onClick={() => updateStatus('closed')}
                  className="flex w-full items-center gap-2 px-4 py-3 text-sm hover:bg-muted"
                >
                  <X className="size-4" />
                  Close ticket
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Message thread */}
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-2xl space-y-5">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Reply composer */}
      {!isClosed ? (
        <div className="border-t bg-background px-4 py-3 sm:px-6 sm:py-4">
          <div className="mx-auto max-w-2xl space-y-2">
            {polishInfo && (
              <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                <Sparkles className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                <span className="flex-1 text-xs text-emerald-700">{polishInfo}</span>
                <button
                  type="button"
                  onClick={() => {
                    if (originalDraft) setReply(originalDraft);
                    setOriginalDraft(null);
                    setPolishInfo(null);
                  }}
                  className="shrink-0 hover:opacity-70"
                >
                  <X className="size-3.5 text-emerald-600" />
                </button>
              </div>
            )}

            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Write a reply..."
              rows={3}
              disabled={sending || isStreaming}
              className="w-full resize-none rounded-xl border bg-muted/30 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 disabled:opacity-50"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !isStreaming) sendReply();
              }}
            />

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={polishReply}
                disabled={polishing || !reply.trim() || sending || isStreaming}
                className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-40"
              >
                {polishing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                <span className="hidden sm:inline">AI Polish</span>
                <span className="sm:hidden">Polish</span>
              </button>

              <div className="flex items-center gap-2">
                <p className="hidden text-[11px] text-muted-foreground sm:block">
                  {isStreaming ? 'AI is responding' : 'Cmd+Enter to send'}
                </p>
                <button
                  type="button"
                  onClick={sendReply}
                  disabled={sending || !reply.trim() || isStreaming}
                  className="flex items-center gap-2 rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50"
                >
                  {sending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  {isStreaming ? 'Responding' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="border-t bg-muted/20 px-4 py-4 text-center text-sm text-muted-foreground sm:px-6">
          This ticket is {ticket.status}.{' '}
          <button
            type="button"
            onClick={() => updateStatus('open')}
            className="font-medium text-foreground underline underline-offset-2 hover:opacity-70"
          >
            Reopen it
          </button>
        </div>
      )}
    </div>
  );
}