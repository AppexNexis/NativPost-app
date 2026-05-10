'use client';

/**
 * src/app/[locale]/(auth)/dashboard/DashboardClientLayout.tsx
 *
 * Changes:
 * - Added LifeBuoy to ICONS map for the Support nav item
 * - Added ShieldCheck icon for the Admin ops link
 * - Added Admin ops link at the bottom of the sidebar for admin role only
 */

import { OrganizationSwitcher, useAuth, useOrganization, UserButton } from '@clerk/nextjs';
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  CircleCheck,
  Clock,
  CreditCard,
  FileText,
  Fingerprint, 
  Image,
  LayoutList,
  LifeBuoy,
  Link2,
  Menu,
  PenLine,
  Plus,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import NextImage from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import logoIcon from '/public/assets/images/shared/logo.svg';
import logoDark from '/public/assets/images/shared/logo-dark.svg';
import mainLogo from '/public/assets/images/shared/main-logo.svg';
import { getNavForRole, getUserRole, isTeamMember } from '@/lib/roles';

const ICONS: Record<string, typeof Calendar> = {
  BarChart3,
  Calendar,
  CheckCircle2,
  CircleCheck,
  Clock,
  CreditCard,
  FileText,
  Fingerprint,
  Image,
  LayoutList,
  LifeBuoy,
  Link2,
  PenLine,
  Settings,
  Users,
};

export default function DashboardClientLayout({ children }: { children: React.ReactNode }) {
  const { orgRole, orgId } = useAuth();
  const { organization } = useOrganization();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const role = getUserRole(orgRole);
  const navGroups = getNavForRole(role);
  const isTeam = isTeamMember(role);

  // Admin ops link only shows when the NativPost internal org is active.
  // Clients are org:admin inside their own orgs but NATIVPOST_TEAM_ORG_ID
  // is only set in the server env — on the client we expose it via a
  // data attribute or simply gate by role AND a known pattern.
  // The safest client-side signal: use the NEXT_PUBLIC_ prefixed version.
  const teamOrgId = process.env.NEXT_PUBLIC_NATIVPOST_TEAM_ORG_ID;
  const isNativPostStaff = !!(teamOrgId && orgId === teamOrgId && role === 'admin');

  const cleanPath = pathname.replace(/^\/[a-z]{2}(\/|$)/, '/');

  const isActive = (href: string) => {
    if (href.includes('?')) {
      return cleanPath === href.split('?')[0] && pathname.includes(href.split('?')[1] || '');
    }
    return cleanPath === href || cleanPath.startsWith(`${href}/`);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-muted/30">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[220px] flex-col border-r bg-background transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex h-14 items-center border-b px-4">
          <Link href="/dashboard" className="inline-flex items-center">
            <figure className="hidden sm:block sm:max-w-[140px]">
              <NextImage src={mainLogo} alt="NativPost" className="h-auto w-full dark:invert" priority />
            </figure>
            <figure className="block max-w-[32px] sm:hidden">
              <NextImage src={logoIcon} alt="NativPost" className="block h-auto w-full dark:hidden" priority />
              <NextImage src={logoDark} alt="NativPost" className="hidden h-auto w-full dark:block" priority />
            </figure>
          </Link>
        </div>

        {/* Org switcher */}
        <div className="border-b px-3 py-2.5">
          <OrganizationSwitcher
            hidePersonal
            appearance={{
              elements: {
                rootBox: 'w-full',
                organizationSwitcherTrigger: 'w-full justify-between rounded-lg border px-3 py-2 text-sm hover:bg-muted',
              },
            }}
          />
        </div>

        {/* Create post button — team only */}
        {isTeam && (
          <div className="px-3 pt-3">
            <Link
              href="/dashboard/content/create"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="size-4" />
              Create post
            </Link>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3">
          {Object.entries(navGroups).map(([group, items]) => (
            <div key={group} className="mb-4">
              <p className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                {group}
              </p>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const Icon = ICONS[item.icon] || FileText;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href + item.label}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors ${
                        active
                          ? 'bg-primary/10 font-medium text-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      <Icon className="size-4 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Admin ops link — only visible to NativPost staff with internal org active */}
        {isNativPostStaff && (
          <div className="border-t px-3 py-2">
            <Link
              href="/admin/support"
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ShieldCheck className="size-4 shrink-0" />
              Admin ops
            </Link>
          </div>
        )}

        {/* User section */}
        <div className="border-t p-3">
          <div className="flex items-center gap-2.5">
            <UserButton
              afterSignOutUrl="/"
              appearance={{ elements: { avatarBox: 'size-8' } }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{organization?.name || 'Organization'}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {isTeam ? 'NativPost Team' : 'Free Plan'}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4 lg:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 hover:bg-muted lg:hidden"
          >
            <Menu className="size-5" />
          </button>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-3">
            <UserButton
              afterSignOutUrl="/"
              appearance={{ elements: { avatarBox: 'size-8' } }}
            />
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 lg:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}