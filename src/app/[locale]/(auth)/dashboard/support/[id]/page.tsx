'use client';

/**
 * src/app/[locale]/(auth)/dashboard/support/[id]/page.tsx
 *
 * Real-time streaming ticket conversation.
 *
 * When a client sends a reply:
 * 1. Message is saved via POST /reply
 * 2. Client message appears instantly in the thread
 * 3. An AI "typing" indicator appears immediately
 * 4. POST /stream opens an SSE connection to Claude
 * 5. Claude's response streams token by token into the bubble
 * 6. When done, the full message is persisted in DB
 *
 * No polling. No refresh. Instant, like Claude.ai.
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
  streaming?: boolean; // true while Claude is still typing
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
              <Sparkles className="size-3" />
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
        <div className="max-w-[80%]">
          <div className="rounded-xl rounded-tr-sm bg-primary px-4 py-3 text-primary-foreground">
            <p className="whitespace-pre-wrap text-sm">{message.body}</p>
          </div>
          <p className="mt-1 text-right text-[11px] text-muted-foreground">
            {message.authorName} · {formatDate(message.createdAt)}
          </p>
        </div>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <User className="size-4 text-primary" />
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
      <div className="flex-1">
        <div className="rounded-xl rounded-tl-sm border bg-card px-4 py-3">
          {message.aiPolished && (
            <p className="mb-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Sparkles className="size-3" /> AI polished
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

// -----------------------------------------------------------
// STREAMING_ID constant — placeholder ID while Claude types
// -----------------------------------------------------------
const STREAMING_MSG_ID = '__streaming__';

// -----------------------------------------------------------
// MAIN PAGE
// -----------------------------------------------------------
export default function TicketDetailPage() {
  const params    = useParams();
  const ticketId  = params.id as string;

  const [ticket,   setTicket]   = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [reply,    setReply]    = useState('');
  const [sending,  setSending]  = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [polishInfo, setPolishInfo] = useState<string | null>(null);
  const [originalDraft, setOriginalDraft] = useState<string | null>(null);

  const bottomRef    = useRef<HTMLDivElement>(null);
  const abortRef     = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchTicket = useCallback(async () => {
    try {
      const res  = await fetch(`/api/support/tickets/${ticketId}`);
      const data = await res.json();
      setTicket(data.ticket ?? null);
      setMessages(data.messages ?? []);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { fetchTicket(); }, [fetchTicket]);
  useEffect(() => { scrollToBottom(); }, [messages]);

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

    // 1. Optimistically add client message to thread immediately
    const optimisticMsg: Message = {
      id:         `opt-${Date.now()}`,
      authorType: 'client',
      authorName: ticket?.submitterName ?? 'You',
      body:       text,
      isInternal: false,
      aiPolished: false,
      createdAt:  new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    scrollToBottom();

    try {
      // 2. Save message to DB
      await fetch(`/api/support/tickets/${ticketId}/reply`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ body: text }),
      });

      // 3. Add streaming placeholder bubble immediately
      const streamingMsg: Message = {
        id:         STREAMING_MSG_ID,
        authorType: 'ai',
        authorName: 'NativPost Support',
        body:       '',
        isInternal: false,
        aiPolished: false,
        createdAt:  new Date().toISOString(),
        streaming:  true,
      };
      setMessages((prev) => [...prev, streamingMsg]);
      scrollToBottom();

      // 4. Open SSE stream to Claude
      const abort   = new AbortController();
      abortRef.current = abort;

      const streamRes = await fetch(`/api/support/tickets/${ticketId}/stream`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        signal:  abort.signal,
      });

      if (!streamRes.body) throw new Error('No stream body');

      const reader  = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer       = '';
      let currentEvent = '';

      // 5. Read tokens as they arrive and update the streaming bubble
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          // Track which event type the next data line belongs to
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
                      m.id === STREAMING_MSG_ID
                        ? { ...m, body: m.body + token }
                        : m,
                    ),
                  );
                  scrollToBottom();
                }
              } catch {
                // Malformed token — skip
              }
            } else if (currentEvent === 'done') {
              // Parse the saved message details from the done payload
              try {
                const saved = JSON.parse(rawData) as { messageId?: string; createdAt?: string };
                // Replace the streaming placeholder with the real persisted message.
                // This gives it a stable ID so it cannot be matched again on the next stream.
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === STREAMING_MSG_ID
                      ? {
                          ...m,
                          id:        saved.messageId ?? `ai-${Date.now()}`,
                          streaming: false,
                          createdAt: saved.createdAt ?? new Date().toISOString(),
                        }
                      : m,
                  ),
                );
              } catch {
                // If parse fails, just mark streaming complete with a temporary ID
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
                    ? { ...m, body: 'Something went wrong. Our team has been notified.', streaming: false }
                    : m,
                ),
              );
              currentEvent = '';
            }
          }

          // Blank line = end of SSE message block, reset event type
          if (line === '') {
            currentEvent = '';
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('[stream] error:', err);
      // Remove streaming bubble on unexpected error
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
      const res  = await fetch(`/api/support/tickets/${ticketId}/polish`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ draft: reply }),
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
    await fetch(`/api/support/tickets/${ticketId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status }),
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
  const isStreaming = messages.some((m) => m.id === STREAMING_MSG_ID && m.streaming);

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
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        <div ref={bottomRef} />
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
            placeholder="Write a reply..."
            rows={3}
            disabled={sending || isStreaming}
            className="mb-2 w-full resize-none rounded-xl border bg-muted/30 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !isStreaming) sendReply();
            }}
          />
          <div className="flex items-center justify-between">
            <button
              onClick={polishReply}
              disabled={polishing || !reply.trim() || sending || isStreaming}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-40"
            >
              {polishing
                ? <Loader2 className="size-3.5 animate-spin" />
                : <Sparkles className="size-3.5" />}
              AI Polish
            </button>
            <button
              onClick={sendReply}
              disabled={sending || !reply.trim() || isStreaming}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {sending
                ? <Loader2 className="size-4 animate-spin" />
                : <Send className="size-4" />}
              {isStreaming ? 'AI is responding...' : 'Send reply'}
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t bg-muted/20 p-4 text-center text-sm text-muted-foreground">
          This ticket is {ticket.status}.{' '}
          <button onClick={() => updateStatus('open')} className="text-primary hover:underline">
            Reopen
          </button>
        </div>
      )}
    </div>
  );
}