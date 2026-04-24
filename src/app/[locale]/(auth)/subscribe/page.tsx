import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { getOrgBillingState } from '@/lib/billing';

import SubscribeClient from './SubscribeClient';

// Force dynamic so billing state is always fresh — never cached.
export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// -----------------------------------------------------------
// Server-side billing gate.
//
// Runs on the server BEFORE any HTML is sent to the browser.
// If the user already has an active subscription or valid trial,
// they are redirected to the dashboard instantly — no client JS
// needed, no visible flicker.
//
// Only users who genuinely need to subscribe reach <SubscribeClient />.
// -----------------------------------------------------------
export default async function SubscribePage({ searchParams }: Props) {
  const { userId, orgId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  if (!orgId) {
    redirect('/onboarding/organization-selection');
  }

  const resolvedSearch = await searchParams;

  // Skip the billing redirect when returning from Paystack —
  // the client handles polling and redirect in that case.
  const isPaystackReturn
    = resolvedSearch.paystack_success === 'true'
    || !!resolvedSearch.reference
    || !!resolvedSearch.trxref;

  if (!isPaystackReturn) {
    try {
      const billing = await getOrgBillingState(orgId);
      const canAccess = billing?.isActive || (billing?.isTrialing && !billing?.trialExpired);

      if (canAccess) {
        const redirectTo
          = typeof resolvedSearch.redirect === 'string'
            ? resolvedSearch.redirect
            : '/dashboard';

        redirect(redirectTo);
      }
    } catch (err) {
      // Fail open — if billing check throws, let the client page render
      console.error('[Subscribe Gate] Billing check failed:', err);
    }
  }

  return <SubscribeClient />;
}
