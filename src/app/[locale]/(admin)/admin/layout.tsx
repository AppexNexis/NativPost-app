/**
 * src/app/[locale]/(admin)/admin/layout.tsx
 *
 * Server-side gate for all /admin routes.
 * - Verifies org:admin role (belt-and-suspenders after middleware)
 * - Renders the AdminShell client layout
 */

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import AdminShell from './AdminShell';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, orgRole } = await auth();

  if (!userId) redirect('/sign-in');

  // Hard gate — only org:admin gets through
  if (orgRole !== 'org:admin') redirect('/dashboard');

  return <AdminShell>{children}</AdminShell>;
}