'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  CalendarDays,
  ExternalLink,
  Receipt,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';

import { ErrorBanner } from '@/features/dashboard/ErrorBanner';
import { PageHeader } from '@/features/dashboard/PageHeader';
import { GridPageSkeleton } from '@/features/dashboard/PageSkeletons';
import { StatCard } from '@/features/dashboard/StatCard';
import { PLATFORM_LABELS } from '@/lib/platforms';

type UsageEvent = {
  id: string;
  platform: string;
  platformPostId: string | null;
  permalink: string | null;
  billingPeriod: string;
  occurredAt: string;
  reportedAt: string | null;
  accountName: string | null;
};

type UsageResponse = {
  perPostUsd: number;
  currentPeriod: string;
  summary: {
    currentPeriodPosts: number;
    currentPeriodCharge: number;
    allTimePosts: number;
    allTimeCharge: number;
  };
  byPeriod: { period: string; posts: number; charge: number }[];
  events: UsageEvent[];
};

const usd = (n: number) => `$${n.toFixed(2)}`;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// 'YYYY-MM' → 'July 2026'
function fmtPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) {
    return period;
  }
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function ManagedPostingUsagePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['msi-usage'],
    queryFn: async (): Promise<UsageResponse> => {
      const res = await fetch('/api/msi/usage');
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}. Please try again.`);
      }
      return res.json();
    },
  });

  const perPost = data?.perPostUsd ?? 1.5;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Link
        href="/dashboard/infrastructure"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Infrastructure
      </Link>

      <PageHeader
        title="Managed Posting usage"
        description={`Metered charges for posts we publish to your managed accounts — ${usd(perPost)} per published post.`}
      />

      {isLoading
        ? (
            <GridPageSkeleton cards={2} />
          )
        : error
          ? (
              <ErrorBanner
                title="Couldn't load your usage"
                detail={error instanceof Error ? error.message : undefined}
              />
            )
          : !data || data.summary.allTimePosts === 0
            ? (
                <div className="rounded-xl border border-border bg-card p-8 text-center">
                  <Receipt className="mx-auto size-8 text-muted-foreground/60" />
                  <p className="mt-3 text-sm font-medium text-foreground">
                    No managed posts billed yet
                  </p>
                  <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                    Each time we publish a post to one of your managed accounts, a
                    {' '}
                    {usd(perPost)}
                    {' '}
                    charge is recorded here with a link to the live post.
                  </p>
                </div>
              )
            : (
                <>
                  <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <StatCard
                      icon={Wallet}
                      label={`This month (${fmtPeriod(data.currentPeriod)})`}
                      value={usd(data.summary.currentPeriodCharge)}
                      change={`${data.summary.currentPeriodPosts} post${data.summary.currentPeriodPosts === 1 ? '' : 's'}`}
                      trend="neutral"
                    />
                    <StatCard
                      icon={Receipt}
                      label="All time"
                      value={usd(data.summary.allTimeCharge)}
                      change={`${data.summary.allTimePosts} post${data.summary.allTimePosts === 1 ? '' : 's'}`}
                      trend="neutral"
                    />
                  </div>

                  {data.byPeriod.length > 1 && (
                    <section className="mb-6">
                      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        <CalendarDays className="size-4 text-muted-foreground" />
                        Monthly breakdown
                      </h2>
                      <div className="divide-y overflow-hidden rounded-xl border border-border bg-card">
                        {data.byPeriod.map(p => (
                          <div
                            key={p.period}
                            className="flex items-center justify-between px-4 py-3 text-sm"
                          >
                            <span className="text-foreground">{fmtPeriod(p.period)}</span>
                            <span className="text-muted-foreground">
                              {p.posts}
                              {' '}
                              post
                              {p.posts === 1 ? '' : 's'}
                              {' · '}
                              <span className="font-medium text-foreground">{usd(p.charge)}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  <section>
                    <h2 className="mb-3 text-sm font-semibold text-foreground">
                      Billed posts
                    </h2>
                    <div className="divide-y overflow-hidden rounded-xl border border-border bg-card">
                      {data.events.map(ev => (
                        <div
                          key={ev.id}
                          className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-foreground">
                              {ev.accountName || 'Managed account'}
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                {PLATFORM_LABELS[ev.platform] || ev.platform}
                              </span>
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {fmtDate(ev.occurredAt)}
                              {' · '}
                              {usd(perPost)}
                            </div>
                          </div>
                          {ev.permalink
                            ? (
                                <a
                                  href={ev.permalink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                                >
                                  <ExternalLink className="size-3.5" />
                                  View post
                                </a>
                              )
                            : (
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  link pending
                                </span>
                              )}
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}
    </div>
  );
}
