'use client';

import { ArrowUpRight, Sparkles } from 'lucide-react';
import Link from 'next/link';

type Props = {
  currentPlan?: string | null;
  inactive?: boolean;
};

export function UpgradeBanner({ currentPlan, inactive }: Props) {
  const headline = inactive
    ? 'Reactivate your subscription to use the API'
    : 'API access is a Pro-plan feature';

  const body = inactive
    ? 'Your subscription is currently inactive, so API keys and webhooks are read-only. Reactivate to resume publishing and event delivery.'
    : `Programmatic content, webhooks and analytics are available on Pro, Agency and Enterprise${
      currentPlan ? ` (you are on ${currentPlan})` : ''
    }. Upgrade to generate a key.`;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-primary/30 bg-primary/5 p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Sparkles className="size-5" />
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="text-heading text-foreground">{headline}</h3>
          <p className="max-w-2xl text-body text-muted-foreground">{body}</p>
        </div>
      </div>

      <ul className="grid grid-cols-1 gap-2 text-body text-muted-foreground sm:grid-cols-2">
        <li className="flex items-start gap-2">
          <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
          Bearer-authenticated REST API at
          {' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">/api/v1</code>
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
          Signed outgoing webhooks (HMAC-SHA256) with delivery logs
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
          Content, campaign, analytics and brand-profile endpoints
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
          Programmatic publishing across every connected platform
        </li>
      </ul>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Link
          href="/dashboard/billing"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {inactive ? 'Reactivate plan' : 'Upgrade plan'}
          <ArrowUpRight className="size-4" />
        </Link>
        <a
          href="https://docs.nativpost.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Read the API docs
          <ArrowUpRight className="size-4" />
        </a>
      </div>
    </div>
  );
}
