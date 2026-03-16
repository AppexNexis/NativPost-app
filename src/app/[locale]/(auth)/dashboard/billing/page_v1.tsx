import { Check, CreditCard } from 'lucide-react';

import { PageHeader } from '@/features/dashboard/PageHeader';

const PLANS = [
  {
    name: 'Starter',
    price: '$19',
    period: '/month',
    features: ['20 posts/month', '3 social platforms', 'Basic Brand Profile', 'Self-approve', 'Email support'],
    current: true,
  },
  {
    name: 'Growth',
    price: '$49',
    period: '/month',
    features: ['40 posts/month', '5 social platforms', 'Detailed Brand Profile', 'Priority email support', 'Detailed analytics'],
    popular: true,
  },
  {
    name: 'Pro',
    price: '$99',
    period: '/month',
    features: ['80 posts/month', 'All platforms', 'Premium Brand Profile', 'Our team reviews content', 'Advanced analytics + reports', 'Live chat + email support'],
  },
  {
    name: 'Agency',
    price: '$199',
    period: '/month',
    features: ['Unlimited posts', 'All platforms + multi-brand', 'Bespoke Brand Profile', 'Dedicated reviewer', 'API access', 'Dedicated Slack/Teams'],
  },
];

export default function BillingPage() {
  return (
    <>
      <PageHeader
        title="Billing"
        description="Manage your subscription and payment details."
      />

      {/* Current plan */}
      <div className="mb-8 rounded-xl border bg-background p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <CreditCard className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Current plan: <span className="text-[#16A34A]">Free trial</span></p>
              <p className="text-xs text-muted-foreground">Trial ends in 7 days. Upgrade anytime.</p>
            </div>
          </div>
          <button className="inline-flex items-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            Manage subscription
          </button>
        </div>
      </div>

      {/* Plans grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`relative rounded-xl border bg-background p-5 ${
              plan.popular ? 'border-[#16A34A] ring-1 ring-[#16A34A]' : ''
            }`}
          >
            {plan.popular && (
              <div className="absolute -top-3 left-4 rounded-full bg-[#16A34A] px-2.5 py-0.5 text-xs font-medium text-white">
                Most popular
              </div>
            )}
            <h3 className="text-base font-semibold">{plan.name}</h3>
            <div className="mt-2 flex items-baseline">
              <span className="text-3xl font-bold">{plan.price}</span>
              <span className="ml-1 text-sm text-muted-foreground">{plan.period}</span>
            </div>
            <ul className="mt-4 space-y-2">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-[#16A34A]" />
                  {feature}
                </li>
              ))}
            </ul>
            <button
              className={`mt-5 w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                plan.current
                  ? 'border bg-muted text-muted-foreground'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              }`}
              disabled={plan.current}
            >
              {plan.current ? 'Current plan' : 'Upgrade'}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
