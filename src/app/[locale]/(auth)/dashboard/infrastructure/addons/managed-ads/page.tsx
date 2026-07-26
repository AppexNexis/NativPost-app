'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Loader2, Megaphone } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/features/dashboard/ErrorBanner';
import { PageHeader } from '@/features/dashboard/PageHeader';
import { GridPageSkeleton } from '@/features/dashboard/PageSkeletons';

type Campaign = {
  id: string;
  managedAccountId: string;
  accountName: string | null;
  name: string;
  platform: string;
  status: string;
  managementPct: number;
  spendCents: number;
  createdAt: string;
};
type ManagedAccount = { id: string; platform: string; displayName: string | null; lifecycleState: string };

const PLATFORMS = ['facebook', 'instagram', 'tiktok', 'youtube', 'linkedin'];

function usd(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ManagedAdsPage() {
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState('');
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('facebook');
  const [pct, setPct] = useState(15);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const campaignsQuery = useQuery({
    queryKey: ['managed-ads-campaigns'],
    queryFn: async (): Promise<Campaign[]> => {
      const res = await fetch('/api/msi/addons/managed-ads');
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}.`);
      }
      const body = await res.json();
      return body.campaigns ?? [];
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

  const accounts = (accountsQuery.data ?? []).filter(a => a.lifecycleState === 'live');
  const campaigns = campaignsQuery.data ?? [];

  async function submit() {
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch('/api/msi/addons/managed-ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managedAccountId: accountId, name, platform, managementPct: pct }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Could not create the campaign.');
      }
      setSuccess(true);
      setName('');
      await queryClient.invalidateQueries({ queryKey: ['managed-ads-campaigns'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = !!accountId && name.trim().length > 0 && !submitting;

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
        title="Managed Advertising"
        description="Our team builds, launches, and monitors your paid campaigns. You pay the ad platform directly for spend; we charge a setup fee plus a management percentage."
      />

      {/* New campaign */}
      <div className="mb-6 rounded-xl border border-border bg-card p-5">
        <p className="mb-3 text-sm font-medium">Request a new campaign</p>
        {success && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
            <CheckCircle2 className="size-3.5 shrink-0" />
            Campaign requested. Our team will configure and launch it.
          </div>
        )}
        {error && <p className="mb-3 text-xs text-red-500">{error}</p>}
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="ad-account" className="mb-1 block text-xs font-medium text-muted-foreground">Account</label>
              <select
                id="ad-account"
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Select…</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.displayName || 'Managed account'} · {a.platform}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ad-platform" className="mb-1 block text-xs font-medium text-muted-foreground">Platform</label>
              <select
                id="ad-platform"
                value={platform}
                onChange={e => setPlatform(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm capitalize"
              >
                {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="ad-name" className="mb-1 block text-xs font-medium text-muted-foreground">Campaign name / goal</label>
            <input
              id="ad-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Summer sale — conversions"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="ad-pct" className="mb-1 block text-xs font-medium text-muted-foreground">
              Management fee: <span className="font-semibold text-foreground">{pct}%</span> of spend
            </label>
            <input
              id="ad-pct"
              type="range"
              min={10}
              max={20}
              step={1}
              value={pct}
              onChange={e => setPct(Number(e.target.value))}
              className="w-full"
            />
            <p className="mt-1 text-xs text-muted-foreground">Plus a one-time $49 setup fee. Ad spend is billed by the platform to you directly.</p>
          </div>
          <Button className="w-full gap-2" disabled={!canSubmit} onClick={submit}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Megaphone className="size-4" />}
            Request campaign
          </Button>
        </div>
      </div>

      {/* Campaigns */}
      {campaignsQuery.isLoading ? (
        <GridPageSkeleton cards={2} />
      ) : campaignsQuery.error ? (
        <ErrorBanner title="Couldn't load campaigns" detail={(campaignsQuery.error as Error).message} />
      ) : campaigns.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <Megaphone className="mx-auto size-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium text-foreground">No campaigns yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">Request one above and our team takes it from there.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(c => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{c.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground capitalize">
                  {c.platform} · {c.accountName || 'account'} · {c.managementPct}% mgmt
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums">{usd(c.spendCents)}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">spend to date</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
