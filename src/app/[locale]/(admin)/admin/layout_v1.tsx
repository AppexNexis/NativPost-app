/**
 * src/app/[locale]/(admin)/admin/layout.tsx
 *
 * Admin layout with locale support.
 *
 * IMPORTANT: Must accept and forward the locale param from [locale].
 * Without calling unstable_setRequestLocale, next-intl crashes with
 * "Cannot read properties of undefined (reading 'locale')" because
 * the request locale context is never set for this route segment.
 */

import { auth } from '@clerk/nextjs/server';
import { unstable_setRequestLocale } from 'next-intl/server';
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
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  // Must be called before any next-intl usage in this route segment
  unstable_setRequestLocale(params.locale);

  const { userId, orgId, orgRole } = await auth();

  if (!userId) redirect('/sign-in');

  if (!isNativPostStaff(orgId, orgRole)) {
    redirect('/dashboard');
  }

  return <AdminShell>{children}</AdminShell>;
}