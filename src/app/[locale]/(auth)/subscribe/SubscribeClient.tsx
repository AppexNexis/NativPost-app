'use client';

import { useOrganization, UserButton, useUser } from '@clerk/nextjs';
import {
  Check,
  ChevronRight,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

import { FREE_TRIAL_DAYS, VISIBLE_PLANS } from '@/lib/plans';
// import { Logo } from '@/templates/Logo';

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
// MOBILE PLAN CARD
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
      className={`overflow-hidden rounded-2xl border-2 transition-all duration-200 ${isSelected
        ? 'border-foreground shadow-lg'
        : 'border-border hover:border-foreground/30'
      }`}
    >
      {/* Card header */}
      <div className={`p-5 ${plan.popular ? 'bg-foreground text-background' : 'bg-muted/40'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className={`text-sm font-semibold ${plan.popular ? 'text-background' : ''}`}>
                {plan.name}
              </p>
              {plan.popular && (
                <span className="rounded-full bg-background/20 px-2 py-0.5 text-[10px] font-semibold text-background">
                  Most popular
                </span>
              )}
            </div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className={`text-2xl font-bold tracking-tight ${plan.popular ? 'text-background' : ''}`}>
                $
                {plan.priceUsd}
              </span>
              <span className={`text-xs ${plan.popular ? 'text-background/60' : 'text-muted-foreground'}`}>/mo</span>
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
            className={`shrink-0 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${isSelected
              ? plan.popular
                ? 'bg-background text-foreground'
                : 'bg-foreground text-background'
              : plan.popular
                ? 'border border-background/30 bg-background/10 text-background hover:bg-background/20'
                : 'border border-border bg-background text-foreground hover:bg-muted'
            }`}
          >
            {isSelected ? (
              <span className="flex items-center gap-1">
                <Check className="size-3" />
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
            className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-3 text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60 ${plan.popular
              ? 'bg-background text-foreground'
              : 'bg-foreground text-background'
            }`}
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
                <span className="ml-3 shrink-0">
                  {typeof value === 'boolean'
                    ? value
                      ? <Check className="size-4 text-emerald-500" />
                      : <span className="text-sm text-muted-foreground/30">—</span>
                    : <span className="text-sm font-medium">{value}</span>}
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
            router.replace(redirectPath); return;
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
      // Handle Paystack return with reference — poll until confirmed
      if (paystackSuccess && paystackReference) {
        if (mounted) {
          setIsPolling(true);
          setBillingChecked(true);
        }
        pollBillingStatus(0);
        return;
      }

      // No special return params — just mark as checked and show the page.
      // Billing gate is handled server-side in page.tsx before this renders.
      if (mounted) {
        setBillingChecked(true);
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
          setError('Could not find your email address. Please try card payment.'); return;
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

  // ── Polling state ──
  if (isPolling) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <Loader2 className="size-8 animate-spin text-foreground" />
        <p className="text-sm font-semibold">Confirming your payment...</p>
        <p className="max-w-xs text-center text-xs text-muted-foreground">
          This usually takes a few seconds. Please don't close this page.
        </p>
        {pollAttempts > 5 && (
          <p className="text-xs text-muted-foreground">Taking longer than expected. Still checking...</p>
        )}
      </div>
    );
  }

  // ── Loading state ──
  if (!billingChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">

      {/* ── Top nav ── */}
      <div className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          {/* Logo */}
          <Image
            src="/assets/images/shared/main-logo.svg"
            alt="Main Logo"
            width={100}
            height={100}
          />

          {/* Right side: org name + user button */}
          <div className="flex items-center gap-3">
            {organization && (
              <span className="max-w-[120px] truncate text-xs text-muted-foreground sm:max-w-[220px]">
                {organization.name}
              </span>
            )}
            <UserButton
              userProfileMode="navigation"
              userProfileUrl="/dashboard/user-profile"
              appearance={{
                elements: {
                  rootBox: 'px-1 py-1',
                },
              }}
            />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:py-16">

        {/* ── Hero ── */}
        <div className="mb-8 text-center">
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Get started
          </p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
            Start your
            {' '}
            {FREE_TRIAL_DAYS}
            -day free trial
          </h1>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            $0.00 due today. Cancel anytime before the trial ends and you won't be charged.
          </p>
        </div>

        {/* ── Trust strip ── */}
        <div className="mb-8 flex flex-wrap justify-center gap-6">
          {['No setup hassle', `${FREE_TRIAL_DAYS} days free`, 'Cancel anytime', 'Secure payment'].map(item => (
            <div key={item} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                <Check className="size-2.5 text-emerald-600" />
              </div>
              {item}
            </div>
          ))}
        </div>

        {/* ── Payment method + promo ── */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">Pay with:</span>
            <div className="flex rounded-lg border bg-muted/50 p-0.5">
              <button
                type="button"
                onClick={() => setPaymentMethod('stripe')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${paymentMethod === 'stripe' ? 'border bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Card (Stripe)
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('paystack')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${paymentMethod === 'paystack' ? 'border bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Africa (Paystack)
              </button>
            </div>
          </div>
          {paymentMethod === 'stripe' && (
            <p className="text-xs text-muted-foreground">Have a promo code? Enter it on the next page.</p>
          )}
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20">
            {error}
          </div>
        )}

        {/* ── MOBILE: stacked cards ── */}
        <div className="space-y-4 lg:hidden">
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

        {/* ── DESKTOP: comparison table ── */}
        <div className="hidden lg:block">
          <div className="grid grid-cols-12 gap-4">

            {/* Feature label column */}
            <div className="col-span-3">
              {/* Spacer matches plan header height */}
              <div className="h-[218px]" />
              <div className="pr-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  What's included
                </p>
                {FEATURE_ROWS.map(row => (
                  <div
                    key={row.label}
                    className="flex h-11 items-center border-b border-border/40 text-sm text-muted-foreground last:border-b-0"
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
                  {/* Plan header card */}
                  <div
                    className={`relative overflow-hidden rounded-t-2xl p-5 transition-all ${plan.popular
                      ? 'bg-foreground text-background'
                      : 'bg-muted/40'
                    } ${isSelected ? 'ring-2 ring-foreground ring-offset-0' : ''}`}
                  >
                    {plan.popular && (
                      <div className="absolute -right-10 -top-10 size-32 rounded-full bg-white/10 blur-2xl" />
                    )}
                    <div className="relative z-10">
                      {plan.popular && (
                        <span className="mb-3 inline-block rounded-full bg-background/20 px-2.5 py-0.5 text-[10px] font-semibold text-background">
                          Most popular
                        </span>
                      )}
                      <p className={`text-sm font-semibold ${plan.popular ? 'text-background' : ''}`}>
                        {plan.name}
                      </p>
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className={`text-3xl font-bold tracking-tight ${plan.popular ? 'text-background' : ''}`}>
                          $
                          {plan.priceUsd}
                        </span>
                        <span className={`text-sm ${plan.popular ? 'text-background/60' : 'text-muted-foreground'}`}>/mo</span>
                      </div>
                      <p className={`mt-0.5 text-xs ${plan.popular ? 'text-background/50' : 'text-muted-foreground'}`}>
                        + $
                        {plan.setupFeeUsd}
                        {' '}
                        one-time setup
                      </p>

                      {/* Select / Subscribe buttons */}
                      <div className="mt-4 space-y-2">
                        <button
                          type="button"
                          onClick={() => setSelectedPlan(plan.id)}
                          className={`flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-all active:scale-[0.98] ${isSelected
                            ? plan.popular
                              ? 'bg-background text-foreground'
                              : 'bg-foreground text-background'
                            : plan.popular
                              ? 'border border-background/30 bg-background/10 text-background hover:bg-background/20'
                              : 'border border-border bg-background text-foreground hover:bg-muted'
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
                            className={`flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60 ${plan.popular
                              ? 'bg-background text-foreground'
                              : 'bg-foreground text-background'
                            }`}
                          >
                            {isPlanLoading
                              ? <Loader2 className="size-3.5 animate-spin" />
                              : <ChevronRight className="size-3.5" />}
                            {isPlanLoading ? 'Redirecting...' : `Start ${FREE_TRIAL_DAYS}-day trial`}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Feature value cells */}
                  <div className={`rounded-b-2xl border border-t-0 bg-background ${isSelected ? 'ring-t-0 ring-2 ring-foreground' : ''}`}>
                    {FEATURE_ROWS.map((row) => {
                      const value = row.render(plan);
                      return (
                        <div
                          key={row.label}
                          className="flex h-11 items-center justify-center border-b border-border/40 px-4 text-center last:border-b-0"
                        >
                          {typeof value === 'boolean'
                            ? value
                              ? (
                                  <div className="flex size-5 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                                    <Check className="size-3 text-emerald-600 dark:text-emerald-400" />
                                  </div>
                                )
                              : <span className="text-base text-muted-foreground/25">—</span>
                            : <span className="text-sm font-medium text-foreground">{value}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Enterprise ── */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-1.5 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          <span>Need Agency or Enterprise with custom pricing?</span>
          <a
            href="https://nativpost.com/contact-us"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2 hover:opacity-70"
          >
            Contact us
            <ExternalLink className="size-3" />
          </a>
        </div>

        {/* ── Legal footer ── */}
        <p className="mt-8 text-center text-[11px] leading-relaxed text-muted-foreground">
          By continuing, you agree to our Terms of Service and Privacy Policy.
          Cancel anytime before your trial ends and you won't be charged.
        </p>
      </div>
    </div>
  );
}

export default function SubscribeClient() {
  return (
    <Suspense
      fallback={(
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}
    >
      <SubscribeContent />
    </Suspense>
  );
}
