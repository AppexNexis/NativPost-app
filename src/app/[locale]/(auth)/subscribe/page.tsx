'use client';

import { useOrganization, useUser } from '@clerk/nextjs';
import {
  Check,
  ChevronRight,
  Loader2,
  X,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { FREE_TRIAL_DAYS, type PlanConfig, VISIBLE_PLANS } from '@/lib/plans';

// -----------------------------------------------------------
// TYPES
// -----------------------------------------------------------
type PaymentMethod = 'stripe' | 'paystack';

// -----------------------------------------------------------
// CONFIG
// -----------------------------------------------------------
const FEATURE_ROWS: {
  label: string;
  key: keyof PlanConfig['features'];
  format?: (v: unknown) => string;
}[] = [
  {
    label: 'Posts per month',
    key: 'postsPerMonth',
    format: v => v === -1 ? 'Unlimited' : String(v),
  },
  {
    label: 'Social platforms',
    key: 'platformsLimit',
    format: v => v === -1 ? 'All platforms' : `Up to ${v}`,
  },
  {
    label: 'Brand profiles',
    key: 'brandProfilesLimit',
    format: v => v === -1 ? 'Unlimited' : String(v),
  },
  {
    label: 'Team members',
    key: 'teamMembersLimit',
    format: v => v === -1 ? 'Unlimited' : String(v),
  },
  { label: 'Image posts', key: 'imagePosts' },
  { label: 'Carousel posts', key: 'carouselPosts' },
  { label: 'Video posts + generation', key: 'videoGeneration' },
  { label: 'Content modes', key: 'contentModes' },
  { label: 'Post enrichment', key: 'postEnrichment' },
  { label: 'Human content review', key: 'humanReview' },
  { label: 'Analytics sync', key: 'analyticsSync' },
  { label: 'API access', key: 'apiAccess' },
];

const SUPPORT_LABELS: Record<string, string> = {
  email: 'Email',
  priority_email: 'Priority email',
  live_chat: 'Live chat',
  dedicated_slack: 'Dedicated Slack',
};

function formatFeatureValue(plan: PlanConfig, row: typeof FEATURE_ROWS[0]): string | boolean {
  const value = plan.features[row.key];
  if (row.format) {
    return row.format(value);
  }
  return value as boolean;
}

// -----------------------------------------------------------
// PLAN CARD
// -----------------------------------------------------------
function PlanCard({
  plan,
  isSelected,
  onSelect,
}: {
  plan: PlanConfig;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border-2 text-left transition-all ${
        isSelected
          ? 'border-primary bg-primary/5 ring-4 ring-primary/10'
          : 'border-border hover:border-muted-foreground/40'
      } ${plan.popular ? 'relative' : ''}`}
    >
      {plan.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground">
            Most popular
          </span>
        </div>
      )}

      <div className={`rounded-t-2xl p-5 ${plan.popular ? 'bg-foreground text-background' : 'bg-muted/40'}`}>
        <div className="mb-1 flex items-center justify-between">
          <span className={`text-sm font-semibold ${plan.popular ? 'text-background' : ''}`}>
            {plan.name}
          </span>
          {isSelected && (
            <div className="flex size-5 items-center justify-center rounded-full bg-primary">
              <Check className="size-3 text-white" />
            </div>
          )}
        </div>
        <div className="flex items-baseline gap-1">
          <span className={`text-3xl font-bold ${plan.popular ? 'text-background' : ''}`}>
            $
            {plan.priceUsd}
          </span>
          <span className={`text-sm ${plan.popular ? 'text-background/60' : 'text-muted-foreground'}`}>
            /mo
          </span>
        </div>
        <p className={`mt-0.5 text-[11px] ${plan.popular ? 'text-background/50' : 'text-muted-foreground'}`}>
          + $
          {plan.setupFeeUsd}
          {' '}
          one-time setup fee
        </p>
      </div>

      <div className="p-5">
        <p className="mb-4 text-xs text-muted-foreground">{plan.tagline}</p>
        <ul className="space-y-2">
          <li className="flex items-center gap-2 text-xs">
            <Check className="size-3.5 shrink-0 text-emerald-500" />
            {plan.features.postsPerMonth === -1 ? 'Unlimited' : plan.features.postsPerMonth}
            {' '}
            posts/month
          </li>
          <li className="flex items-center gap-2 text-xs">
            <Check className="size-3.5 shrink-0 text-emerald-500" />
            {plan.features.platformsLimit === -1 ? 'All platforms' : `Up to ${plan.features.platformsLimit} platforms`}
          </li>
          {plan.features.videoGeneration && (
            <li className="flex items-center gap-2 text-xs">
              <Check className="size-3.5 shrink-0 text-emerald-500" />
              Video post generation
            </li>
          )}
          {plan.features.humanReview && (
            <li className="flex items-center gap-2 text-xs">
              <Check className="size-3.5 shrink-0 text-emerald-500" />
              Human content review
            </li>
          )}
          {plan.features.brandProfilesLimit > 1 && (
            <li className="flex items-center gap-2 text-xs">
              <Check className="size-3.5 shrink-0 text-emerald-500" />
              {plan.features.brandProfilesLimit === -1 ? 'Unlimited' : plan.features.brandProfilesLimit}
              {' '}
              brand profiles
            </li>
          )}
          <li className="flex items-center gap-2 text-xs">
            <Check className="size-3.5 shrink-0 text-emerald-500" />
            {SUPPORT_LABELS[plan.features.supportLevel]}
            {' '}
            support
          </li>
        </ul>
      </div>
    </button>
  );
}

// -----------------------------------------------------------
// INNER PAGE (uses useSearchParams)
// -----------------------------------------------------------
function SubscribeContent() {
  const { user } = useUser();
  const { organization } = useOrganization();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/dashboard';
  console.log({ redirectPath });

  const [selectedPlan, setSelectedPlan] = useState<string>('growth');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('stripe');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showComparison, setShowComparison] = useState(false);

  const handleSubscribe = async () => {
    if (!selectedPlan) {
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      if (paymentMethod === 'stripe') {
        const res = await fetch('/api/billing/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId: selectedPlan }),
        });
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        } else {
          setError(data.error || 'Failed to start checkout. Please try again.');
        }
      } else {
        // Paystack — requires email
        const email = user?.primaryEmailAddress?.emailAddress;
        if (!email) {
          setError('Could not find your email address. Please try card payment.');
          return;
        }
        const res = await fetch('/api/billing/create-paystack-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId: selectedPlan, email }),
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
      setIsLoading(false);
    }
  };

  const selectedPlanConfig = VISIBLE_PLANS.find(p => p.id === selectedPlan);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between p-4 sm:px-6">
          <div className="flex items-center gap-2">
            {/* Replace with your actual logo component */}
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
              N
            </div>
            <span className="font-semibold">NativPost</span>
          </div>
          {organization && (
            <span className="text-xs text-muted-foreground">
              {organization.name}
            </span>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Headline */}
        <div className="mb-8 text-center">
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

        {/* Trial badge */}
        <div className="mb-8 flex justify-center">
          <div className="flex items-center gap-2 rounded-full border bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
            <Check className="size-4" />
            {FREE_TRIAL_DAYS}
            {' '}
            days free — card required only to start your trial
          </div>
        </div>

        {/* Plan selector */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {VISIBLE_PLANS.map(plan => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isSelected={selectedPlan === plan.id}
              onSelect={() => setSelectedPlan(plan.id)}
            />
          ))}
        </div>

        {/* Plan comparison toggle */}
        <div className="mb-8 text-center">
          <button
            type="button"
            onClick={() => setShowComparison(p => !p)}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            {showComparison ? 'Hide' : 'Show'}
            {' '}
            full feature comparison
          </button>
        </div>

        {/* Feature comparison table */}
        {showComparison && (
          <div className="mb-8 overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Feature</th>
                  {VISIBLE_PLANS.map(plan => (
                    <th key={plan.id} className="px-4 py-3 text-center text-xs font-semibold">
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_ROWS.map((row, i) => (
                  <tr key={row.key} className={i % 2 === 0 ? 'bg-muted/10' : ''}>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{row.label}</td>
                    {VISIBLE_PLANS.map((plan) => {
                      const value = formatFeatureValue(plan, row);
                      return (
                        <td key={plan.id} className="px-4 py-3 text-center">
                          {typeof value === 'boolean' ? (
                            value
                              ? <Check className="mx-auto size-4 text-emerald-500" />
                              : <X className="mx-auto size-4 text-muted-foreground/30" />
                          ) : (
                            <span className="text-xs font-medium">{value}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td className="px-4 py-3 text-xs text-muted-foreground">Support</td>
                  {VISIBLE_PLANS.map(plan => (
                    <td key={plan.id} className="px-4 py-3 text-center text-xs">
                      {SUPPORT_LABELS[plan.features.supportLevel]}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Checkout section */}
        <div className="mx-auto max-w-md">
          {/* Payment method toggle */}
          <div className="mb-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Payment method</p>
            <div className="flex rounded-lg border p-1">
              <button
                type="button"
                onClick={() => setPaymentMethod('stripe')}
                className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                  paymentMethod === 'stripe'
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Card (Stripe)
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('paystack')}
                className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                  paymentMethod === 'paystack'
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Africa (Paystack)
              </button>
            </div>
          </div>

          {/* Selected plan summary */}
          {selectedPlanConfig && (
            <div className="mb-4 rounded-xl border bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">
                    {selectedPlanConfig.name}
                    {' '}
                    Plan
                  </p>
                  <p className="text-xs text-muted-foreground">
                    $
                    {selectedPlanConfig.priceUsd}
                    /month after
                    {' '}
                    {FREE_TRIAL_DAYS}
                    -day trial
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">$0.00 today</p>
                  <p className="text-xs text-muted-foreground">
                    + $
                    {selectedPlanConfig.setupFeeUsd}
                    {' '}
                    setup fee
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Promo code note */}
          {paymentMethod === 'stripe' && (
            <p className="mb-4 text-center text-xs text-muted-foreground">
              Have a promo code? You can enter it on the next screen.
            </p>
          )}

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* CTA */}
          <button
            type="button"
            onClick={handleSubscribe}
            disabled={!selectedPlan || isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {isLoading
              ? <Loader2 className="size-4 animate-spin" />
              : <ChevronRight className="size-4" />}
            {isLoading
              ? 'Redirecting...'
              : `Start ${FREE_TRIAL_DAYS}-day free trial`}
          </button>

          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            By continuing, you agree to our Terms of Service and Privacy Policy.
            Cancel anytime before your trial ends and you won't be charged.
          </p>

          {/* Trust signals */}
          <div className="mt-6 flex flex-wrap justify-center gap-4 border-t pt-6">
            {['No setup hassle', 'Cancel anytime', 'Secure payment'].map(item => (
              <div key={item} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Check className="size-3 text-emerald-500" />
                {item}
              </div>
            ))}
          </div>
        </div>

        {/* Enterprise CTA */}
        <div className="mt-10 rounded-xl border bg-muted/30 p-5 text-center">
          <p className="text-sm font-medium">Need Agency or Enterprise?</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Unlimited posts, multiple brand profiles, dedicated account manager, and custom pricing.
          </p>
          <a
            href="https://nativpost.com/contact-us"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary underline"
          >
            Contact us
            <ChevronRight className="size-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------
// PAGE
// -----------------------------------------------------------
export default function SubscribePage() {
  return (
    <Suspense fallback={(
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )}
    >
      <SubscribeContent />
    </Suspense>
  );
}
