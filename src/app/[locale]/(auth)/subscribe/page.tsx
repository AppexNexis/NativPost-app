import { auth, clerkClient } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { getOrgBillingState } from '@/lib/billing';

import SubscribeClient from './SubscribeClient';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SubscribePage({ searchParams }: Props) {
  const { userId, orgId: sessionOrgId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  const resolvedSearch = await searchParams;

  // Skip the billing check when returning from Paystack —
  // the client handles polling and redirect in that case.
  const isPaystackReturn
    = resolvedSearch.paystack_success === 'true'
    || !!resolvedSearch.reference
    || !!resolvedSearch.trxref;

  if (isPaystackReturn) {
    return <SubscribeClient />;
  }

  // -----------------------------------------------------------
  // Resolve orgId — auth() may not have an active org in session
  // when the user was just redirected here after sign-in.
  // Fall back to their first org from Clerk's backend API.
  // -----------------------------------------------------------
  let orgId = sessionOrgId;

  if (!orgId) {
    try {
      const clerk = await clerkClient();
      const memberships = await clerk.users.getOrganizationMembershipList({
        userId,
        limit: 1,
      });
      const firstOrg = memberships.data[0]?.organization?.id;
      if (firstOrg) {
        orgId = firstOrg;
      }
    } catch (err) {
      console.error('[Subscribe Gate] Failed to fetch org memberships:', err);
    }
  }

  // No org at all → they need to create one first
  if (!orgId) {
    return <SubscribeClient />;
  }

  // -----------------------------------------------------------
  // Billing gate — redirect before any HTML is sent to browser
  // -----------------------------------------------------------
  try {
    const billing = await getOrgBillingState(orgId);
    const canAccess = billing?.isActive;

    if (canAccess) {
      const redirectTo
        = typeof resolvedSearch.redirect === 'string'
          ? resolvedSearch.redirect
          : '/dashboard';

      redirect(redirectTo);
    }
  } catch (err) {
    // Fail open — if billing check throws, show the subscribe page
    console.error('[Subscribe Gate] Billing check failed:', err);
  }

  return <SubscribeClient />;
}
