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

  if (!userId) redirect('/sign-in');
  if (!orgId) redirect('/onboarding/organization-selection');

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
  const isPastDueOrCancelled =
    billing?.planStatus === 'past_due' || billing?.planStatus === 'cancelled';

  // past_due/cancelled users CAN access the dashboard (specifically billing)
  // They get redirected to /dashboard/billing by the client-side billing gate below
  const canAccess =
    isActive ||
    (isTrialing && !trialExpired) ||
    (isPastDueOrCancelled && !!billing?.setupFeePaid);

  if (!canAccess) {
    redirect('/subscribe?redirect=/dashboard');
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}