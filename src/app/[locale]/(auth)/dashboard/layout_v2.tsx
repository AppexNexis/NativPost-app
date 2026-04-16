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
  const trialExpired = billing?.trialExpired;

  // 🔒 HARD BLOCK
  if (!isActive || trialExpired) {
    redirect(`/subscribe?redirect=/dashboard`);
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
