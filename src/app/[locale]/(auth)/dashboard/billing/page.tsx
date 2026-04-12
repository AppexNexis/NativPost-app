'use client';

import { useUser } from '@clerk/nextjs';
import {
  AlertCircle,
  Check,
  CreditCard,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

import { PageHeader } from '@/features/dashboard/PageHeader';
import { FREE_TRIAL_DAYS, SETUP_FEE_USD, VISIBLE_PLANS } from '@/lib/plans';

// -----------------------------------------------------------
// TYPES
// -----------------------------------------------------------
type BillingStatus = {
  plan: string;
  planStatus: string;
  isActive: boolean;
  isTrialing: boolean;
  trialDaysLeft: number;
  trialExpired: boolean;
  trialEndsAt: string | null;
  setupFeePaid: boolean;
  hasStripe: boolean;
  features: Record<string, unknown>;
  usage: {
    postsThisMonth: number;
    postsLimit: number;
    platformsLimit: number;
  };
};

// -----------------------------------------------------------
// FEATURE TABLE ROWS
// Keep in sync with what matters to buyers
// -----------------------------------------------------------
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
    render: (plan: typeof VISIBLE_PLANS[0]) => ({
      email: 'Email',
      priority_email: 'Priority email',
      live_chat: 'Live chat',
      dedicated_slack: 'Dedicated Slack',
    }[plan.features.supportLevel] || 'Email'),
  },
];

