'use client';

import {
  AlertCircle,
  Check,
  CreditCard,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { PageHeader } from '@/features/dashboard/PageHeader';

interface OrgBilling {
  plan: string;
  planStatus: string;
  postsPerMonth: number;
  platformsLimit: number;
  trialEndsAt: string | null;
  setupFeePaid: boolean;
}

const PLANS = [
  {
    id: 'starter', name: 'Starter', price: '$19', period: '/mo', setupFee: '$29',
    features: ['20 posts', '3 platforms', 'Basic', 'Templates', 'Self-approve'],
  },
  {
    id: 'growth', name: 'Growth', price: '$49', period: '/mo', setupFee: '$79', popular: true,
    features: ['40 posts', '5 platforms', 'Detailed', 'Custom', 'Self-approve'],
  },
  {
    id: 'pro', name: 'Pro', price: '$99', period: '/mo', setupFee: '$149',
    features: ['80 posts', 'All platforms', 'Premium', 'Premium custom', 'Our team reviews'],
  },
];

const FEATURE_LABELS = ['Posts per month', 'Social platforms', 'Brand Profile depth', 'Custom graphics', 'Human review'];

// -----------------------------------------------------------
// INNER COMPONENT — uses useSearchParams, must be inside Suspense
// -----------------------------------------------------------
function BillingContent() {
  const searchParams = useSearchParams();
  const [billing, setBilling] = useState<OrgBilling | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'paystack'>('stripe');

  const success = searchParams.get('success') || searchParams.get('paystack_success');
  const cancelled = searchParams.get('cancelled');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/brand-profile');
        if (res.ok) {
          // TODO: Create /api/billing/status endpoint
        }
      } catch (err) {
        console.error('Failed to load billing:', err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
    setBilling({
      plan: 'starter',
      planStatus: 'trialing',
      postsPerMonth: 20,
      platformsLimit: 3,
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      setupFeePaid: false,
    });
  }, []);

  const handleCheckout = async (planId: string) => {
    setCheckoutLoading(planId);
    try {
      const res = await fetch('/api/billing/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, paymentMethod }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Checkout failed:', err);
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
    } catch (err) {
      console.error('Portal failed:', err);
    } finally {
      setPortalLoading(false);
    }
  };

  const trialDaysLeft = billing?.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(billing.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  if (isLoading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      {/* Success/cancelled banners */}
      {success && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <Check className="size-4" />
          {' '}
          Subscription activated! Your plan has been upgraded.
        </div>
      )}
      {cancelled && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
          <AlertCircle className="size-4" />
          {' '}
          Checkout cancelled. No changes were made.
        </div>
      )}

      {/* Current plan banner */}
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
                <span className="capitalize text-[#16A34A]">
                  {billing?.planStatus === 'trialing'
                    ? `Free trial (${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} left)`
                    : `${billing?.plan || 'Starter'}`}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                {billing?.planStatus === 'trialing'
                  ? 'Upgrade anytime to keep your content flowing.'
                  : `${billing?.postsPerMonth} posts/mo · ${billing?.platformsLimit} platforms`}
              </p>
            </div>
          </div>
          {billing?.planStatus === 'active' && (
            <button
              onClick={handleManage}
              disabled={portalLoading}
              className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60"
            >
              {portalLoading ? <Loader2 className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
              Manage subscription
            </button>
          )}
        </div>
      </div>

      {/* Payment method toggle */}
      <div className="mb-6 flex items-center gap-3">
        <span className="text-sm font-medium">Pay with:</span>
        <div className="flex rounded-lg border p-1">
          <button
            onClick={() => setPaymentMethod('stripe')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              paymentMethod === 'stripe' ? 'bg-foreground text-background' : 'hover:bg-muted'
            }`}
          >
            Card (Stripe)
          </button>
          <button
            onClick={() => setPaymentMethod('paystack')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              paymentMethod === 'paystack' ? 'bg-foreground text-background' : 'hover:bg-muted'
            }`}
          >
            Africa (Paystack)
          </button>
        </div>
      </div>

      {/* Pricing grid */}
      <div className="rounded-2xl border bg-card p-5 sm:p-6 lg:p-8">
        <div className="mb-8 text-center">
          <span className="mb-3 inline-block rounded-full bg-[#cdf5f8] px-4 py-1.5 text-xs font-normal text-foreground">
            Simple, transparent pricing
          </span>
          <h2 className="mb-2 text-xl font-semibold tracking-tight sm:text-2xl">
            Agency-quality content at a price your business can afford.
          </h2>
          <p className="mx-auto max-w-lg text-sm text-muted-foreground">
            All plans include your personalized Brand Profile, anti-slop quality filter, and cross-platform publishing.
          </p>
        </div>

        <div className="grid grid-cols-12 gap-4 lg:gap-6">
          {/* Labels column */}
          <div className="col-span-12 hidden xl:col-span-3 xl:block">
            <div className="h-[180px]" />
            <div>
              <h3 className="mb-2 text-sm font-semibold">What&apos;s included</h3>
              {FEATURE_LABELS.map((label) => (
                <div key={label} className="flex h-14 items-center border-b border-border/50 pr-4 text-sm text-muted-foreground">
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* Plan columns */}
          {PLANS.map((plan) => {
            const isCurrent = billing?.plan === plan.id && billing?.planStatus !== 'trialing';
            return (
              <div key={plan.id} className="col-span-12 sm:col-span-6 xl:col-span-3">
                <div className={`relative mb-0 overflow-hidden rounded-t-2xl px-5 py-6 ${plan.popular ? 'bg-foreground text-background' : 'bg-muted/60'}`}>
                  {plan.popular && <div className="absolute -right-12 -top-16 size-40 rounded-full bg-primary/30 blur-3xl" />}
                  <div className="relative z-10">
                    <p className={`mb-2 text-sm font-medium ${plan.popular ? 'text-background/60' : ''}`}>
                      {plan.name}
                      {plan.popular && <span className="ml-2 text-xs">— Most Popular</span>}
                    </p>
                    <div className="flex items-baseline">
                      <span className={`text-3xl font-bold ${plan.popular ? 'text-background' : ''}`}>{plan.price}</span>
                      <span className={`ml-1 text-sm ${plan.popular ? 'text-background/60' : 'text-muted-foreground'}`}>{plan.period}</span>
                    </div>
                    <p className={`mt-1 text-xs ${plan.popular ? 'text-background/50' : 'text-muted-foreground'}`}>
                      +
                      {' '}
                      {plan.setupFee}
                      {' '}
                      one-time setup fee
                    </p>
                  </div>
                  <button
                    onClick={() => handleCheckout(plan.id)}
                    disabled={isCurrent || !!checkoutLoading}
                    className={`relative z-10 mt-5 flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                      isCurrent
                        ? 'border bg-background/10 text-muted-foreground opacity-60'
                        : plan.popular
                          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                          : 'border bg-background text-foreground hover:bg-muted'
                    }`}
                  >
                    {checkoutLoading === plan.id && <Loader2 className="size-3 animate-spin" />}
                    {isCurrent ? 'Current plan' : 'Upgrade'}
                  </button>
                </div>
                <div className="rounded-b-2xl border border-t-0 bg-background">
                  {plan.features.map((value, i) => (
                    <div key={i} className="flex h-14 items-center justify-center border-b border-border/50 px-4 text-center text-sm last:border-b-0">
                      <span className="mr-2 text-muted-foreground xl:hidden">{FEATURE_LABELS[i]}</span>
                      <span className="font-medium text-muted-foreground">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 text-center">
          <p className="text-sm text-muted-foreground">
            Need
            {' '}
            <strong className="font-semibold text-foreground">Agency ($199/mo)</strong>
            {' '}
            or
            {' '}
            <strong className="font-semibold text-foreground">Enterprise (custom)</strong>
            {' '}
            plans?
            {' '}
            <Link href="https://nativpost.com/contact-us"   target="_blank"  rel="noopener noreferrer"  className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2 hover:text-primary/80">
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
            <p className="mt-1 text-xs text-muted-foreground">Your payment history will appear here after your first billing cycle.</p>
          </div>
        </div>
      </div>
    </>
  );
}

// -----------------------------------------------------------
// PAGE EXPORT — wraps content in Suspense
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