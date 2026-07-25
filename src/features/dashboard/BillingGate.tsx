'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Owns every billing-driven redirect in the dashboard.
 *
 * This lives on the client on purpose: the dashboard layout wraps
 * /dashboard/billing itself, so a server redirect there would loop. Here we
 * can read the pathname and leave the user alone once they have arrived.
 *
 * Two states route:
 *   - free window lapsed  → /dashboard/billing?trial_ended=true
 *   - payment failed/cancelled on a real subscription → ?recovery=true
 *
 * Both keep the app shell — sidebar, org switcher and sign-out stay usable.
 * Nobody is ever thrown out to a standalone paywall page.
 */

export type BillingGateState = {
  planStatus: string;
  freeTrialEnded?: boolean;
};

export function BillingGate({ billing }: { billing: BillingGateState | null }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!billing) {
      return;
    }

    // Locale prefixes (/fr/dashboard/billing) must match too.
    if (/\/dashboard\/billing(\/|$|\?)/.test(`${pathname}/`)) {
      return;
    }

    if (billing.freeTrialEnded) {
      router.replace('/dashboard/billing?trial_ended=true');
      return;
    }

    if (billing.planStatus === 'past_due' || billing.planStatus === 'cancelled') {
      router.replace('/dashboard/billing?recovery=true');
    }
  }, [billing, pathname, router]);

  return null;
}
