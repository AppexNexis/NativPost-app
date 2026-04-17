'use client';

import { useOrganization, useUser } from '@clerk/nextjs';
import {
  Check,
  ChevronRight,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

import { FREE_TRIAL_DAYS, VISIBLE_PLANS } from '@/lib/plans';

type PaymentMethod = 'stripe' | 'paystack';

const FEATURE_ROWS = [
  {
    label: 'Posts per month',
    render: (plan: typeof VISIBLE_PLANS[0]) =>
      plan.features.postsPerMonth === -1 ? 'Unlimited' : String(plan.features.postsPerMonth),
  },
  {
    label: 'Social platforms',
    render: (plan: typeof VISIBLE_PLANS[0]) =>
      plan.features.platformsLimit === -1 ? 'All platforms' : `Up to ${plan.features.platformsLimit}`,
  },
  {
    label: 'Image & text posts',
    render: (plan: typeof VISIBLE_PLANS[0]) => plan.features.imagePosts as boolean,
  },
  {
    label: 'Carousel posts',
    render: (plan: typeof VISIBLE_PLANS[0]) => plan.features.carouselPosts as boolean,
  },
  {
    label: 'Video posts + generation',
    render: (plan: typeof VISIBLE_PLANS[0]) => plan.features.videoGeneration as boolean,
  },
  {
    label: 'Content modes',
    render: (plan: typeof VISIBLE_PLANS[0]) => plan.features.contentModes as boolean,
  },
  {
    label: 'Post enrichment',
    render: (plan: typeof VISIBLE_PLANS[0]) => plan.features.postEnrichment as boolean,
  },
  {
    label: 'Human content review',
    render: (plan: typeof VISIBLE_PLANS[0]) => plan.features.humanReview as boolean,
  },
  {
    label: 'Analytics sync',
    render: (plan: typeof VISIBLE_PLANS[0]) => plan.features.analyticsSync as boolean,
  },
  {
    label: 'Support',
    render: (plan: typeof VISIBLE_PLANS[0]) =>
      ({
        email: 'Email',
        priority_email: 'Priority email',
        live_chat: 'Live chat',
        dedicated_slack: 'Dedicated Slack',
      }[plan.features.supportLevel] || 'Email'),
  },
];

// -----------------------------------------------------------
// MOBILE PLAN CARD — accordion-style feature list
// -----------------------------------------------------------
function MobilePlanCard({
  plan,
  isSelected,
  isPlanLoading,
  isLoading,
  onSelect,
  onSubscribe,
  trialDays,
}: {
  plan: typeof VISIBLE_PLANS[0];
  isSelected: boolean;
  isPlanLoading: boolean;
  isLoading: string | null;
  onSelect: () => void;
  onSubscribe: () => void;
  trialDays: number;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`overflow-hidden rounded-2xl border-2 transition-all duration-200 ${
        isSelected ? 'border-primary shadow-md shadow-primary/10' : 'border-border'
      }`}
    >
      {/* Card header */}
      <div
        className={`p-5 ${plan.popular ? 'bg-foreground text-background' : 'bg-muted/40'}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className={`text-sm font-semibold ${plan.popular ? 'text-background' : ''}`}>
                {plan.name}
              </p>
              {plan.popular && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  Most popular
                </span>
              )}
            </div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className={`text-2xl font-bold ${plan.popular ? 'text-background' : ''}`}>
                $
                {plan.priceUsd}
              </span>
              <span className={`text-xs ${plan.popular ? 'text-background/60' : 'text-muted-foreground'}`}>
                /mo
              </span>
            </div>
            <p className={`mt-0.5 text-xs ${plan.popular ? 'text-background/50' : 'text-muted-foreground'}`}>
              + $
              {plan.setupFeeUsd}
              {' '}
              one-time setup
            </p>
          </div>

          {/* Select button */}
          <button
            type="button"
            onClick={onSelect}
            className={`shrink-0 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              isSelected
                ? 'bg-primary text-primary-foreground'
                : plan.popular
                  ? 'bg-background/15 text-background hover:bg-background/25'
                  : 'border border-border bg-background text-foreground hover:bg-muted'
            }`}
          >
            {isSelected ? (
              <span className="flex items-center gap-1">
                <Check className="size-3" />
                {' '}
                Selected
              </span>
            ) : (
              'Select'
            )}
          </button>
        </div>

        {/* CTA when selected */}
        {isSelected && (
          <button
            type="button"
            onClick={onSubscribe}
            disabled={!!isLoading}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {isPlanLoading
              ? <Loader2 className="size-4 animate-spin" />
              : <ChevronRight className="size-4" />}
            {isPlanLoading ? 'Redirecting...' : `Start ${trialDays}-day free trial`}
          </button>
        )}
      </div>

      {/* Feature toggle */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="flex w-full items-center justify-between border-t bg-background px-5 py-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40"
      >
        <span>{expanded ? 'Hide features' : 'View all features'}</span>
        <svg
          className={`size-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Feature list */}
      {expanded && (
        <div className="border-t bg-background">
          {FEATURE_ROWS.map((row) => {
            const value = row.render(plan);
            return (
              <div
                key={row.label}
                className="flex items-center justify-between border-b border-border/40 px-5 py-3 last:border-b-0"
              >
                <span className="text-sm text-muted-foreground">{row.label}</span>
                <span className="ml-3 text-right">
                  {typeof value === 'boolean' ? (
                    value
                      ? <Check className="size-4 text-emerald-500" />
                      : <span className="text-sm text-muted-foreground/30">—</span>
                  ) : (
                    <span className="text-sm font-medium">{value}</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------
// INNER PAGE CONTENT
// -----------------------------------------------------------
function SubscribeContent() {
  const { user } = useUser();
  const { organization } = useOrganization();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/dashboard';

  const paystackSuccess = searchParams.get('paystack_success');
  const paystackReference = searchParams.get('reference') || searchParams.get('trxref');
  const returnedPlan = searchParams.get('plan');

  const [billingChecked, setBillingChecked] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>('growth');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('stripe');
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pollAttempts, setPollAttempts] = useState(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const MAX_POLL_ATTEMPTS = 10;
  const POLL_INTERVAL_MS = 2000;

  const pollBillingStatus = useCallback(async (attempt: number) => {
    if (attempt >= MAX_POLL_ATTEMPTS) {
      console.warn('[Subscribe] Polling timed out, redirecting optimistically');
      router.replace(redirectPath);
      return;
    }

    try {
      if (attempt === 0 && paystackReference) {
        const verifyRes = await fetch('/api/billing/paystack-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference: paystackReference, planId: returnedPlan }),
        });
        if (verifyRes.ok) {
          const verifyData = await verifyRes.json();
          if (verifyData.success) {
            router.replace(redirectPath);
            return;
          }
        }
      }

      const res = await fetch('/api/billing/status', { cache: 'no-store' });
      if (res.ok) {
        const billing = await res.json();
        if ((billing?.isActive || billing?.isTrialing) && !billing?.trialExpired) {
          router.replace(redirectPath);
          return;
        }
      }
    } catch {
      // keep polling
    }

    setPollAttempts(attempt + 1);
    pollTimer.current = setTimeout(() => pollBillingStatus(attempt + 1), POLL_INTERVAL_MS);
  }, [redirectPath, returnedPlan, router, paystackReference]);

  useEffect(() => {
    let mounted = true;

    async function init() {
      if (paystackSuccess && paystackReference) {
        if (mounted) {
          setIsPolling(true);
          setBillingChecked(true);
        }
        pollBillingStatus(0);
        return;
      }

      try {
        if (!organization) {
          if (mounted) {
            setBillingChecked(true);
          }
          return;
        }

        const res = await fetch('/api/billing/status', { cache: 'no-store' });
        if (!res.ok) {
          if (mounted) {
            setBillingChecked(true);
          }
          return;
        }

        const billing = await res.json();
        if ((billing?.isActive || billing?.isTrialing) && !billing?.trialExpired) {
          router.replace(redirectPath);
          return;
        }

        if (mounted) {
          setBillingChecked(true);
        }
      } catch {
        if (mounted) {
          setBillingChecked(true);
        }
      }
    }

    init();

    return () => {
      mounted = false;
      if (pollTimer.current) {
        clearTimeout(pollTimer.current);
      }
    };
  }, [organization, paystackSuccess, paystackReference, redirectPath, router, pollBillingStatus]);

  const handleSubscribe = async (planId: string) => {
    setIsLoading(planId);
    setError(null);
    try {
      if (paymentMethod === 'stripe') {
        const res = await fetch('/api/billing/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId }),
        });
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        } else {
          setError(data.error || 'Failed to start checkout. Please try again.');
        }
      } else {
        const email = user?.primaryEmailAddress?.emailAddress;
        if (!email) {
          setError('Could not find your email address. Please try card payment.');
          return;
        }
        const res = await fetch('/api/billing/create-paystack-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId, email }),
        });
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        } else {
          setError(data.error || 'Failed to start payment. Please try again.');
        }
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsLoading(null);
    }
  };

  // -----------------------------------------------------------
  // POLLING STATE
  // -----------------------------------------------------------
  if (isPolling) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm font-medium">Confirming your payment...</p>
        <p className="max-w-xs text-center text-xs text-muted-foreground">
          This usually takes a few seconds. Please don't close this page.
        </p>
        {pollAttempts > 5 && (
          <p className="text-xs text-muted-foreground">
            Taking longer than expected. Still checking...
          </p>
        )}
      </div>
    );
  }

  // -----------------------------------------------------------
  // LOADING STATE
  // -----------------------------------------------------------
  if (!billingChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // -----------------------------------------------------------
  // PRICING GRID
  // -----------------------------------------------------------
  return (
    <div className="min-h-screen bg-background">

      {/* ── Header ── */}
      <div className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-[11px] font-bold text-primary-foreground sm:size-8">
              N
            </div>
            <span className="text-sm font-semibold sm:text-base">NativPost</span>
          </div>
          {organization && (
            <span className="max-w-[140px] truncate text-xs text-muted-foreground sm:max-w-none">
              {organization.name}
            </span>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:py-14">

        {/* ── Hero ── */}
        <div className="mb-6 text-center sm:mb-8">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            Start your
            {' '}
            {FREE_TRIAL_DAYS}
            -day free trial
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            $0.00 due today. Cancel anytime. No hidden fees.
          </p>
        </div>

        {/* ── Trust badge ── */}
        <div className="mb-6 flex justify-center sm:mb-8">
          <div className="flex items-center gap-2 rounded-full border bg-emerald-50 px-4 py-2 text-xs text-emerald-700 sm:text-sm">
            <Check className="size-3.5 shrink-0" />
            {FREE_TRIAL_DAYS}
            {' '}
            days free — card required only to start your trial
          </div>
        </div>

        {/* ── Payment method toggle ── */}
        <div className="mb-6 flex flex-col items-center gap-3 sm:mb-8 sm:flex-row sm:justify-center">
          <span className="text-sm font-medium">Pay with:</span>
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg border p-1">
              <button
                type="button"
                onClick={() => setPaymentMethod('stripe')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${paymentMethod === 'stripe' ? 'bg-foreground text-background' : 'hover:bg-muted'}`}
              >
                Card (Stripe)
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('paystack')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${paymentMethod === 'paystack' ? 'bg-foreground text-background' : 'hover:bg-muted'}`}
              >
                Africa (Paystack)
              </button>
            </div>
          </div>
          {paymentMethod === 'stripe' && (
            <span className="text-center text-xs text-muted-foreground">
              Promo code? Enter it on the next page.
            </span>
          )}
        </div>

        {/* ── Error banner ── */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ── Pricing card ── */}
        <div className="rounded-2xl border bg-card p-4 sm:p-6 lg:p-8">

          {/* Inner header */}
          <div className="mb-6 text-center sm:mb-8">
            <span className="mb-3 inline-block rounded-full bg-[#cdf5f8] px-4 py-1.5 text-xs font-normal text-foreground">
              Simple, transparent pricing
            </span>
            <h2 className="mb-2 text-lg font-semibold tracking-tight sm:text-xl lg:text-2xl">
              Agency-quality content at a price your business can afford.
            </h2>
            <p className="mx-auto max-w-lg text-xs text-muted-foreground sm:text-sm">
              All plans include your personalised Brand Profile, AI content generation, and cross-platform publishing.
              One-time $5 setup fee on first subscription.
            </p>
          </div>

          {/* ── MOBILE: stacked accordion cards (hidden on lg+) ── */}
          <div className="space-y-3 lg:hidden">
            {VISIBLE_PLANS.map(plan => (
              <MobilePlanCard
                key={plan.id}
                plan={plan}
                isSelected={selectedPlan === plan.id}
                isPlanLoading={isLoading === plan.id}
                isLoading={isLoading}
                onSelect={() => setSelectedPlan(plan.id)}
                onSubscribe={() => handleSubscribe(plan.id)}
                trialDays={FREE_TRIAL_DAYS}
              />
            ))}
          </div>

          {/* ── DESKTOP: comparison table (hidden below lg) ── */}
          <div className="hidden lg:block">
            <div className="grid grid-cols-12 gap-5">

              {/* Feature label column */}
              <div className="col-span-3">
                <div className="h-[228px]" />
                <div>
                  <h3 className="mb-2 text-sm font-semibold">What's included</h3>
                  {FEATURE_ROWS.map(row => (
                    <div
                      key={row.label}
                      className="flex h-12 items-center border-b border-border/40 pr-4 text-sm text-muted-foreground last:border-b-0"
                    >
                      {row.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Plan columns */}
              {VISIBLE_PLANS.map((plan) => {
                const isSelected = selectedPlan === plan.id;
                const isPlanLoading = isLoading === plan.id;

                return (
                  <div key={plan.id} className="col-span-3">
                    <div
                      className={`relative overflow-hidden rounded-t-2xl px-5 py-6 ring-2 transition-all ${
                        isSelected ? 'ring-primary' : 'ring-transparent'
                      } ${plan.popular ? 'bg-foreground text-background' : 'bg-muted/60'}`}
                    >
                      {plan.popular && (
                        <div className="absolute -right-12 -top-16 size-40 rounded-full bg-primary/30 blur-3xl" />
                      )}
                      <div className="relative z-10">
                        <p className={`mb-1 text-sm font-medium ${plan.popular ? 'text-background/70' : 'text-muted-foreground'}`}>
                          {plan.name}
                          {plan.popular && <span className="ml-1.5 text-[11px]">— Most popular</span>}
                        </p>
                        <div className="flex items-baseline">
                          <span className={`text-3xl font-bold ${plan.popular ? 'text-background' : ''}`}>
                            $
                            {plan.priceUsd}
                          </span>
                          <span className={`ml-1 text-sm ${plan.popular ? 'text-background/60' : 'text-muted-foreground'}`}>
                            /mo
                          </span>
                        </div>
                        <p className={`mt-0.5 text-xs ${plan.popular ? 'text-background/50' : 'text-muted-foreground'}`}>
                          + $
                          {plan.setupFeeUsd}
                          {' '}
                          one-time setup
                        </p>
                      </div>

                      <div className="relative z-10 mt-4 space-y-2">
                        <button
                          type="button"
                          onClick={() => setSelectedPlan(plan.id)}
                          className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-4 py-2 text-xs font-medium transition-colors ${
                            isSelected
                              ? plan.popular
                                ? 'border-primary/60 bg-primary text-primary-foreground'
                                : 'border-primary bg-primary/10 text-primary'
                              : plan.popular
                                ? 'border-background/20 bg-background/10 text-background hover:bg-background/20'
                                : 'border-border bg-background text-foreground hover:bg-muted'
                          }`}
                        >
                          {isSelected && <Check className="size-3" />}
                          {isSelected ? 'Selected' : 'Select plan'}
                        </button>

                        {isSelected && (
                          <button
                            type="button"
                            onClick={() => handleSubscribe(plan.id)}
                            disabled={!!isLoading}
                            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                          >
                            {isPlanLoading
                              ? <Loader2 className="size-3.5 animate-spin" />
                              : <ChevronRight className="size-3.5" />}
                            {isPlanLoading ? 'Redirecting...' : `Start ${FREE_TRIAL_DAYS}-day trial`}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Feature value cells */}
                    <div className="rounded-b-2xl border border-t-0 bg-background">
                      {FEATURE_ROWS.map((row) => {
                        const value = row.render(plan);
                        return (
                          <div
                            key={row.label}
                            className="flex h-12 items-center justify-center border-b border-border/40 px-4 text-center last:border-b-0"
                          >
                            {typeof value === 'boolean' ? (
                              value
                                ? <Check className="size-4 text-emerald-500" />
                                : <span className="text-sm text-muted-foreground/30">—</span>
                            ) : (
                              <span className="text-sm font-medium text-muted-foreground">{value}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Enterprise CTA ── */}
          <div className="mt-8 text-center">
            <p className="text-sm text-muted-foreground">
              Need
              {' '}
              <strong className="font-semibold text-foreground">Agency</strong>
              {' '}
              or
              {' '}
              <strong className="font-semibold text-foreground">Enterprise</strong>
              {' '}
              with custom pricing?
              {' '}
              <a
                href="https://nativpost.com/contact-us"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2 hover:text-primary/80"
              >
                Contact us
                <ExternalLink className="size-3" />
              </a>
            </p>
          </div>
        </div>

        {/* ── Trust footer ── */}
        <div className="mt-6 flex flex-wrap justify-center gap-4 sm:gap-6">
          {['No setup hassle', 'Cancel anytime', 'Secure payment'].map(item => (
            <div key={item} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Check className="size-3 text-emerald-500" />
              {item}
            </div>
          ))}
        </div>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
          By continuing, you agree to our Terms of Service and Privacy Policy.
          Cancel anytime before your trial ends and you won't be charged.
        </p>
      </div>
    </div>
  );
}

export default function SubscribePage() {
  return (
    <Suspense
      fallback={(
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}
    >
      <SubscribeContent />
    </Suspense>
  );
}
