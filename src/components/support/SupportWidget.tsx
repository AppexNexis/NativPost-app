'use client';

/**
 * src/components/support/SupportWidget.tsx
 *
 * Floating support widget for the dashboard.
 * Receives currentPath as a prop from DashboardClientLayout
 * to avoid calling usePathname inside this component — which
 * was causing a next-intl locale context crash.
 */

import {
  ChevronDown,
  Loader2,
  MessageCircle,
  Send,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type Step = 'closed' | 'home' | 'form' | 'submitting';

export default function SupportWidget({ currentPath }: { currentPath: string }) {
  const router     = useRouter();
  const [step,    setStep]    = useState<Step>('closed');
  const [subject, setSubject] = useState('');
  const [body,    setBody]    = useState('');
  const [error,   setError]   = useState('');
  const subjectRef = useRef<HTMLInputElement>(null);

  // Hide on support pages — the full UI is already there
  if (currentPath.includes('/support')) return null;

  const open  = () => setStep('home');
  const close = () => {
    setStep('closed');
    setSubject('');
    setBody('');
    setError('');
  };

  useEffect(() => {
    if (step === 'form') {
      setTimeout(() => subjectRef.current?.focus(), 50);
    }
  }, [step]);

  const submit = async () => {
    if (!subject.trim() || !body.trim()) {
      setError('Please fill in both fields.');
      return;
    }
    setStep('submitting');
    setError('');
    try {
      const res  = await fetch('/api/support/tickets', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ subject: subject.trim(), body: body.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error('Failed');
      close();
      router.push(`/dashboard/support/${data.ticket.id}`);
    } catch {
      setError('Something went wrong. Please try again.');
      setStep('form');
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Panel */}
      {step !== 'closed' && (
        <div className="w-80 overflow-hidden rounded-2xl border bg-background shadow-2xl shadow-black/10">
          {/* Header */}
          <div className="flex items-center justify-between bg-primary px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex size-7 items-center justify-center rounded-full bg-white/20">
                <MessageCircle className="size-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">NativPost Support</p>
                <p className="text-[11px] text-white/70">We typically reply in 4 hours</p>
              </div>
            </div>
            <button
              onClick={close}
              className="rounded-lg p-1 hover:bg-white/10 transition-colors"
            >
              <ChevronDown className="size-4 text-white" />
            </button>
          </div>

          {/* Home screen */}
          {step === 'home' && (
            <div className="p-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Need help with your NativPost account? Our team and AI are here for you.
              </p>
              <button
                onClick={() => setStep('form')}
                className="w-full rounded-xl border bg-muted/40 px-4 py-3.5 text-left transition-colors hover:bg-muted/80"
              >
                <p className="text-sm font-medium">Open a support ticket</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Describe your issue and get help from our AI or team
                </p>
              </button>
              <a
                href="/dashboard/support"
                onClick={close}
                className="block w-full rounded-xl border px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
              >
                <p className="text-sm font-medium">View my tickets</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Check status and continue existing conversations
                </p>
              </a>
            </div>
          )}

          {/* Form */}
          {(step === 'form' || step === 'submitting') && (
            <div className="p-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Subject</label>
                <input
                  ref={subjectRef}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. My LinkedIn posts aren't publishing"
                  disabled={step === 'submitting'}
                  className="w-full rounded-lg border bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Describe the issue</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="What happened? What did you expect? Any relevant details."
                  rows={4}
                  disabled={step === 'submitting'}
                  className="w-full resize-none rounded-lg border bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
                  }}
                />
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => setStep('home')}
                  disabled={step === 'submitting'}
                  className="flex-1 rounded-lg border py-2 text-sm hover:bg-muted disabled:opacity-40"
                >
                  Back
                </button>
                <button
                  onClick={submit}
                  disabled={step === 'submitting' || !subject.trim() || !body.trim()}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {step === 'submitting'
                    ? <Loader2 className="size-4 animate-spin" />
                    : <><Send className="size-3.5" />Send</>}
                </button>
              </div>
              <p className="text-center text-[10px] text-muted-foreground">
                Our AI responds instantly. A human is always available.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={step === 'closed' ? open : close}
        className={`relative flex size-14 items-center justify-center rounded-full shadow-lg transition-all hover:scale-105 active:scale-95 ${
          step !== 'closed'
            ? 'bg-muted text-foreground shadow-black/10'
            : 'bg-primary text-primary-foreground shadow-primary/30'
        }`}
        aria-label="Support"
      >
        {step === 'closed' ? (
          <>
            <MessageCircle className="size-6" />
            <span className="absolute inset-0 rounded-full animate-ping bg-primary opacity-20" />
          </>
        ) : (
          <X className="size-5" />
        )}
      </button>
    </div>
  );
}