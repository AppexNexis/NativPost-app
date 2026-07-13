'use client';

import Link from 'next/link';

/**
 * Persistent trial + usage pill in the dashboard header.
 *
 * Renders one of three states, in priority order:
 *   1. Trial expired + not converted to paid → red "Trial expired — Upgrade"
 *   2. Trialing → amber "Trial: {N}d left" (red when <=1 day)
 *   3. Paid plan → neutral "{used}/{limit} posts" chip that turns amber >=70% and red >=90%
 *
 * Hidden entirely on unlimited plans (postsLimit sentinel 999999) to avoid
 * meaningless "0/999999 posts" noise for enterprise seats.
 *
 * Click target: /dashboard/billing. Both trial and cap concerns route there.
 */

export type TrialLimitsData = {
  isTrialing: boolean;
  trialDaysLeft: number;
  trialExpired: boolean;
  plan: string;
  usage: {
    postsThisMonth: number;
    postsLimit: number;
  };
};

const CHIP_BASE
  = 'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors';

export function TrialLimitsPill({ data }: { data: TrialLimitsData | null }) {
  if (!data) return null;

  const { isTrialing, trialDaysLeft, trialExpired, usage } = data;
  const unlimited = usage.postsLimit >= 999999;

  // --- 1. Expired trial (highest priority — blocks value) ---
  if (trialExpired && !isTrialing) {
    return (
      <Link
        href="/dashboard/billing"
        aria-label="Trial expired. Click to upgrade."
        className={`${CHIP_BASE} border-red-500/30 bg-red-500/10 text-red-600 hover:bg-red-500/15 dark:text-red-400`}
      >
        <span className="inline-block size-1.5 rounded-full bg-red-500" />
        <span className="sm:hidden">Upgrade</span>
        <span className="hidden sm:inline">Trial expired — Upgrade</span>
      </Link>
    );
  }

  // --- 2. Active trial ---
  if (isTrialing) {
    const urgent = trialDaysLeft <= 1;
    const warn = trialDaysLeft <= 3;
    const tone = urgent
      ? 'border-red-500/30 bg-red-500/10 text-red-600 hover:bg-red-500/15 dark:text-red-400'
      : warn
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400'
        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400';
    const dot = urgent ? 'bg-red-500' : warn ? 'bg-amber-500' : 'bg-emerald-500';
    const label = trialDaysLeft <= 0
      ? 'Trial ends today'
      : trialDaysLeft === 1
        ? 'Trial: 1 day left'
        : `Trial: ${trialDaysLeft} days left`;
    // Mobile chips get a compact form so the header does not overflow at 375px.
    const shortLabel = trialDaysLeft <= 0
      ? 'Ends today'
      : `${trialDaysLeft}d left`;

    return (
      <Link
        href="/dashboard/billing"
        aria-label={`${label}. Click to manage subscription.`}
        className={`${CHIP_BASE} ${tone}`}
      >
        <span className={`inline-block size-1.5 rounded-full ${dot}`} />
        <span className="sm:hidden">{shortLabel}</span>
        <span className="hidden sm:inline">{label}</span>
      </Link>
    );
  }

  // --- 3. Paid plan — usage cap ---
  if (unlimited || usage.postsLimit <= 0) return null;

  const pct = usage.postsThisMonth / usage.postsLimit;
  const overCap = usage.postsThisMonth >= usage.postsLimit;
  const near = pct >= 0.9;
  const soft = pct >= 0.7;
  const tone = overCap || near
    ? 'border-red-500/30 bg-red-500/10 text-red-600 hover:bg-red-500/15 dark:text-red-400'
    : soft
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400'
      : 'border-border bg-muted/50 text-muted-foreground hover:bg-muted';
  const dot = overCap || near
    ? 'bg-red-500'
    : soft
      ? 'bg-amber-500'
      : 'bg-emerald-500';

  return (
    <Link
      href="/dashboard/billing"
      aria-label={`${usage.postsThisMonth} of ${usage.postsLimit} monthly posts used. Click to view plan.`}
      className={`${CHIP_BASE} ${tone}`}
    >
      <span className={`inline-block size-1.5 rounded-full ${dot}`} />
      <span className="sm:hidden">{usage.postsThisMonth}/{usage.postsLimit}</span>
      <span className="hidden sm:inline">{usage.postsThisMonth}/{usage.postsLimit} posts</span>
    </Link>
  );
}
