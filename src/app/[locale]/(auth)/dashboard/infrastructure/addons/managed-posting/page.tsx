'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Loader2, Send } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/features/dashboard/ErrorBanner';
import { PageHeader } from '@/features/dashboard/PageHeader';
import { GridPageSkeleton } from '@/features/dashboard/PageSkeletons';

type PostingStatus =
  | { active: false }
  | { active: true; tierId: string | null; quota: number; used: number; remaining: number };

type ManagedAccount = { id: string; platform: string; displayName: string | null; lifecycleState: string };

export default function ManagedPostingPage() {
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState('');
  const [topic, setTopic] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const statusQuery = useQuery({
    queryKey: ['managed-posting-status'],
    queryFn: async (): Promise<PostingStatus> => {
      const res = await fetch('/api/msi/addons/managed-posting');
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}.`);
      }
      return res.json();
    },
  });

  const accountsQuery = useQuery({
    queryKey: ['msi-accounts'],
    queryFn: async (): Promise<ManagedAccount[]> => {
      const res = await fetch('/api/msi/accounts');
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}.`);
      }
      const body = await res.json();
      return body.accounts ?? [];
    },
  });

  const status = statusQuery.data;
  const accounts = (accountsQuery.data ?? []).filter(a => a.lifecycleState === 'live');

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    setSuccess(false);
    try {
      const res = await fetch('/api/msi/addons/managed-posting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managedAccountId: accountId, topic, notes }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Could not submit the request.');
      }
      setSuccess(true);
      setTopic('');
      setNotes('');
      await queryClient.invalidateQueries({ queryKey: ['managed-posting-status'] });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = !!accountId && topic.trim().length > 0 && !submitting
    && status?.active === true && status.remaining > 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Link
        href="/dashboard/infrastructure/addons"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Add-ons
      </Link>

      <PageHeader
        title="Managed Posting"
        description="Request a post and our team drafts, reviews, and publishes it to your managed account for you."
      />

      {statusQuery.isLoading ? (
        <GridPageSkeleton cards={2} />
      ) : statusQuery.error ? (
        <ErrorBanner title="Couldn't load Managed Posting" detail={(statusQuery.error as Error).message} />
      ) : !status?.active ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm font-medium text-foreground">Managed Posting isn't active</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Activate it and choose a tier in Add-ons, then come back here to request posts.
          </p>
          <Button asChild size="sm" className="mt-4">
            <Link href="/dashboard/infrastructure/addons">Go to Add-ons</Link>
          </Button>
        </div>
      ) : (
        <>
          {/* Quota bar */}
          <div className="mb-6 rounded-xl border border-border bg-card p-5">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Posts this month</span>
              <span className="font-semibold tabular-nums">
                {status.used} / {status.quota}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${status.quota > 0 ? Math.min(100, (status.used / status.quota) * 100) : 0}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {status.remaining > 0
                ? `${status.remaining} post${status.remaining === 1 ? '' : 's'} remaining. Resets on the 1st.`
                : 'You\'ve used all your posts this month. Resets on the 1st, or upgrade your tier in Add-ons.'}
            </p>
          </div>

          {success && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
              <CheckCircle2 className="size-4 shrink-0" />
              Request submitted. Our team will draft it and it will appear in your calendar for review.
            </div>
          )}
          {submitError && (
            <div className="mb-4">
              <ErrorBanner title="Couldn't submit" detail={submitError} />
            </div>
          )}

          {/* Request form */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="space-y-4">
              <div>
                <label htmlFor="mp-account" className="mb-1.5 block text-sm font-medium">Managed account</label>
                <select
                  id="mp-account"
                  value={accountId}
                  onChange={e => setAccountId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select an account…</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.displayName || 'Managed account'} · {a.platform}
                    </option>
                  ))}
                </select>
                {accounts.length === 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">No live managed accounts yet.</p>
                )}
              </div>

              <div>
                <label htmlFor="mp-topic" className="mb-1.5 block text-sm font-medium">Topic / brief</label>
                <input
                  id="mp-topic"
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  maxLength={200}
                  placeholder="e.g. Announce our summer sale, playful tone"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="mp-notes" className="mb-1.5 block text-sm font-medium">
                  Notes <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  id="mp-notes"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Anything we should include — links, hashtags, product details…"
                  className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>

              <Button className="w-full gap-2" disabled={!canSubmit} onClick={submit}>
                {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Request post
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
