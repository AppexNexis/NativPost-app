'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Bot, Check, Cpu, Loader2, User, Users } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/features/dashboard/ErrorBanner';
import { PageHeader } from '@/features/dashboard/PageHeader';
import { GridPageSkeleton } from '@/features/dashboard/PageSkeletons';

type AddonTier = { id: string; name: string; monthlyUsd: number; allotment: string };
type AddonPricing =
  | { kind: 'fixed_tiers'; tiers: AddonTier[] }
  | { kind: 'usage'; unitLabel: string; unitPriceUsd: number }
  | { kind: 'per_account'; monthlyUsd: number }
  | { kind: 'percent_of_spend'; setupUsd: number; managementPctMin: number; managementPctMax: number }
  | { kind: 'per_deliverable'; fromUsd: number }
  | { kind: 'per_case'; fromUsd: number }
  | { kind: 'custom' };

type Addon = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  status: 'available' | 'beta' | 'planned';
  whoPerforms: 'system' | 'ai' | 'operator' | 'ai_plus_human';
  pricing: AddonPricing;
  whoFor?: string;
  whatWeDo?: string[];
  timeSaved?: string;
  priority: number;
};

type Subscription = { addonId: string; status: string; tierId: string | null };

// Add-ons with a dedicated customer workflow surface.
const ADDON_WORKFLOWS: Record<string, { label: string; href: string }> = {
  managed_posting: { label: 'Request a post', href: '/dashboard/infrastructure/addons/managed-posting' },
  managed_content: { label: 'Request content', href: '/dashboard/infrastructure/addons/managed-content' },
  managed_analytics: { label: 'Open reports', href: '/dashboard/infrastructure/addons/managed-analytics' },
  managed_ads: { label: 'Manage campaigns', href: '/dashboard/infrastructure/addons/managed-ads' },
  managed_community: { label: 'View activity', href: '/dashboard/infrastructure/addons/managed-community' },
  managed_ugc: { label: 'Request a video', href: '/dashboard/infrastructure/addons/managed-ugc' },
  managed_expansion: { label: 'Add accounts', href: '/dashboard/infrastructure/new' },
};

type ApiResponse = { addons: Addon[]; subscriptions: Subscription[] };

