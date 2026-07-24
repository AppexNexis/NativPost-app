'use client';

import { Check, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { MSI_PER_ACCOUNT_USD, MSI_PER_POST_USD } from '@/lib/msi/pricing';

// Product / pricing landing shown when the org has no managed accounts yet.
// Compliant positioning: real, local, customer-owned accounts we operate — not
// an account marketplace. No "anti-ban" / "buy accounts" language.

const FEATURES = [
  'Created and run by our in-country teams',
  'Real local devices, operated by real people',
  'Warmed up in your exact niche',
  'You own the account and its credentials',
  'Unified analytics across accounts',
  'Target multiple countries',
  'Publish natively from NativPost',
  'Off-board and take over anytime',
];

const STEPS = [
  { n: '01', title: 'Configure', body: 'Choose the country, platform, niche, and handles for each account.' },
  { n: '02', title: 'Create + warm', body: 'Our local team creates the account from scratch and warms it up in your niche, on a real phone.' },
  { n: '03', title: 'Review', body: 'Review the profile and request changes, or approve it when it’s right.' },
  { n: '04', title: 'Go live', body: 'Once approved it goes live and joins your publishing calendar like any connected account.' },
];

const FAQS = [
  {
    q: 'How does pricing work?',
    a: `$${MSI_PER_ACCOUNT_USD}/mo per account covers creation, warm-up, hosting, and ongoing management. Publishing is $${MSI_PER_POST_USD} per post. No hidden fees.`,
  },
  {
    q: 'Do I own the accounts?',
    a: 'Yes — you own every account entirely. We create and operate them on your behalf under a written authorization you can revoke at any time.',
  },
  {
    q: 'Do I get the login credentials?',
    a: 'Yes. You can request them at any time, and when you off-board we hand the credentials back to you.',
  },
  {
    q: 'Are the accounts run by real people?',
    a: 'Yes. Every account is created and operated by a local person on a real device in the target country — no bots, no emulators.',
  },
  {
    q: 'How long until an account is live?',
    a: 'Most accounts are ready for your review within a couple of days. After you approve, warming finishes and it goes live.',
  },
  {
    q: 'Which countries and platforms are supported?',
    a: 'TikTok and Instagram to start, across a growing list of countries. More platforms are added as they clear our compliance review.',
  },
];

export function InfrastructureLanding() {
  const [count, setCount] = useState(10);
  const total = MSI_PER_ACCOUNT_USD * count;

  return (
    <div className="mx-auto max-w-3xl space-y-12 py-4">
      <div className="text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Managed social presence, run for you
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-body text-muted-foreground">
          Real, local accounts created and operated by NativPost’s in-country
          teams — owned by you, published from one place.
        </p>
      </div>

      <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-6">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Per account
            </div>
            <div className="mt-1 text-3xl font-semibold text-foreground">
              $
              {MSI_PER_ACCOUNT_USD}
              <span className="text-base font-normal text-muted-foreground">
                {' '}
                /mo
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Accounts
            </div>
            <div className="mt-1 text-3xl font-semibold text-foreground">
              {count}
            </div>
          </div>
        </div>

        <ul className="mt-5 space-y-2">
          {FEATURES.map(f => (
            <li key={f} className="flex items-start gap-2 text-sm text-foreground">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
              {f}
            </li>
          ))}
          <li className="flex items-start gap-2 text-sm text-foreground">
            <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
            $
            {MSI_PER_POST_USD}
            {' '}
            per post published
          </li>
        </ul>

        <div className="mt-5">
          <input
            type="range"
            min={1}
            max={100}
            value={count}
            onChange={e => setCount(Number(e.target.value))}
            className="w-full accent-primary"
            aria-label="Number of accounts"
          />
          <div className="mt-1 flex justify-between text-micro text-muted-foreground">
            <span>1</span>
            <span>100</span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
          <span className="text-sm text-muted-foreground">Total / mo</span>
          <span className="text-2xl font-semibold text-foreground">
            $
            {total.toLocaleString()}
          </span>
        </div>

        <Button asChild className="mt-5 w-full">
          <Link href="/dashboard/infrastructure/new">Configure accounts</Link>
        </Button>
        <p className="mt-2 text-center text-micro text-muted-foreground">
          You review each account before it goes live.
        </p>
      </div>

      <div>
        <h3 className="mb-4 text-center text-lg font-semibold text-foreground">
          How it works
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(s => (
            <div key={s.n} className="rounded-xl border border-border bg-card p-4">
              <div className="text-xs font-semibold text-muted-foreground">
                {s.n}
              </div>
              <div className="mt-2 text-sm font-semibold text-foreground">
                {s.title}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{s.body}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-4 text-center text-lg font-semibold text-foreground">
          Frequently asked questions
        </h3>
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {FAQS.map(f => (
            <details key={f.q} className="group bg-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-foreground">
                {f.q}
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition group-open:rotate-180" />
              </summary>
              <p className="px-4 pb-4 text-sm text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
