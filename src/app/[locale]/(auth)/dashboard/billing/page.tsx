import {  CreditCard, ExternalLink } from 'lucide-react';
import Link from 'next/link';

import { PageHeader } from '@/features/dashboard/PageHeader';

// -----------------------------------------------------------
// PLAN DATA (mirrors marketing site pricing)
// -----------------------------------------------------------
const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$19',
    period: '/mo',
    setupFee: '$29',
    cta: 'Start free trial',
    features: ['20 posts', '3 platforms', 'Basic', 'Templates', 'Self-approve'],
    current: true,
  },
  {
    id: 'growth',
    name: 'Growth',
    price: '$49',
    period: '/mo',
    setupFee: '$79',
    cta: 'Start free trial',
    popular: true,
    features: ['40 posts', '5 platforms', 'Detailed', 'Custom', 'Self-approve'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$99',
    period: '/mo',
    setupFee: '$149',
    cta: 'Start free trial',
    features: ['80 posts', 'All platforms', 'Premium', 'Premium custom', 'Our team reviews'],
  },
];

const FEATURE_LABELS = [
  'Posts per month',
  'Social platforms',
  'Brand Profile depth',
  'Custom graphics',
  'Human review',
];

export default function BillingPage() {
  return (
    <>
      <PageHeader
        title="Billing"
        description="Manage your subscription and payment details."
      />

      {/* Current plan banner */}
      <div className="mb-8 rounded-xl border bg-card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <CreditCard className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">
                Current plan:{' '}
                <span className="text-[#16A34A]">Free trial</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Trial ends in 7 days. Upgrade anytime.
              </p>
            </div>
          </div>
          <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            Manage subscription
          </button>
        </div>
      </div>

      {/* Pricing section — matching marketing site layout */}
      <div className="rounded-2xl border bg-card p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <span className="mb-3 inline-block rounded-full bg-[#cdf5f8] px-4 py-1.5 text-xs font-normal text-foreground">
            Simple, transparent pricing
          </span>
          <h2 className="mb-2 text-xl font-semibold tracking-tight sm:text-2xl">
            Agency-quality content at a price your business can afford.
          </h2>
          <p className="mx-auto max-w-lg text-sm text-muted-foreground">
            All plans include your personalized Brand Profile, anti-slop quality
            filter, and cross-platform publishing. Setup fee covers your
            onboarding workshop.
          </p>
        </div>

        {/* Pricing grid — comparison table style */}
        <div className="grid grid-cols-12 gap-4 lg:gap-6">
          {/* "What's included" label column — hidden on mobile */}
          <div className="col-span-12 hidden xl:col-span-3 xl:block">
            {/* Spacer to align with plan cards */}
            <div className="h-[180px]" />
            <div className="space-y-0">
              <h3 className="mb-2 text-sm font-semibold">
                What&apos;s included
              </h3>
              {FEATURE_LABELS.map((label) => (
                <div
                  key={label}
                  className="flex h-14 items-center border-b border-border/50 pr-4 text-sm text-muted-foreground"
                >
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* Plan columns */}
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className="col-span-12 sm:col-span-6 xl:col-span-3"
            >
              {/* Plan header card */}
              <div
                className={`relative mb-0 overflow-hidden rounded-t-2xl px-5 py-6 ${
                  plan.popular
                    ? 'bg-foreground text-background'
                    : 'bg-muted/60'
                }`}
              >
                {/* Gradient decoration on popular plan */}
                {plan.popular && (
                  <div className="absolute -top-16 -right-12 size-40 rounded-full bg-primary/30 blur-3xl" />
                )}
                <div className="relative z-10">
                  <p
                    className={`mb-2 text-sm font-medium ${
                      plan.popular ? 'text-background/60' : ''
                    }`}
                  >
                    {plan.name}
                    {plan.popular && (
                      <span className="ml-2 text-xs">— Most Popular</span>
                    )}
                  </p>
                  <div className="flex items-baseline">
                    <span
                      className={`text-3xl font-bold ${
                        plan.popular ? 'text-background' : ''
                      }`}
                    >
                      {plan.price}
                    </span>
                    <span
                      className={`ml-1 text-sm ${
                        plan.popular
                          ? 'text-background/60'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {plan.period}
                    </span>
                  </div>
                  <p
                    className={`mt-1 text-xs ${
                      plan.popular
                        ? 'text-background/50'
                        : 'text-muted-foreground'
                    }`}
                  >
                    + {plan.setupFee} one-time setup fee
                  </p>
                </div>
                <button
                  disabled={plan.current}
                  className={`relative z-10 mt-5 w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                    plan.current
                      ? 'border bg-background/10 text-muted-foreground opacity-60'
                      : plan.popular
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'border bg-background text-foreground hover:bg-muted'
                  }`}
                >
                  {plan.current ? 'Current plan' : plan.cta}
                </button>
              </div>

              {/* Feature values */}
              <div className="rounded-b-2xl border border-t-0 bg-background">
                {plan.features.map((value, i) => (
                  <div
                    key={i}
                    className="flex h-14 items-center justify-center border-b border-border/50 px-4 text-center text-sm last:border-b-0"
                  >
                    {/* On mobile, show the label too */}
                    <span className="mr-2 text-muted-foreground xl:hidden">
                      {FEATURE_LABELS[i]}:{' '}
                    </span>
                    <span className="font-medium text-muted-foreground">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Agency & Enterprise note */}
        <div className="mt-8 text-center">
          <p className="text-sm text-muted-foreground">
            Need{' '}
            <strong className="font-semibold text-foreground">
              Agency ($199/mo)
            </strong>{' '}
            or{' '}
            <strong className="font-semibold text-foreground">
              Enterprise (custom)
            </strong>{' '}
            plans?{' '}
            <Link
              href="/dashboard/settings"
              className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2 hover:text-primary/80"
            >
              Contact us
              <ExternalLink className="size-3" />
            </Link>{' '}
            for multi-brand management, white-label options, and dedicated
            account managers.
          </p>
        </div>
      </div>

      {/* Payment history section */}
      <div className="mt-8">
        <h3 className="mb-4 text-base font-semibold">Payment history</h3>
        <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-dashed bg-background text-center">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              No payments yet
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Your payment history will appear here after your first billing
              cycle.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}