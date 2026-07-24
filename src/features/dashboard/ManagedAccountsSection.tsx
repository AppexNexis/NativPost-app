'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { stateLabel, stateTone, toneBadgeClass } from '@/lib/msi/display';
import { PLATFORM_LABELS } from '@/lib/platforms';

// Managed (MSI) accounts shown alongside OAuth-connected accounts on the Social
// Accounts page — "same page, different badge" (docs §13). Self-contained and
// read-only: renders nothing when the org has no managed accounts, so it never
// clutters the page for non-MSI orgs. Shares the ['msi-accounts'] query cache
// with the Infrastructure grid.

type ManagedAccount = {
  id: string;
  platform: string;
  country: string;
  displayName: string | null;
  handlePreferences: string[];
  lifecycleState: string;
};

export function ManagedAccountsSection() {
  const { data } = useQuery({
    queryKey: ['msi-accounts'],
    queryFn: async (): Promise<ManagedAccount[]> => {
      const res = await fetch('/api/msi/accounts');
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      const body = await res.json();
      return body.accounts ?? [];
    },
  });

  const accounts = data ?? [];
  if (accounts.length === 0) {
    return null;
  }

  return (
    <div className="mt-10">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Managed accounts
      </p>
      <div className="space-y-2">
        {accounts.map((a) => {
          const handle
            = a.displayName || a.handlePreferences?.[0] || 'Managed account';
          return (
            <Link
              key={a.id}
              href={`/dashboard/infrastructure/${a.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 transition hover:shadow-sm"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-micro font-semibold text-primary">
                  Managed
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {handle}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {PLATFORM_LABELS[a.platform] || a.platform}
                    {' · '}
                    {a.country}
                  </div>
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-micro font-medium ${toneBadgeClass(stateTone(a.lifecycleState))}`}
              >
                {stateLabel(a.lifecycleState)}
              </span>
            </Link>
          );
        })}
      </div>
      <p className="mt-2 text-meta text-muted-foreground">
        Managed accounts are created and run by NativPost and owned by you —
        manage them in Infrastructure.
      </p>
    </div>
  );
}
