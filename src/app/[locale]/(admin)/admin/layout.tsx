/**
 * src/app/[locale]/(admin)/admin/layout.tsx
 *
 * Server-side gate for all /admin routes.
 *
 * Uses the same staff check as middleware: the user must have the NativPost
 * internal org active AND be org:admin within it. Client org admins fail
 * because their orgId will never match NATIVPOST_TEAM_ORG_ID.
 */

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import AdminShell from './AdminShell';

export const dynamic = 'force-dynamic';

function isNativPostStaff(
  orgId: string | null | undefined,
  orgRole: string | null | undefined,
): boolean {
  const teamOrgId = process.env.NATIVPOST_TEAM_ORG_ID;
  if (!teamOrgId) return false;
  return orgId === teamOrgId && orgRole === 'org:admin';
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, orgId, orgRole } = await auth();

  if (!userId) redirect('/sign-in');

  if (!isNativPostStaff(orgId, orgRole)) {
    redirect('/dashboard');
  }

  return <AdminShell>{children}</AdminShell>;
}