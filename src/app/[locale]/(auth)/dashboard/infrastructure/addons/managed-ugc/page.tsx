'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Clapperboard, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/features/dashboard/ErrorBanner';
import { PageHeader } from '@/features/dashboard/PageHeader';
import { GridPageSkeleton } from '@/features/dashboard/PageSkeletons';

type UgcStatus = { active: boolean };
type ManagedAccount = { id: string; platform: string; displayName: string | null; lifecycleState: string };

export default function ManagedUgcPage() {
  const [accountId, setAccountId] = useState('');
  const [topic, setTopic] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const statusQuery = useQuery({
    queryKey: ['managed-ugc-status'],
    queryFn: async (): Promise<UgcStatus> => {
      const res = await fetch('/api/msi/addons/managed-ugc');
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
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch('/api/msi/addons/managed-ugc', {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = !!accountId && topic.trim().length > 0 && !submitting && status?.active === true;

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
        title="Managed UGC"
        description="Send us a product and a brief — our team produces a short-form video (TikOk, Reel, or Short) and delivers it to your library. $25 per delivered video."
      />

      {statusQuery.isLoading ? (
        <GridPageSkeleton cards={1} />
      ) : statusQuery.error ? (
        <ErrorBanner title="Couldn't load Managed UGC" detail={(statusQuery.error as Error).message} />
      ) : !status?.active ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm font-medium text-foreground">Managed UGC isn't active</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Activate it in Add-ons, then request videos here. You're billed $25 per delivered video.
          </p>
          <Button asChild size="sm" className="mt-4">
            <Link href="/dashboard/infrastructure/addons">Go to Add-ons</Link>
          </Button>
        </div>
      ) : (
        <>
          {success && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
              <CheckCircle2 className="size-4 shrink-0" />
              Request submitted. Our team will produce it; the $25 fee is billed when the video is delivered.
            </div>
          )}
          {error && (
            <div className="mb-4">
              <ErrorBanner title="Couldn't submit" detail={error} />
            </div>
          )}

          <div className="rounded-xl border border-border bg-card p-5">
            <div className="space-y-4">
              <div>
                <label htmlFor="ugc-account" className="mb-1.5 block text-sm font-medium">For account</label>
                <select
                  id="ugc-account"
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
                <label htmlFor="ugc-topic" className="mb-1.5 block text-sm font-medium">What should the video show?</label>
                <input
                  id="ugc-topic"
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  maxLength={200}
                  placeholder="e.g. Unboxing our new product, upbeat and fast-paced"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="ugc-notes" className="mb-1.5 block text-sm font-medium">
                  Notes <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  id="ugc-notes"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Product link, key talking points, tone, real vs AI creator…"
                  className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>

              <Button className="w-full gap-2" disabled={!canSubmit} onClick={submit}>
                {submitting ? <Loader2 className="size-4 animate-spin" /> : <Clapperboard className="size-4" />}
                Request video · $25
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
