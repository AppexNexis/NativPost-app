import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

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

  return <DashboardLayout>{children}</DashboardLayout>;
}