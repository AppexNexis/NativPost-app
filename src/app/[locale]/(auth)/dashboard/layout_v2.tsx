import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { getOrgBillingState } from '@/lib/billing';

import DashboardLayout from './DashboardClientLayout';

export const dynamic = 'force-dynamic';

export default async function DashboardLayoutGate({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  // 1. Auth check
  let userId: string | null = null;
  let orgId: string | null = null;

  try {
    const authResult = await auth();
    userId = authResult?.userId;
    orgId = authResult?.orgId ?? null;
  } catch (err) {
    console.error('[Dashboard Gate] auth() failed:', err);
    redirect(`/${params.locale}/sign-in`);
  }

  if (!userId) {
    redirect(`/${params.locale}/sign-in`);
  }

  if (!orgId) {
    redirect(`/${params.locale}/onboarding/organization-selection`);
  }

  // 2. Billing check — ALWAYS fail open if we can't reach the DB
  let isBlocked = false;

  try {
    const billing = await getOrgBillingState(orgId!);

    if (billing !== null) {
      // Only block if we got a real answer from the DB
      isBlocked = !billing.isActive || billing.trialExpired;
    }
    // billing === null means DB returned nothing — fail open, let user in
    // This prevents a DB hiccup from locking out paying customers
  } catch (err) {
    console.error('[Dashboard Gate] billing check failed, failing open:', err);
    isBlocked = false; // NEVER block on error
  }

  if (isBlocked) {
    redirect(`/${params.locale}/subscribe?redirect=/dashboard`);
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
