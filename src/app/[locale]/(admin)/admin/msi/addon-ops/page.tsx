'use client';

import { ArrowLeft, Loader2, Megaphone, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

type AdCampaign = {
  id: string;
  orgId: string;
  managedAccountId: string;
  accountName: string | null;
  name: string;
  platform: string;
  status: string;
  managementPct: number;
  spendCents: number;
};
type CommunityTarget = {
  orgId: string;
  managedAccountId: string;
  accountName: string | null;
  platform: string;
};

function usd(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AddonOpsPage() {
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [targets, setTargets] = useState<CommunityTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [spendInput, setSpendInput] = useState<Record<string, string>>({});
  const [replyInput, setReplyInput] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, t] = await Promise.all([
        fetch('/api/admin/msi/ad-campaigns').then(r => r.json()),
        fetch('/api/admin/msi/community/targets').then(r => r.json()),
      ]);
      setCampaigns(c.campaigns ?? []);
      setTargets(t.targets ?? []);
    } catch {
      toast.error('Failed to load add-on ops');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function recordSpend(id: string) {
    const dollars = Number(spendInput[id]);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      toast.error('Enter a positive spend amount');
      return;
    }
    setBusy(`spend-${id}`);
    try {
      const res = await fetch(`/api/admin/msi/ad-campaigns/${id}/spend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spendCents: Math.round(dollars * 100) }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || `Server returned ${res.status}`);
      }
      toast.success(`Recorded ${usd(Math.round(dollars * 100))} · billed fee ${usd(body.feeCents)}`);
      setSpendInput(prev => ({ ...prev, [id]: '' }));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(null);
    }
  }

  async function logReplies(t: CommunityTarget) {
    const count = Number(replyInput[t.managedAccountId]);
    if (!Number.isInteger(count) || count <= 0) {
      toast.error('Enter a positive reply count');
      return;
    }
    setBusy(`log-${t.managedAccountId}`);
    try {
      const res = await fetch('/api/admin/msi/community/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: t.orgId, managedAccountId: t.managedAccountId, count }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || `Server returned ${res.status}`);
      }
      toast.success(`Logged ${count} replies`);
      setReplyInput(prev => ({ ...prev, [t.managedAccountId]: '' }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link
        href="/admin/msi"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Operations
      </Link>

      <h1 className="text-xl font-semibold tracking-tight text-foreground">Add-on operations</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Record ad spend (bills the management fee) and log community replies against quota.
      </p>

      {loading ? (
        <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <>
          {/* Ad campaigns */}
          <section className="mt-8">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Megaphone className="size-4 text-muted-foreground" />
              Ad campaigns
              <span className="text-xs font-normal text-muted-foreground">({campaigns.length})</span>
            </h2>
            {campaigns.length === 0 ? (
              <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                No ad campaigns yet.
              </p>
            ) : (
              <div className="space-y-2">
                {campaigns.map(c => (
                  <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{c.name}</p>
                      <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                        {c.platform} · {c.accountName || 'account'} · {c.managementPct}% mgmt · {usd(c.spendCents)} spent
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                        <input
                          value={spendInput[c.id] ?? ''}
                          onChange={e => setSpendInput(prev => ({ ...prev, [c.id]: e.target.value }))}
                          placeholder="spend"
                          inputMode="decimal"
                          className="w-24 rounded-md border border-border bg-background py-1.5 pl-5 pr-2 text-sm"
                        />
                      </div>
                      <Button size="sm" disabled={busy === `spend-${c.id}`} onClick={() => recordSpend(c.id)}>
                        {busy === `spend-${c.id}` ? <Loader2 className="size-3.5 animate-spin" /> : 'Record'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Community */}
          <section className="mt-8">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <MessageCircle className="size-4 text-muted-foreground" />
              Community — log replies
              <span className="text-xs font-normal text-muted-foreground">({targets.length})</span>
            </h2>
            {targets.length === 0 ? (
              <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                No accounts with Managed Community active.
              </p>
            ) : (
              <div className="space-y-2">
                {targets.map(t => (
                  <div key={t.managedAccountId} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{t.accountName || 'Managed account'}</p>
                      <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                        {t.platform} · org {t.orgId.slice(0, 12)}…
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        value={replyInput[t.managedAccountId] ?? ''}
                        onChange={e => setReplyInput(prev => ({ ...prev, [t.managedAccountId]: e.target.value }))}
                        placeholder="# replies"
                        inputMode="numeric"
                        className="w-24 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                      />
                      <Button size="sm" disabled={busy === `log-${t.managedAccountId}`} onClick={() => logReplies(t)}>
                        {busy === `log-${t.managedAccountId}` ? <Loader2 className="size-3.5 animate-spin" /> : 'Log'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
