'use client';

/**
 * SupportChat — the assistant inside the floating support widget.
 *
 * Shares the copilot endpoint (`mode: 'support'`) with AI Studio's prompt
 * helper, so there is one transport, one fallback chain and one place to
 * change providers. The system prompt for this mode tells the model to admit
 * uncertainty and point at a ticket rather than guess — a confident wrong
 * answer about billing or publishing is worse than no answer.
 *
 * `onOpenTicket` keeps the human path one tap away at all times.
 */

import { Loader2, Send } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { FormattedMessage } from './FormattedMessage';

type Turn = { role: 'user' | 'assistant'; content: string };

export function SupportChat({ onOpenTicket }: { onOpenTicket: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) {
      return;
    }
    const next: Turn[] = [...turns, { role: 'user', content: text }];
    setTurns(next);
    setInput('');
    setBusy(true);
    setError(null);

    try {
      const res = await fetch('/api/ai-studio/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'support', messages: next }),
      });
      const data = await res.json() as { message?: string; error?: string };
      if (!res.ok) {
        setError(data.error || 'The assistant is unavailable right now.');
        return;
      }
      setTurns(prev => [...prev, { role: 'assistant', content: data.message || '' }]);
    } catch {
      setError('Could not reach the assistant. Please try again.');
    } finally {
      setBusy(false);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      });
    }
  }, [input, busy, turns]);

  return (
    <>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {turns.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Ask me anything about NativPost — campaigns, publishing, Blitz, billing.
            If I'm not sure, I'll point you at the team.
          </p>
        )}

        {turns.map((turn, i) => (
          <div
            // Append-only transcript; position is the identity.
            key={`${i}-${turn.role}`}
            className={turn.role === 'user' ? 'flex justify-end' : ''}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                turn.role === 'user'
                  ? 'whitespace-pre-wrap bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground'
              }`}
            >
              {/* User text is shown verbatim; only assistant replies carry the
                  light markdown that needs formatting. */}
              {turn.role === 'user'
                ? turn.content
                : <FormattedMessage content={turn.content} />}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Thinking…
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        {/* Always reachable, not just on failure — some questions need a human
            regardless of how good the answer was. */}
        {turns.length > 0 && (
          <button
            onClick={onOpenTicket}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Still need help? Open a ticket
          </button>
        )}
      </div>

      <div className="flex items-end gap-2 border-t p-3">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder="Ask a question…"
          className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
        <button
          onClick={send}
          disabled={busy || !input.trim()}
          className="rounded-lg bg-primary px-3 py-2 text-primary-foreground transition-opacity disabled:opacity-50"
        >
          <Send className="size-3.5" />
        </button>
      </div>
    </>
  );
}
