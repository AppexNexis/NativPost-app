'use client';

import { useUser } from '@clerk/nextjs';
import {
  AlertCircle,
  Check,
  ChevronRight,
  ExternalLink,
  Loader2,
  X,
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
  hasPaystack: boolean;
  features: Record<string, unknown>;
  usage: {
    postsThisMonth: number;
    postsLimit: number;
    platformsLimit: number;
  };
};

// -----------------------------------------------------------
// FEATURE ROWS
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
    }[plan.features.supportLevel as string] || 'Email'),
  },
];

// -----------------------------------------------------------
// STATUS BADGE
// -----------------------------------------------------------
function StatusBadge({ status, isTrialing }: { status: string; isTrialing: boolean }) {
  if (isTrialing) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
        <span className="size-1.5 rounded-full bg-blue-500" />
        Trial
      </span>
    );
  }
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Active
      </span>
    );
  }
  if (status === 'past_due') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
        <span className="size-1.5 rounded-full bg-red-500" />
        Past due
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      <span className="size-1.5 rounded-full bg-muted-foreground/50" />
      Inactive
    </span>
  );
}

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
  const currentPlan = VISIBLE_PLANS.find(p => p.id === billing?.plan);
  const currentPlanIndex = VISIBLE_PLANS.findIndex(p => p.id === billing?.plan);

  if (isLoading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* ── Banners ── */}
      {success && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400">
          <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500">
            <Check className="size-3 text-white" />
          </div>
          {successPlan
            ? `Your ${VISIBLE_PLANS.find(p => p.id === successPlan)?.name ?? successPlan} plan is now active.`
            : 'Subscription activated successfully.'}
        </div>
      )}
      {cancelled && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-900/20">
          <AlertCircle className="size-4 shrink-0" />
          Checkout cancelled. No changes were made.
        </div>
      )}
      {billing?.planStatus === 'past_due' && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-500" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-700 dark:text-red-400">Payment past due</p>
            <p className="mt-0.5 text-xs text-red-600 dark:text-red-500">
              Your last payment failed. Update your payment method to keep your account active.
            </p>
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
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20">
          <X className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Current Plan Card ── */}
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="border-b bg-muted/30 px-6 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">
                  {currentPlan?.name ?? 'Starter'}
                  {' '}
                  Plan
                </p>
                <StatusBadge status={billing?.planStatus ?? 'inactive'} isTrialing={billing?.isTrialing ?? false} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {billing?.isTrialing
                  ? `Trial ends ${new Date(billing.trialEndsAt!).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
                  : `${billing?.usage.postsLimit === 999999 ? 'Unlimited' : billing?.usage.postsLimit} posts/mo · ${billing?.usage.platformsLimit === 99 ? 'All' : billing?.usage.platformsLimit} platforms`}
              </p>
            </div>
            {billing?.planStatus === 'active' && billing.hasStripe && (
              <button
                type="button"
                onClick={handleManage}
                disabled={portalLoading}
                className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60"
              >
                {portalLoading ? <Loader2 className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
                Manage subscription
              </button>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 divide-x sm:grid-cols-4">
          <div className="px-6 py-4">
            <p className="text-xs text-muted-foreground">Posts used this month</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {billing?.usage.postsThisMonth ?? 0}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                /
                {' '}
                {billing?.usage.postsLimit === 999999 ? '∞' : (billing?.usage.postsLimit ?? 0)}
              </span>
            </p>
            {/* Explain trial limit discrepancy */}
            {billing?.isTrialing && billing.plan !== 'starter' && (
              <p className="mt-1 text-[11px] leading-tight text-muted-foreground">
                Starter limits apply during trial
              </p>
            )}
          </div>
          <div className="px-6 py-4">
            <p className="text-xs text-muted-foreground">Platforms</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {billing?.usage.platformsLimit === 99 ? '∞' : (billing?.usage.platformsLimit ?? 0)}
            </p>
            {billing?.isTrialing && billing.plan !== 'starter' && (
              <p className="mt-1 text-[11px] leading-tight text-muted-foreground">
                Unlocks after subscribing
              </p>
            )}
          </div>
          <div className="border-t px-6 py-4 sm:border-t-0">
            <p className="text-xs text-muted-foreground">Plan price</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              $
              {currentPlan?.priceUsd ?? 0}
              <span className="ml-1 text-sm font-normal text-muted-foreground">/mo</span>
            </p>
          </div>
          <div className="border-t px-6 py-4 sm:border-t-0">
            <p className="text-xs text-muted-foreground">Setup fee</p>
            <p className="mt-1 text-xl font-semibold">
              {billing?.setupFeePaid
                ? <span className="text-emerald-600">Paid</span>
                : (
                    <span className="text-muted-foreground">
                      $
                      {SETUP_FEE_USD}
                      {' '}
                      due
                    </span>
                  )}
            </p>
          </div>
        </div>

        {/* Trial note explaining limits */}
        {billing?.isTrialing && billing.plan !== 'starter' && (
          <div className="border-t bg-blue-50/50 px-6 py-3 dark:bg-blue-900/10">
            <p className="text-xs text-blue-700 dark:text-blue-400">
              <strong className="font-semibold">Trial note:</strong>
              {' '}
              During your
              {` ${FREE_TRIAL_DAYS}-day trial, `}
              {' '}
              access is limited to Starter plan features (15 posts, 3 platforms) regardless of your selected plan. Your full
              {` ${currentPlan?.name}`}
              {' '}
              limits unlock the moment you subscribe.
            </p>
          </div>
        )}

        {/* Trial progress bar */}
        {billing?.isTrialing && billing.trialEndsAt && (
          <div className="border-t px-6 py-4">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Trial progress</span>
              <span className="font-semibold">
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
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{ width: `${Math.round(((FREE_TRIAL_DAYS - trialDaysLeft) / FREE_TRIAL_DAYS) * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Subscribe before your trial ends to keep your content flowing without interruption.
            </p>
          </div>
        )}
      </div>

      {/* ── Plans Section ── */}
      <div>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Available Plans</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              All plans include a one-time $
              {SETUP_FEE_USD}
              {' '}
              setup fee on first subscription.
            </p>
          </div>
          {/* Payment method toggle */}
          <div className="flex flex-col gap-1.5 sm:items-end">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Pay with:</span>
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
              <span className="text-[11px] text-muted-foreground">Have a promo code? Enter it on the next page.</span>
            )}
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {VISIBLE_PLANS.map((plan, idx) => {
            const isCurrent = billing?.plan === plan.id && billing?.planStatus === 'active';
            const isTrialingOnThis = billing?.isTrialing && billing.plan === plan.id;
            const isLoadingThis = checkoutLoading === plan.id;
            const isAboveCurrent = idx > currentPlanIndex;

            let ctaLabel = 'Get started';
            if (isCurrent) {
              ctaLabel = 'Current plan';
            } else if (isTrialingOnThis) {
              ctaLabel = 'Subscribe now';
            } else if (billing?.planStatus === 'active' && !isCurrent) {
              ctaLabel = isAboveCurrent ? 'Upgrade' : 'Downgrade';
            } else if (billing?.isTrialing) {
              ctaLabel = 'Subscribe now';
            }

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-2xl border transition-shadow ${plan.popular
                  ? 'border-foreground shadow-lg'
                  : isTrialingOnThis
                    ? 'border-blue-300 shadow-md dark:border-blue-700'
                    : 'border-border hover:shadow-md'
                }`}
              >
                {/* Top label chips */}
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="whitespace-nowrap rounded-full border border-foreground bg-foreground px-3 py-0.5 text-[10px] font-semibold text-background">
                      Most popular
                    </span>
                  </div>
                )}
                {isTrialingOnThis && !plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="whitespace-nowrap rounded-full border border-blue-300 bg-blue-50 px-3 py-0.5 text-[10px] font-semibold text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      Your trial plan
                    </span>
                  </div>
                )}
                {isCurrent && !plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="whitespace-nowrap rounded-full border border-emerald-300 bg-emerald-50 px-3 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                      Your plan
                    </span>
                  </div>
                )}

                {/* Plan header */}
                <div className={`rounded-t-2xl p-5 ${plan.popular ? 'bg-foreground text-background' : 'bg-muted/30'}`}>
                  <p className={`mb-3 text-sm font-semibold ${plan.popular ? 'text-background' : ''}`}>
                    {plan.name}
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-3xl font-bold tracking-tight ${plan.popular ? 'text-background' : ''}`}>
                      $
                      {plan.priceUsd}
                    </span>
                    <span className={`text-sm ${plan.popular ? 'text-background/60' : 'text-muted-foreground'}`}>/mo</span>
                  </div>
                  <p className={`mt-0.5 text-xs ${plan.popular ? 'text-background/50' : 'text-muted-foreground'}`}>
                    + $
                    {SETUP_FEE_USD}
                    {' '}
                    one-time setup
                  </p>
                </div>

                {/* Features */}
                <div className="flex flex-1 flex-col gap-2.5 p-5">
                  {FEATURE_ROWS.map((row) => {
                    const value = row.render(plan);
                    if (typeof value === 'boolean' && !value) {
                      return null;
                    }
                    return (
                      <div key={row.label} className="flex items-start gap-2.5 text-sm">
                        <div className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                          <Check className="size-2.5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <span className="text-muted-foreground">
                          {typeof value === 'boolean' ? row.label : (
                            <>
                              <strong className="font-medium text-foreground">{value}</strong>
                              {' '}
                              {row.label.toLowerCase()}
                            </>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* CTA */}
                <div className="p-5 pt-0">
                  <button
                    type="button"
                    onClick={() => handleCheckout(plan.id)}
                    disabled={isCurrent || !!checkoutLoading}
                    className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all disabled:opacity-60 ${isCurrent
                      ? 'cursor-default bg-muted text-muted-foreground'
                      : plan.popular
                        ? 'bg-foreground text-background hover:opacity-90 active:scale-[0.98]'
                        : 'border bg-background text-foreground hover:bg-muted active:scale-[0.98]'
                    }`}
                  >
                    {isLoadingThis && <Loader2 className="size-3.5 animate-spin" />}
                    {ctaLabel}
                    {!isCurrent && !isLoadingThis && <ChevronRight className="size-3.5" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Enterprise */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          <span>Need Agency or Enterprise with custom pricing?</span>
          <Link
            href="https://nativpost.com/contact-us"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-2 hover:opacity-70"
          >
            Contact us
            <ExternalLink className="size-3" />
          </Link>
        </div>
      </div>

      {/* ── Payment History ── */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Payment History</h2>
          {billing?.hasStripe && billing.planStatus === 'active' && (
            <button
              type="button"
              onClick={handleManage}
              disabled={portalLoading}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary underline underline-offset-2 hover:opacity-70 disabled:opacity-50"
            >
              {portalLoading ? <Loader2 className="size-3 animate-spin" /> : <ExternalLink className="size-3" />}
              View invoices
            </button>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="grid grid-cols-3 border-b bg-muted/30 px-6 py-3 text-xs font-medium text-muted-foreground sm:grid-cols-4">
            <span>Date</span>
            <span>Description</span>
            <span className="hidden sm:block">Method</span>
            <span className="text-right">Amount</span>
          </div>
          <div className="flex min-h-[140px] flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <p className="text-sm font-medium text-muted-foreground">No payments yet</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Your payment history will appear here after your first billing cycle.
              {billing?.hasPaystack
                ? ' Payment receipts for Paystack transactions are sent to your email address.'
                : ''}
            </p>
          </div>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          {billing?.hasStripe && (
            <>
              <strong className="font-medium">Stripe:</strong>
              {' '}
              Full invoice history is available via the billing portal.
              {' '}
            </>
          )}
          {billing?.hasPaystack && (
            <>
              <strong className="font-medium">Paystack:</strong>
              {' '}
              A payment receipt is sent to your email after every successful transaction.
            </>
          )}
        </p>
      </div>
    </div>
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
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
      >
        <BillingContent />
      </Suspense>
    </>
  );
}
