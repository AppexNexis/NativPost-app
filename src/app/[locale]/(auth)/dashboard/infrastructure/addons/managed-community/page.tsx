'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/features/dashboard/ErrorBanner';
import { PageHeader } from '@/features/dashboard/PageHeader';
import { GridPageSkeleton } from '@/features/dashboard/PageSkeletons';

type CommunityStatus =
  | { active: false }
  | {
      active: true;
      tierId: string | null;
      quota: number;
      unlimited: boolean;
      used: number;
      remaining: number | null;
    };

export default function ManagedCommunityPage() {
  const { data: status, isLoading, error } = useQuery({
    queryKey: ['managed-community-status'],
    queryFn: async (): Promise<CommunityStatus> => {
      const res = await fetch('/api/msi/addons/managed-community');
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}.`);
      }
      return res.json();
    },
  });

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
        title="Managed Community"
        description="Our team replies to comments and DMs, hides spam, and moderates your managed accounts — so your community stays warm without you in the inbox."
      />

      {isLoading ? (
        <GridPageSkeleton cards={1} />
      ) : error ? (
        <ErrorBanner title="Couldn't load Managed Community" detail={(error as Error).message} />
      ) : !status?.active ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm font-medium text-foreground">Managed Community isn't active</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Activate it and choose a tier in Add-ons. Our team then handles inbound on your managed accounts.
          </p>
          <Button asChild size="sm" className="mt-4">
            <Link href="/dashboard/infrastructure/addons">Go to Add-ons</Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Replies handled this month</span>
            <span className="font-semibold tabular-nums">
              {status.used}
              {status.unlimited ? '' : ` / ${status.quota}`}
            </span>
          </div>
          {status.unlimited ? (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
              <MessageCircle className="size-3.5" />
              Unlimited replies on your plan.
            </div>
          ) : (
            <>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${status.quota > 0 ? Math.min(100, (status.used / status.quota) * 100) : 0}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {status.remaining} of {status.quota} replies remaining this month. Resets on the 1st.
              </p>
            </>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Our operators handle replies, DMs, and moderation directly on your managed accounts. You'll
            see the running total here.
          </p>
        </div>
      )}
    </div>
  );
}
