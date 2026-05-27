// src/app/dashboard/billing/layout.tsx
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import DashboardLayout from '../DashboardClientLayout';

export default async function BillingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, orgId } = await auth();

  if (!userId) redirect('/sign-in');
  if (!orgId) redirect('/onboarding/organization-selection');

  // No billing gate here — past_due users must reach this page
  // to recover their subscription.
  return <DashboardLayout>{children}</DashboardLayout>;
}