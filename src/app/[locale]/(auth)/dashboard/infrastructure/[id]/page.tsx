'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
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
import { scoreTone } from '@/lib/msi/health';
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

const CHANGE_FIELDS = ['Username', 'Bio', 'Profile photo', 'Display name', 'Niche'];

function ReviewActions({
  accountId,
  onDone,
}: {
  accountId: string;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<'idle' | 'changes'>('idle');
  const [fields, setFields] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const toggle = (f: string) =>
    setFields((prev) => {
      const next = new Set(prev);
      if (next.has(f)) {
        next.delete(f);
      } else {
        next.add(f);
      }
      return next;
    });

  const submit = async (action: 'approve' | 'request_changes') => {
    setBusy(true);
    try {
      const changes
        = action === 'request_changes'
          ? (fields.size > 0 ? [...fields] : ['general']).map(field => ({
              field,
              note,
            }))
          : undefined;
      const res = await fetch(`/api/msi/accounts/${accountId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, changes }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || `Server returned ${res.status}`);
      }
      toast.success(
        action === 'approve' ? 'Account approved' : 'Changes requested',
      );
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">Your review</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Approve to finish, or request changes to the profile before it goes ahead.
      </p>

      {mode === 'idle'
        ? (
            <div className="mt-4 flex gap-2">
              <Button onClick={() => submit('approve')} disabled={busy}>
                Approve
              </Button>
              <Button
                variant="outline"
                onClick={() => setMode('changes')}
                disabled={busy}
              >
                Request changes
              </Button>
            </div>
          )
        : (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {CHANGE_FIELDS.map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => toggle(f)}
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      fields.has(f)
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={3}
                placeholder="What would you like changed?"
                className="w-full rounded-lg border border-border bg-background p-2 text-sm"
              />
              <div className="flex gap-2">
                <Button onClick={() => submit('request_changes')} disabled={busy}>
                  Send request
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setMode('idle')}
                  disabled={busy}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
    </div>
  );
}

function OffboardAction({
  accountId,
  custody,
  onDone,
}: {
  accountId: string;
  custody: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);

  if (custody === 'transfer_requested') {
    return (
      <div className="mt-6 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        Off-boarding requested — our team will release your login credentials
        shortly.
      </div>
    );
  }

  const request = async () => {
    if (
      typeof window !== 'undefined'
      && !window.confirm(
        'Request your login credentials and stop the managed service for this account?',
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/msi/accounts/${accountId}/offboard`, {
        method: 'POST',
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || `Server returned ${res.status}`);
      }
      toast.success('Off-boarding requested');
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-5">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">
          Take over this account
        </div>
        <div className="text-xs text-muted-foreground">
          Request your login credentials and stop the managed service.
        </div>
      </div>
      <Button variant="outline" size="sm" disabled={busy} onClick={request}>
        {busy ? '…' : 'Request export'}
      </Button>
    </div>
  );
}

export default function InfrastructureAccountPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const queryClient = useQueryClient();

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

                  {account.healthScore != null
                    ? (
                        <div className="mt-6 flex items-center justify-between rounded-xl border border-border bg-card p-5">
                          <h2 className="text-sm font-semibold text-foreground">
                            Performance
                          </h2>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${toneBadgeClass(scoreTone(account.healthScore))}`}
                          >
                            {account.healthScore}
                            /100
                          </span>
                        </div>
                      )
                    : null}

                  {account.lifecycleState === 'customer_review' && id
                    ? (
                        <ReviewActions
                          accountId={id}
                          onDone={() =>
                            queryClient.invalidateQueries({
                              queryKey: ['msi-account', id],
                            })}
                        />
                      )
                    : null}

                  <div className="mt-6 rounded-xl border border-border bg-card p-5">
                    <h2 className="mb-4 text-sm font-semibold text-foreground">
                      Timeline
                    </h2>
                    <Timeline events={data.timeline} />
                  </div>

                  {id
                    && (['live', 'active'].includes(account.lifecycleState)
                      || account.credentialCustody === 'transfer_requested')
                    ? (
                        <OffboardAction
                          accountId={id}
                          custody={account.credentialCustody}
                          onDone={() =>
                            queryClient.invalidateQueries({
                              queryKey: ['msi-account', id],
                            })}
                        />
                      )
                    : null}

                  <p className="mt-4 text-micro text-muted-foreground">
                    You own this account. Credentials are held securely and released to you on request.
                  </p>
                </>
              )
            : null}
    </div>
  );
}
