import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { getOrgBillingState } from '@/lib/billing';

import DashboardLayout from './DashboardClientLayout';

export const dynamic = 'force-dynamic';

export default async function DashboardLayoutGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, orgId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  if (!orgId) {
    redirect('/onboarding/organization-selection');
  }

  let billing;

  try {
    billing = await getOrgBillingState(orgId);
  } catch (err) {
    console.error('[Dashboard Gate] billing fetch failed', err);
    billing = null;
  }

  const isActive = billing?.isActive;
  const isTrialing = billing?.isTrialing;
  const trialExpired = billing?.trialExpired;

  // Allow through if active OR trialing (trial not yet expired)
  // This prevents the redirect loop when Paystack webhook hasn't fired yet
  // but the user has already been sent back to the dashboard
  const canAccess = isActive || (isTrialing && !trialExpired);

  if (!canAccess) {
    redirect(`/subscribe?redirect=/dashboard`);
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