const WHO_META: Record<Addon['whoPerforms'], { label: string; Icon: typeof Bot; className: string }> = {
  system: { label: 'Automated', Icon: Cpu, className: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400' },
  ai: { label: 'AI', Icon: Bot, className: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-950/30 dark:text-cyan-400' },
  operator: { label: 'Operator', Icon: User, className: 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400' },
  ai_plus_human: { label: 'AI + Human', Icon: Users, className: 'bg-primary/10 text-primary' },
};

function priceLabel(p: AddonPricing): string {
  switch (p.kind) {
    case 'fixed_tiers':
      return `from $${Math.min(...p.tiers.map(t => t.monthlyUsd))}/mo`;
    case 'per_account':
      return `$${p.monthlyUsd}/account/mo`;
    case 'usage':
      return `$${p.unitPriceUsd}/${p.unitLabel}`;
    case 'percent_of_spend':
      return `$${p.setupUsd} setup + ${p.managementPctMin}–${p.managementPctMax}% of spend`;
    case 'per_deliverable':
      return `from $${p.fromUsd}/deliverable`;
    case 'per_case':
      return `from $${p.fromUsd}/case`;
    case 'custom':
      return 'Custom pricing';
    default:
      return '';
  }
}

export default function AddonsPage() {
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [tierChoice, setTierChoice] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['msi-addons'],
    queryFn: async (): Promise<ApiResponse> => {
      const res = await fetch('/api/msi/addons');
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}. Please try again.`);
      }
      return res.json();
    },
  });

  const addons = useMemo(
    () => (data?.addons ?? []).slice().sort((a, b) => a.priority - b.priority),
    [data],
  );
  const subById = useMemo(() => {
    const m = new Map<string, Subscription>();
    for (const s of data?.subscriptions ?? []) {
      m.set(s.addonId, s);
    }
    return m;
  }, [data]);

  const activeCount = (data?.subscriptions ?? []).filter(s => s.status === 'active').length;

  async function mutate(addonId: string, action: 'activate' | 'deactivate', tierId?: string) {
    setPendingId(addonId);
    setActionError(null);
    try {
      const res = await fetch('/api/msi/addons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addonId, action, tierId }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Something went wrong.');
      }
      await queryClient.invalidateQueries({ queryKey: ['msi-addons'] });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Link
        href="/dashboard/infrastructure"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Infrastructure
      </Link>

      <PageHeader
        title="Add-ons"
        description="Turn on managed services — posting, content, ads, and more. Each runs on the same infrastructure; you only pay for what you activate."
      />

      {actionError && (
        <div className="mb-4">
          <ErrorBanner title="Couldn't update the add-on" detail={actionError} />
        </div>
      )}

      {isLoading ? (
        <GridPageSkeleton cards={6} />
      ) : error ? (
        <ErrorBanner
          title="Couldn't load add-ons"
          detail={error instanceof Error ? error.message : undefined}
        />
      ) : (
        <>
          {activeCount > 0 && (
            <p className="mb-4 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{activeCount}</span> add-on
              {activeCount === 1 ? '' : 's'} active.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {addons.map(addon => {
              const sub = subById.get(addon.id);
              const isActive = sub?.status === 'active';
              const who = WHO_META[addon.whoPerforms];
              const isTiered = addon.pricing.kind === 'fixed_tiers';
              const tiers = addon.pricing.kind === 'fixed_tiers' ? addon.pricing.tiers : [];
              const selectedTier = tierChoice[addon.id] ?? sub?.tierId ?? tiers[0]?.id;
              const isPending = pendingId === addon.id;
              const isPlanned = addon.status === 'planned';
              // Custom / per-case add-ons are high-touch: activation is a quote request.
              const isQuote = addon.pricing.kind === 'custom' || addon.pricing.kind === 'per_case';

              return (
                <div
                  key={addon.id}
                  className={`flex flex-col rounded-xl border p-5 ${
                    isActive ? 'border-primary/50 bg-primary/[0.03]' : 'border-border bg-card'
                  }`}
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${who.className}`}>
                      <who.Icon className="size-2.5" />
                      {who.label}
                    </span>
                    {isActive ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
                        <Check className="size-2.5" />
                        {isPlanned || isQuote ? 'Requested' : 'Active'}
                      </span>
                    ) : (
                      isPlanned && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Coming soon
                        </span>
                      )
                    )}
                  </div>

                  <p className="text-sm font-semibold text-foreground">{addon.name}</p>
                  <p className="mt-0.5 text-xs font-medium text-muted-foreground">{addon.tagline}</p>

                  {addon.whoFor && (
                    <p className="mt-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground">Who it's for:</span> {addon.whoFor}
                    </p>
                  )}

                  {addon.whatWeDo && addon.whatWeDo.length > 0 ? (
                    <ul className="mt-2 flex-1 space-y-1">
                      {addon.whatWeDo.slice(0, 5).map(item => (
                        <li key={item} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                          <Check className="mt-0.5 size-3 shrink-0 text-emerald-500" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 flex-1 text-xs text-muted-foreground">{addon.description}</p>
                  )}

                  {addon.timeSaved && (
                    <p className="mt-2 text-[11px] font-medium text-primary">⏱ {addon.timeSaved}</p>
                  )}

                  <p className="mt-3 text-sm font-semibold text-foreground">{priceLabel(addon.pricing)}</p>

                  {isTiered && !isActive && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {tiers.map(t => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTierChoice(prev => ({ ...prev, [addon.id]: t.id }))}
                          className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                            selectedTier === t.id
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border text-muted-foreground hover:bg-muted'
                          }`}
                          title={`${t.allotment} · $${t.monthlyUsd}/mo`}
                        >
                          {t.name} · ${t.monthlyUsd}
                        </button>
                      ))}
                    </div>
                  )}

                  {isTiered && isActive && sub?.tierId && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Tier: <span className="font-medium text-foreground">{tiers.find(t => t.id === sub.tierId)?.name ?? sub.tierId}</span>
                    </p>
                  )}

                  <div className="mt-4">
                    {isActive ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        disabled={isPending}
                        onClick={() => mutate(addon.id, 'deactivate')}
                      >
                        {isPending ? <Loader2 className="size-3.5 animate-spin" /> : (isPlanned || isQuote) ? 'Cancel request' : 'Deactivate'}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full"
                        disabled={isPending}
                        onClick={() => mutate(addon.id, 'activate', isTiered ? selectedTier : undefined)}
                      >
                        {isPending
                          ? <Loader2 className="size-3.5 animate-spin" />
                          : isPlanned
                            ? 'Request early access'
                            : isQuote
                              ? 'Request a quote'
                              : 'Activate'}
                      </Button>
                    )}
                  </div>

                  {isActive && !isPlanned && ADDON_WORKFLOWS[addon.id] && (
                    <Link
                      href={ADDON_WORKFLOWS[addon.id]!.href}
                      className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-md text-xs font-medium text-primary hover:underline"
                    >
                      {ADDON_WORKFLOWS[addon.id]!.label} →
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
