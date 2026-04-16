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

  let shouldBlock = false;

  try {
    const billing = await getOrgBillingState(orgId);
    // Only block if we got a definitive answer that billing is inactive
    if (billing !== null) {
      shouldBlock = !billing.isActive || billing.trialExpired;
    }
    // If billing is null (DB error etc.), fail open — let user in
  } catch (err) {
    console.error('[Dashboard Gate] billing fetch failed, failing open:', err);
    // fail open — never block the user due to our own infra errors
  }

  if (shouldBlock) {
    redirect(`/subscribe?redirect=/dashboard`);
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}