// -----------------------------------------------------------
// BILLING CONTENT
// -----------------------------------------------------------
function BillingContent() {
  const { user } = useUser();
  const searchParams = useSearchParams();
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'paystack'>('stripe');
  const [error, setError] = useState<string | null>(null);

  const success = searchParams.get('success') || searchParams.get('paystack_success');
  const cancelled = searchParams.get('cancelled');
  const successPlan = searchParams.get('plan');

  const loadBilling = useCallback(async () => {
    try {
      const res = await fetch('/api/billing/status');
      if (res.ok) {
        setBilling(await res.json());
      }
    } catch (err) {
      console.error('Failed to load billing:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBilling();
  }, [loadBilling]);

  const handleCheckout = async (planId: string) => {
    setCheckoutLoading(planId);
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
          setError(data.error || 'Failed to start checkout.');
        }
      } else {
        const email = user?.primaryEmailAddress?.emailAddress;
        if (!email) {
          setError('Could not find your email. Please use card payment.'); return;
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
          setError(data.error || 'Failed to start payment.');
        }
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleManage = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch('/api/billing/manage', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setError('Failed to open billing portal.');
    } finally {
      setPortalLoading(false);
    }
  };

  const trialDaysLeft = billing?.trialDaysLeft ?? 0;

  if (isLoading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      {/* Banners */}
      {success && (
        <div className="mb-6 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500">
            <Check className="size-3 text-white" />
          </div>
          {successPlan
            ? `Your ${VISIBLE_PLANS.find(p => p.id === successPlan)?.name ?? successPlan} plan is now active.`
            : 'Subscription activated successfully.'}
        </div>
      )}
      {cancelled && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertCircle className="size-4 shrink-0" />
          Checkout cancelled. No changes were made.
        </div>
      )}
      {billing?.planStatus === 'past_due' && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-500" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-700">Payment past due</p>
            <p className="mt-0.5 text-xs text-red-600">Your last payment failed. Update your payment method to keep your account active.</p>
          </div>
          {billing.hasStripe && (
            <button
              type="button"
              onClick={handleManage}
              disabled={portalLoading}
              className="shrink-0 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-60"
            >
              Fix payment
            </button>
          )}
        </div>
      )}
      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Current plan */}
      <div className="mb-8 rounded-xl border bg-card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <CreditCard className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">
                Current plan:
                {' '}
                <span className="capitalize text-emerald-600">
                  {billing?.planStatus === 'trialing'
                    ? `Free trial (${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} left)`
                    : VISIBLE_PLANS.find(p => p.id === billing?.plan)?.name ?? 'Starter'}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {billing?.planStatus === 'trialing'
                  ? `Subscribe before your trial ends to keep your content flowing.`
                  : `${billing?.usage.postsLimit === 999999 ? 'Unlimited' : billing?.usage.postsLimit} posts/mo · ${billing?.usage.platformsLimit === 99 ? 'All' : billing?.usage.platformsLimit} platforms`}
              </p>
            </div>
          </div>
          {billing?.planStatus === 'active' && billing.hasStripe && (
            <button
              type="button"
              onClick={handleManage}
              disabled={portalLoading}
              className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60"
            >
              {portalLoading ? <Loader2 className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
              Manage subscription
            </button>
          )}
        </div>

        {/* Trial progress */}
        {billing?.isTrialing && billing.trialEndsAt && (
          <div className="mt-4 border-t pt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Trial progress</span>
              <span className="font-medium">
                {trialDaysLeft}
                {' '}
                of
                {' '}
                {FREE_TRIAL_DAYS}
                {' '}
                days remaining
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-blue-500"
                style={{ width: `${Math.round(((FREE_TRIAL_DAYS - trialDaysLeft) / FREE_TRIAL_DAYS) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Payment method toggle */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">Pay with:</span>
        <div className="flex rounded-lg border p-1">
          <button
            type="button"
            onClick={() => setPaymentMethod('stripe')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              paymentMethod === 'stripe' ? 'bg-foreground text-background' : 'hover:bg-muted'
            }`}
          >
            Card (Stripe)
          </button>
          <button
            type="button"
            onClick={() => setPaymentMethod('paystack')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              paymentMethod === 'paystack' ? 'bg-foreground text-background' : 'hover:bg-muted'
            }`}
          >
            Africa (Paystack)
          </button>
        </div>
        {paymentMethod === 'stripe' && (
          <span className="text-xs text-muted-foreground">Promo code? Enter it on the next page.</span>
        )}
      </div>

      {/* Pricing grid — same column layout as original but wired to real data */}
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
            One-time $
            {SETUP_FEE_USD}
            {' '}
            setup fee on first subscription.
          </p>
        </div>

        {/* Desktop: label column + plan columns */}
        <div className="grid grid-cols-12 gap-3 lg:gap-5">

          {/* Feature label column — only on xl */}
          <div className="col-span-12 hidden xl:col-span-3 xl:block">
            <div className="h-[196px]" />
            {' '}
            {/* aligns with plan header height */}
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

          {/* Plan columns */}
          {VISIBLE_PLANS.map((plan) => {
            const isCurrent = billing?.plan === plan.id && billing?.planStatus === 'active';
            const isTrialingOnThis = billing?.isTrialing && billing.plan === plan.id;
            const isLoading = checkoutLoading === plan.id;

            return (
              <div key={plan.id} className="col-span-12 sm:col-span-6 xl:col-span-3">
                {/* Plan header */}
                <div className={`relative overflow-hidden rounded-t-2xl px-5 py-6 ${
                  plan.popular ? 'bg-foreground text-background' : 'bg-muted/60'
                }`}
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
                      {SETUP_FEE_USD}
                      {' '}
                      one-time setup
                    </p>
                  </div>

                  {/* CTA button */}
                  <button
                    type="button"
                    onClick={() => handleCheckout(plan.id)}
                    disabled={isCurrent || !!checkoutLoading}
                    className={`relative z-10 mt-5 flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60 ${
                      isCurrent
                        ? 'border bg-background/10 text-muted-foreground'
                        : plan.popular
                          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                          : 'border bg-background text-foreground hover:bg-muted'
                    }`}
                  >
                    {isLoading && <Loader2 className="size-3.5 animate-spin" />}
                    {isCurrent
                      ? 'Current plan'
                      : isTrialingOnThis
                        ? 'Subscribe'
                        : billing?.planStatus === 'active' && !isCurrent
                          ? (VISIBLE_PLANS.indexOf(plan) < VISIBLE_PLANS.findIndex(p => p.id === billing.plan)
                              ? 'Downgrade'
                              : 'Upgrade')
                          : billing?.isTrialing
                            ? 'Subscribe'
                            : 'Get started'}
                  </button>
                </div>

                {/* Feature rows */}
                <div className="rounded-b-2xl border border-t-0 bg-background">
                  {FEATURE_ROWS.map((row) => {
                    const value = row.render(plan);
                    return (
                      <div
                        key={row.label}
                        className="flex h-12 items-center justify-center border-b border-border/40 px-4 text-center last:border-b-0"
                      >
                        {/* On mobile/tablet: show label + value together */}
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

        {/* Enterprise CTA */}
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
            <Link
              href="https://nativpost.com/contact-us"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2 hover:text-primary/80"
            >
              Contact us
              <ExternalLink className="size-3" />
            </Link>
          </p>
        </div>
      </div>

      {/* Payment history */}
      <div className="mt-8">
        <h3 className="mb-4 text-base font-semibold">Payment history</h3>
        <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-dashed bg-card text-center">
          <div>
            <p className="text-sm font-medium text-muted-foreground">No payments yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Your payment history will appear here after your first billing cycle.
            </p>
            {billing?.hasStripe && billing.planStatus === 'active' && (
              <button
                type="button"
                onClick={handleManage}
                className="mt-3 text-xs text-primary underline"
              >
                View invoices in Stripe portal
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// -----------------------------------------------------------
// PAGE
// -----------------------------------------------------------
export default function BillingPage() {
  return (
    <>
      <PageHeader title="Billing" description="Manage your subscription and payment details." />
      <Suspense
        fallback={(
          <div className="flex min-h-[300px] items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}
      >
        <BillingContent />
      </Suspense>
    </>
  );
}
