'use client';

import { Bug, CheckCircle2, Heart, Lightbulb, Loader2, MessageSquare } from 'lucide-react';
import { useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/utils/Helpers';

/**
 * In-app feedback — one dialog, three fields max, zero friction.
 *
 * Rides the existing support-ticket pipeline (`/api/support/tickets`) so
 * feedback lands where the team already triages, tagged by type in the
 * subject. No new backend surface.
 */

const FEEDBACK_TYPES = [
  { id: 'idea', label: 'Idea', icon: Lightbulb, hint: 'A feature or improvement you wish existed' },
  { id: 'bug', label: 'Bug', icon: Bug, hint: 'Something broken or behaving unexpectedly' },
  { id: 'praise', label: 'Praise', icon: Heart, hint: 'Something you love — we read these too' },
  { id: 'other', label: 'Other', icon: MessageSquare, hint: 'Anything else on your mind' },
] as const;

type FeedbackType = typeof FEEDBACK_TYPES[number]['id'];

export function FeedbackDialog({
  open,
  onOpenChange,
  currentPath,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPath?: string;
}) {
  const [type, setType] = useState<FeedbackType>('idea');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setType('idea');
    setMessage('');
    setSent(false);
    setError(null);
  };

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      // Let the close animation finish before wiping state.
      setTimeout(reset, 200);
    }
  };

  const submit = async () => {
    if (!message.trim() || submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const typeLabel = FEEDBACK_TYPES.find(t => t.id === type)?.label ?? 'Feedback';
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: `[Feedback · ${typeLabel}] ${message.trim().slice(0, 60)}`,
          body: `${message.trim()}\n\n—\nType: ${typeLabel}${currentPath ? `\nPage: ${currentPath}` : ''}\nSource: in-app feedback`,
        }),
      });
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      setSent(true);
    } catch {
      setError('Could not send feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        {sent
          ? (
              <div className="flex flex-col items-center py-6 text-center">
                <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-emerald-500/10">
                  <CheckCircle2 className="size-6 text-emerald-500" />
                </div>
                <h2 className="text-heading">Thank you</h2>
                <p className="mt-1 max-w-xs text-body text-muted-foreground">
                  Your feedback went straight to the team. It genuinely shapes what we build next.
                </p>
                <button
                  type="button"
                  onClick={() => handleOpenChange(false)}
                  className="mt-5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Done
                </button>
              </div>
            )
          : (
              <>
                <DialogHeader>
                  <DialogTitle>Share feedback</DialogTitle>
                  <DialogDescription>
                    Tell us what to build, fix, or keep. Goes straight to the team.
                  </DialogDescription>
                </DialogHeader>

                {/* Type selector */}
                <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Feedback type">
                  {FEEDBACK_TYPES.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={type === id}
                      onClick={() => setType(id)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-meta font-medium transition-colors duration-instant focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        type === id
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'text-muted-foreground hover:bg-muted',
                      )}
                    >
                      <Icon className="size-4" />
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-meta text-muted-foreground">
                  {FEEDBACK_TYPES.find(t => t.id === type)?.hint}
                </p>

                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      void submit();
                    }
                  }}
                  rows={4}
                  placeholder={
                    type === 'bug'
                      ? 'What happened, and what did you expect instead?'
                      : 'What should we know?'
                  }
                  aria-label="Feedback message"
                  className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />

                {error && (
                  <p className="text-meta text-destructive">{error}</p>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-micro text-muted-foreground">⌘↵ to send</span>
                  <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={!message.trim() || submitting}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                  >
                    {submitting && <Loader2 className="size-3.5 animate-spin" />}
                    Send feedback
                  </button>
                </div>
              </>
            )}
      </DialogContent>
    </Dialog>
  );
}
