import { auth } from '@clerk/nextjs/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { getOrgBillingState } from '@/lib/billing';

import DashboardLayout from './DashboardClientLayout';

// -----------------------------------------------------------
// This is the SERVER component entry point for the dashboard.
// It runs on every dashboard page load and checks billing
// status directly from the DB — no fetch, no cookie issues.
//
// If the org has no active subscription, it redirects to
// /subscribe before the dashboard ever renders.
//
// Your existing DashboardLayout (sidebar, nav, etc.) is now
// renamed to DashboardClientLayout and rendered here after
// the gate passes.
// -----------------------------------------------------------

// Pages that should never be blocked by the subscription gate.
// The billing page must always be accessible so users can pay.
const EXEMPT_PATHS = ['/dashboard/billing'];

export default async function DashboardLayoutGate({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const { orgId } = await auth();

  if (!orgId) {
    const locale = params.locale !== 'en' ? `/${params.locale}` : '';
    redirect(`${locale}/sign-in`);
  }

  // Check if this is an exempt path (billing page)
  // We read x-invoke-path header set by Next.js internally
  const headersList = await headers();
  const pathname = headersList.get('x-invoke-path') || headersList.get('x-pathname') || '';
  const cleanPath = pathname.replace(/^\/[a-z]{2}(\/|$)/, '/');
  const isExempt = EXEMPT_PATHS.some(p => cleanPath.startsWith(p));

  if (!isExempt) {
    const billing = await getOrgBillingState(orgId);
    const locale = params.locale !== 'en' ? `/${params.locale}` : '';

    // No billing record at all (brand new org) → subscribe
    if (!billing) {
      redirect(`${locale}/subscribe`);
    }

    // Has a record but subscription is not active → subscribe
    if (!billing.isActive) {
      redirect(`${locale}/subscribe`);
    }
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
