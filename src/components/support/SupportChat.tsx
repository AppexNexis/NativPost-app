'use client';

/**
 * SupportChat — the assistant inside the floating support widget.
 *
 * Two modes over one endpoint: Support answers product questions, Prompt
 * writes AI Studio prompts grounded in the live model catalogue. One transport,
 * one fallback chain, one place to change providers.
 *
 * This is the ONLY home for the assistant. An inline panel on the AI Studio
 * page was tried and removed: it cluttered that page and was unreachable from
 * everywhere else, while the instinct is to ask the floating widget.
 *
 * Support mode's system prompt tells the model to admit uncertainty and point
 * at a ticket rather than guess — a confident wrong answer about billing or
 * publishing is worse than no answer.
 *
 * `onOpenTicket` keeps the human path one tap away at all times.
 */

import { Loader2, Send } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { FormattedMessage } from './FormattedMessage';

type Suggestion = {
  prompt: string;
  modelId: string;
  aspect: string;
  credits: number;
};

type Turn = {
  role: 'user' | 'assistant';
  content: string;
  suggestion?: Suggestion | null;
};

type Mode = 'support' | 'prompt';

export function SupportChat({ onOpenTicket }: { onOpenTicket: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Both modes live here, in the one surface that is on every page. Prompt
  // mode offers copy rather than filling a composer: the widget floats over
  // whatever page you are on, so there is no form to fill.
  const [mode, setMode] = useState<Mode>('support');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
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
        body: JSON.stringify({
          mode,
          // Only role/content — the suggestion is client-side presentation.
          messages: next.map(t => ({ role: t.role, content: t.content })),
        }),
      });
      const data = await res.json() as {
        message?: string;
        suggestion?: Suggestion | null;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || 'The assistant is unavailable right now.');
        return;
      }
      setTurns(prev => [
        ...prev,
        { role: 'assistant', content: data.message || '', suggestion: data.suggestion ?? null },
      ]);
    } catch {
      setError('Could not reach the assistant. Please try again.');
    } finally {
      setBusy(false);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      });
    }
  }, [input, busy, turns, mode]);

  return (
    <>
      {/* Mode switch. Support answers product questions; Prompt writes AI
          Studio prompts grounded in the real model catalogue. Switching
          clears the transcript — the two have different system prompts and
          mixing them mid-conversation confuses the model. */}
      <div className="flex gap-1 border-b p-2">
        {([
          { v: 'support' as const, label: 'Support' },
          { v: 'prompt' as const, label: 'Write a prompt' },
        ]).map(opt => (
          <button
            key={opt.v}
            onClick={() => {
              if (mode !== opt.v) {
                setMode(opt.v);
                setTurns([]);
                setError(null);
              }
            }}
            className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
              mode === opt.v
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {turns.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {mode === 'support'
              ? 'Ask me anything about NativPost — campaigns, publishing, Blitz, billing. If I\'m not sure, I\'ll point you at the team.'
              : 'Describe what you want to create and I\'ll write the AI Studio prompt, with the right model and aspect ratio.'}
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

              {turn.suggestion && (
                <div className="mt-2 rounded-md border bg-background p-2">
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                    {turn.suggestion.prompt}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
                      {turn.suggestion.modelId}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
                      {turn.suggestion.aspect}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
                      {turn.suggestion.credits}
                      {' '}
                      credits
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(turn.suggestion!.prompt);
                      setCopiedIdx(i);
                      setTimeout(() => setCopiedIdx(null), 2000);
                    }}
                    className="mt-2 w-full rounded-md bg-primary px-2 py-1.5 text-[11px] font-medium text-primary-foreground"
                  >
                    {copiedIdx === i ? 'Copied' : 'Copy prompt'}
                  </button>
                </div>
              )}
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
          placeholder={mode === 'support' ? 'Ask a question…' : 'Describe what you want to create…'}
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
