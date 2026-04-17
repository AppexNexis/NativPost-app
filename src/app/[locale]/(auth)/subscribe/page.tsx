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
// INNER PAGE CONTENT
// -----------------------------------------------------------
function SubscribeContent() {
  const { user } = useUser();
  const { organization } = useOrganization();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/dashboard';

  // Payment callback params
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

  const MAX_POLL_ATTEMPTS = 10; // 10 × 2s = 20s max wait
  const POLL_INTERVAL_MS = 2000;

  // -----------------------------------------------------------
  // Poll billing status until trial is active, then redirect
  // -----------------------------------------------------------
  // const pollBillingStatus_ = useCallback(async (attempt: number) => {
  //   if (attempt >= MAX_POLL_ATTEMPTS) {
  //     // Webhook took too long — redirect anyway, dashboard gate
  //     // will re-check and the webhook will likely have fired by then
  //     console.warn('[Subscribe] Polling timed out, redirecting optimistically');
  //     router.replace(`${redirectPath}?paystack_success=true&plan=${returnedPlan ?? ''}`);
  //     return;
  //   }

  //   try {
  //     const res = await fetch('/api/billing/status', { cache: 'no-store' });
  //     if (res.ok) {
  //       const billing = await res.json();
  //       const isActive = billing?.isActive;
  //       const isTrialing = billing?.isTrialing;
  //       const trialExpired = billing?.trialExpired;

  //       if ((isActive || isTrialing) && !trialExpired) {
  //         // Webhook has fired and DB is updated — redirect to dashboard
  //         router.replace(`${redirectPath}?paystack_success=true&plan=${returnedPlan ?? ''}`);
  //         return;
  //       }
  //     }
  //   } catch {
  //     // Network error — keep polling
  //   }

  //   setPollAttempts(attempt + 1);
  //   pollTimer.current = setTimeout(() => pollBillingStatus(attempt + 1), POLL_INTERVAL_MS);
  // }, [redirectPath, returnedPlan, router]);

  const pollBillingStatus = useCallback(async (attempt: number) => {
    if (attempt >= MAX_POLL_ATTEMPTS) {
      console.warn('[Subscribe] Polling timed out, redirecting optimistically');
      router.replace(redirectPath);
      return;
    }

    try {
    // First attempt: try to verify directly via our new verify endpoint
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

      // Subsequent attempts: poll billing status (webhook may have fired)
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

  // -----------------------------------------------------------
  // On mount: handle paystack callback OR check existing billing
  // -----------------------------------------------------------
  useEffect(() => {
    let mounted = true;

    async function init() {
      // CASE 1: Returning from Paystack payment
      if (paystackSuccess && paystackReference) {
        if (mounted) {
          setIsPolling(true);
          setBillingChecked(true); // show polling UI, not the pricing grid
        }
        pollBillingStatus(0);
        return;
      }

      // CASE 2: Normal visit — check if already subscribed
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
        const isActive = billing?.isActive;
        const isTrialing = billing?.isTrialing;
        const trialExpired = billing?.trialExpired;

        if ((isActive || isTrialing) && !trialExpired) {
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
  // POLLING STATE — shown after Paystack redirect
  // -----------------------------------------------------------
  if (isPolling) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm font-medium">Confirming your payment...</p>
        <p className="text-xs text-muted-foreground">
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
  // LOADING STATE — initial billing check
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
      {/* Header */}
      <div className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between p-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
              N
            </div>
            <span className="font-semibold">NativPost</span>
          </div>
          {organization && (
            <span className="text-xs text-muted-foreground">{organization.name}</span>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Start your
            {' '}
            {FREE_TRIAL_DAYS}
            -day free trial
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            $0.00 due today. Cancel anytime. No hidden fees.
          </p>
        </div>

        <div className="mb-8 flex justify-center">
          <div className="flex items-center gap-2 rounded-full border bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
            <Check className="size-4" />
            {FREE_TRIAL_DAYS}
            {' '}
            days free — card required only to start your trial
          </div>
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
          <span className="text-sm font-medium">Pay with:</span>
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
          {paymentMethod === 'stripe' && (
            <span className="text-xs text-muted-foreground">Promo code? Enter it on the next page.</span>
          )}
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="rounded-2xl border bg-card p-5 sm:p-6 lg:p-8">
          <div className="mb-8 text-center">
            <span className="mb-3 inline-block rounded-full bg-[#cdf5f8] px-4 py-1.5 text-xs font-normal text-foreground">
              Simple, transparent pricing
            </span>
            <h2 className="mb-2 text-xl font-semibold tracking-tight sm:text-2xl">
              Agency-quality content at a price your business can afford.
            </h2>
            <p className="mx-auto max-w-lg text-sm text-muted-foreground">
              All plans include your personalised Brand Profile, AI content generation, and cross-platform publishing.
              One-time $5 setup fee on first subscription.
            </p>
          </div>

          <div className="grid grid-cols-12 gap-3 lg:gap-5">
            <div className="col-span-12 hidden xl:col-span-3 xl:block">
              <div className="h-[220px]" />
              <div>
                <h3 className="mb-2 text-sm font-semibold">What&apos;s included</h3>
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

            {VISIBLE_PLANS.map((plan) => {
              const isSelected = selectedPlan === plan.id;
              const isPlanLoading = isLoading === plan.id;

              return (
                <div key={plan.id} className="col-span-12 sm:col-span-6 xl:col-span-3">
                  <div
                    className={`relative overflow-hidden rounded-t-2xl px-5 py-6 ring-2 transition-all ${isSelected ? 'ring-primary' : 'ring-transparent'
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
                        className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-4 py-2 text-xs font-medium transition-colors ${isSelected
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
                          {isPlanLoading ? 'Redirecting...' : `Start ${FREE_TRIAL_DAYS}-day free trial`}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="rounded-b-2xl border border-t-0 bg-background">
                    {FEATURE_ROWS.map((row) => {
                      const value = row.render(plan);
                      return (
                        <div
                          key={row.label}
                          className="flex h-12 items-center justify-center border-b border-border/40 px-4 text-center last:border-b-0"
                        >
                          <span className="mr-2 text-xs text-muted-foreground xl:hidden">
                            {row.label}
                            :
                          </span>
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

        <div className="mt-6 flex flex-wrap justify-center gap-6">
          {['No setup hassle', 'Cancel anytime', 'Secure payment'].map(item => (
            <div key={item} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Check className="size-3 text-emerald-500" />
              {item}
            </div>
          ))}
        </div>

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
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
