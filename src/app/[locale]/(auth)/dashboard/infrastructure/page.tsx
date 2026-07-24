'use client';

import { useQuery } from '@tanstack/react-query';
import { Boxes, CheckCircle2, Clock, Radio } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import { EmptyState } from '@/features/dashboard/EmptyState';
import { ErrorBanner } from '@/features/dashboard/ErrorBanner';
import { PageHeader } from '@/features/dashboard/PageHeader';
import { GridPageSkeleton } from '@/features/dashboard/PageSkeletons';
import { StatCard } from '@/features/dashboard/StatCard';
import {
  CUSTOMER_STAGES,
  customerStageIndex,
  stateLabel,
  stateTone,
  toneBadgeClass,
} from '@/lib/msi/display';
import { PLATFORM_LABELS } from '@/lib/platforms';

type ManagedAccount = {
  id: string;
  platform: string;
  country: string;
  niche: string | null;
  displayName: string | null;
  handlePreferences: string[];
  lifecycleState: string;
  healthScore: number | null;
  liveAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function StageBar({ state }: { state: string }) {
  const active = customerStageIndex(state);
  return (
    <div className="mt-4 flex gap-1" aria-hidden>
      {CUSTOMER_STAGES.map((label, i) => (
        <div
          key={label}
          title={label}
          className={`h-1.5 flex-1 rounded-full ${i <= active ? 'bg-primary' : 'bg-muted'}`}
        />
      ))}
    </div>
  );
}

function AccountCard({ account }: { account: ManagedAccount }) {
  const handle
    = account.displayName || account.handlePreferences?.[0] || 'Managed account';
  return (
    <Link
      href={`/dashboard/infrastructure/${account.id}`}
      className="block rounded-xl border border-border bg-card p-4 transition hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">
            {handle}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {PLATFORM_LABELS[account.platform] || account.platform}
            {' · '}
            {account.country}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-micro font-medium ${toneBadgeClass(stateTone(account.lifecycleState))}`}
        >
          {stateLabel(account.lifecycleState)}
        </span>
      </div>

      <StageBar state={account.lifecycleState} />

      {account.niche
        ? (
            <div className="mt-3 truncate text-xs text-muted-foreground">
              {account.niche}
            </div>
          )
        : null}
    </Link>
  );
}

export default function InfrastructurePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['msi-accounts'],
    queryFn: async (): Promise<ManagedAccount[]> => {
      const res = await fetch('/api/msi/accounts');
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}. Please try again.`);
      }
      const body = await res.json();
      return body.accounts ?? [];
    },
  });

  const accounts = useMemo(() => data ?? [], [data]);
  const counts = useMemo(() => {
    const c = { total: accounts.length, building: 0, review: 0, live: 0 };
    for (const a of accounts) {
      const tone = stateTone(a.lifecycleState);
      if (tone === 'progress') {
        c.building += 1;
      } else if (tone === 'review') {
        c.review += 1;
      } else if (tone === 'live') {
        c.live += 1;
      }
    }
    return c;
  }, [accounts]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <PageHeader
        title="Infrastructure"
        description="Managed social accounts — created, warmed, and run by NativPost, owned by you."
      />

      {isLoading
        ? (
            <GridPageSkeleton cards={6} />
          )
        : error
          ? (
              <ErrorBanner
                title="Couldn't load your infrastructure"
                detail={error instanceof Error ? error.message : undefined}
              />
            )
          : accounts.length === 0
            ? (
                <EmptyState
                  icon={Boxes}
                  title="No managed accounts yet"
                  description="Managed accounts you order will appear here with a live build timeline from order to live."
                />
              )
            : (
                <>
                  <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard icon={Boxes} label="Total" value={counts.total} />
                    <StatCard icon={Clock} label="Building" value={counts.building} />
                    <StatCard icon={CheckCircle2} label="In review" value={counts.review} />
                    <StatCard icon={Radio} label="Live" value={counts.live} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {accounts.map(a => (
                      <AccountCard key={a.id} account={a} />
                    ))}
                  </div>
                </>
              )}
    </div>
  );
}
