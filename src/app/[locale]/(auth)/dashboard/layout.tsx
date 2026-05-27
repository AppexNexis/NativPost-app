import { auth } from '@clerk/nextjs/server';
import { headers } from 'next/headers';
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

  // Get the current path to avoid redirect loops
  const headersList = await headers();
  const pathname = headersList.get('x-invoke-path') 
    || headersList.get('x-pathname') 
    || '';
  const isOnBillingPage = pathname.includes('/billing');

  let billing;
  try {
    billing = await getOrgBillingState(orgId);
  } catch (err) {
    console.error('[Dashboard Gate] billing fetch failed', err);
    billing = null;
  }

  const isPastDueOrCancelled =
    billing?.planStatus === 'past_due' || billing?.planStatus === 'cancelled';

  // Send past_due/cancelled to billing recovery — but not if already there
  if (isPastDueOrCancelled && billing?.setupFeePaid && !isOnBillingPage) {
    redirect('/dashboard/billing?recovery=true');
  }

  const isActive = billing?.isActive;
  const isTrialing = billing?.isTrialing;
  const trialExpired = billing?.trialExpired;
  const canAccess = isActive || (isTrialing && !trialExpired) || isPastDueOrCancelled;
  //                                                              ^^^ allow past_due through to billing

  if (!canAccess) {
    redirect('/subscribe?redirect=/dashboard');
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}