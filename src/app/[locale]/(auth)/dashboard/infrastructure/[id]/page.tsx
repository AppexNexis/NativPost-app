'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { ErrorBanner } from '@/features/dashboard/ErrorBanner';
import { PageHeader } from '@/features/dashboard/PageHeader';
import { ListPageSkeleton } from '@/features/dashboard/PageSkeletons';
import {
  CUSTOMER_STAGES,
  customerStageIndex,
  humanizeAction,
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
  credentialCustody: string;
  healthScore: number | null;
  liveAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type TimelineEvent = {
  id: string;
  actorType: string;
  action: string;
  detail: Record<string, unknown> | null;
  occurredAt: string;
};

type AccountResponse = {
  account: ManagedAccount;
  timeline: TimelineEvent[];
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function StageBar({ state }: { state: string }) {
  const active = customerStageIndex(state);
  return (
    <div className="flex gap-1.5" aria-hidden>
      {CUSTOMER_STAGES.map((label, i) => (
        <div key={label} className="flex-1">
          <div
            className={`h-1.5 rounded-full ${i <= active ? 'bg-primary' : 'bg-muted'}`}
          />
          <div className="mt-1 text-micro text-muted-foreground">{label}</div>
        </div>
      ))}
    </div>
  );
}

function Timeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No activity yet. Updates will appear here as your account is built.
      </p>
    );
  }
  return (
    <ol className="relative space-y-5 border-l border-border pl-5">
      {events.map(ev => (
        <li key={ev.id} className="relative">
          <span className="absolute -left-[23px] top-1 size-2.5 rounded-full bg-primary ring-4 ring-background" />
          <div className="text-sm font-medium text-foreground">
            {humanizeAction(ev.action)}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {formatDate(ev.occurredAt)}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function InfrastructureAccountPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ['msi-account', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<AccountResponse> => {
      const res = await fetch(`/api/msi/accounts/${id}`);
      if (res.status === 404) {
        throw new Error('Account not found');
      }
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}. Please try again.`);
      }
      return res.json();
    },
  });

  const account = data?.account;
  const handle
    = account?.displayName || account?.handlePreferences?.[0] || 'Managed account';

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Link
        href="/dashboard/infrastructure"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Infrastructure
      </Link>

      {isLoading
        ? (
            <ListPageSkeleton rows={5} />
          )
        : error
          ? (
              <ErrorBanner
                title="Couldn't load this account"
                detail={error instanceof Error ? error.message : undefined}
              />
            )
          : account
            ? (
                <>
                  <PageHeader
                    title={handle}
                    description={`${PLATFORM_LABELS[account.platform] || account.platform} · ${account.country}${account.niche ? ` · ${account.niche}` : ''}`}
                    actions={(
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${toneBadgeClass(stateTone(account.lifecycleState))}`}
                      >
                        {stateLabel(account.lifecycleState)}
                      </span>
                    )}
                  />

                  <div className="mt-2 rounded-xl border border-border bg-card p-5">
                    <StageBar state={account.lifecycleState} />
                  </div>

                  <div className="mt-6 rounded-xl border border-border bg-card p-5">
                    <h2 className="mb-4 text-sm font-semibold text-foreground">
                      Timeline
                    </h2>
                    <Timeline events={data.timeline} />
                  </div>

                  <p className="mt-4 text-micro text-muted-foreground">
                    You own this account. Credentials are held securely and released to you on request.
                  </p>
                </>
              )
            : null}
    </div>
  );
}
