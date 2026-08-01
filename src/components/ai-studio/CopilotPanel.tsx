'use client';

/**
 * CopilotPanel — in-app prompt assistant for AI Studio.
 *
 * The point of this component is the "Use this prompt" button, not the chat.
 * A conversation that ends in text the user has to copy is ChatGPT with extra
 * steps; one that ends in a filled composer with the right model and aspect
 * already selected is worth staying in the product for.
 *
 * `onApply` receives a suggestion the server has already validated against the
 * live model catalogue, so the model id and aspect are always real.
 */

import { Loader2, Send, Sparkles, Wand2 } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { FormattedMessage } from '@/components/support/FormattedMessage';
import { Button } from '@/components/ui/button';

type Suggestion = {
  prompt: string;
  modelId: string;
  aspect: string;
  credits: number;
};

type ChatTurn = {
  role: 'user' | 'assistant';
  content: string;
  suggestion?: Suggestion | null;
};

type Props = {
  /** Fills the AI Studio composer with a validated suggestion. */
  onApply: (suggestion: Suggestion) => void;
  mode?: 'prompt' | 'support';
};

export function CopilotPanel({ onApply, mode = 'prompt' }: Props) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) {
      return;
    }

    const nextTurns: ChatTurn[] = [...turns, { role: 'user', content: text }];
    setTurns(nextTurns);
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
          messages: nextTurns.map(t => ({ role: t.role, content: t.content })),
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
        {
          role: 'assistant',
          content: data.message || '',
          suggestion: data.suggestion ?? null,
        },
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
    <div className="flex h-full flex-col rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Sparkles className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Prompt assistant</h3>
        {/* Prompt help is metered; support chat is free. */}
        <span className="ml-auto text-[10px] text-muted-foreground">
          {mode === 'prompt' ? '1 credit per reply' : 'Free'}
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {turns.length === 0 && (
          <div className="rounded-lg border border-dashed p-4 text-center">
            <p className="text-sm text-muted-foreground">
              Describe roughly what you want and I'll write the prompt.
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              e.g. "a founder working late in a warm-lit home office, for a reel"
            </p>
          </div>
        )}

        {turns.map((turn, i) => (
          <div
            // Turns are append-only and positional.
            key={`${i}-${turn.role}`}
            className={turn.role === 'user' ? 'flex justify-end' : ''}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                turn.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground'
              }`}
            >
              {/* User text verbatim; assistant replies may carry light
                  markdown that would otherwise show raw asterisks. */}
              {turn.role === 'user'
                ? turn.content
                : <FormattedMessage content={turn.content} />}

              {turn.suggestion && (
                <div className="mt-3 rounded-md border bg-background p-3">
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                    {turn.suggestion.prompt}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
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
                  <Button
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => onApply(turn.suggestion!)}
                  >
                    <Wand2 className="mr-1.5 size-3.5" />
                    Use this prompt
                  </Button>
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
      </div>

      <div className="flex items-end gap-2 border-t p-3">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter newlines — chat convention.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder="Describe what you want to create…"
          className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
        <Button size="sm" onClick={send} disabled={busy || !input.trim()}>
          <Send className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
