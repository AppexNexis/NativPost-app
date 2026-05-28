'use client';

import { OrganizationSwitcher, useAuth, useOrganization, UserButton } from '@clerk/nextjs';
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  CircleCheck,
  Clock,
  CreditCard,
  ExternalLink,
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
  Gift,
  MessageCircle,
} from 'lucide-react';
import NextImage from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import logoIcon from '/public/assets/images/shared/logo.svg';
import logoDark from '/public/assets/images/shared/logo-dark.svg';
import mainLogo from '/public/assets/images/shared/main-logo.svg';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import SupportWidget from '@/components/support/SupportWidget';
import { getNavForRole, getUserRole, isTeamMember } from '@/lib/roles';
import type { NavItem } from '@/lib/roles';
import { BillingGate } from '@/features/dashboard/BillingGate';
import { useOrgSync } from '@/hooks/useOrgSync';

const ICONS: Record<string, typeof Calendar> = {
  BarChart3,
  Calendar,
  CheckCircle2,
  CircleCheck,
  Clock,
  CreditCard,
  ExternalLink,
  FileText,
  Fingerprint,
  Image,
  LayoutList,
  LifeBuoy,
  Link2,
  PenLine,
  Settings,
  Users,
  Gift,
  MessageCircle,
};

export default function DashboardClientLayout({
  children,
  plan,
}: {
  children: React.ReactNode;
  plan?: string;
}) {
  const { orgRole } = useAuth();
  const { organization } = useOrganization();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<string>(plan || 'starter');
  const [billingStatus, setBillingStatus] = useState<{ planStatus: string; setupFeePaid: boolean } | null>(null);


  const role = getUserRole(orgRole);
  const navGroups = getNavForRole(role);
  const isTeam = isTeamMember(role);

  const orgId = organization?.id;
  const teamOrgId = process.env.NEXT_PUBLIC_NATIVPOST_TEAM_ORG_ID;
  const isNativPostStaff = !!(teamOrgId && orgId === teamOrgId && role === 'admin');

  useOrgSync();

  // Fetch current plan if not passed from server (fallback)
  // useEffect(() => {
  //   if (plan) return;
  //   fetch('/api/billing/status')
  //     .then(r => r.ok ? r.json() : null)
  //     .then((data: { plan?: string } | null) => {
  //       if (data?.plan) setCurrentPlan(data.plan);
  //     })
  //     .catch(() => null);
  // }, [plan]);

  useEffect(() => {
    if (plan) return;
    fetch('/api/billing/status')
      .then(r => r.ok ? r.json() : null)
      .then((data: { plan?: string; planStatus?: string; setupFeePaid?: boolean } | null) => {
        if (data?.plan) setCurrentPlan(data.plan);
        if (data) setBillingStatus({ planStatus: data.planStatus ?? '', setupFeePaid: data.setupFeePaid ?? false });
      })
      .catch(() => null);
  }, [plan]);

  // Fix: use a proper RegExp literal — avoids the TS7053 index-type error
  // that occurred when the regex was written as a string escape sequence.
  const cleanPath = pathname.replace(/^\/[a-z]{2}(\/|$)/, '/');

  const isActive = (href: string) => {
    if (href.startsWith('http')) return false;
    if (href.includes('?')) {
      return (
        cleanPath === href.split('?')[0]
        && pathname.includes(href.split('?')[1] ?? '')
      );
    }
    return cleanPath === href || cleanPath.startsWith(`${href}/`);
  };

  const isPlanEligible = (item: NavItem) => {
    if (!item.planRequired) return true;
    return item.planRequired.includes(currentPlan);
  };

  const renderNavItem = (item: NavItem) => {
    const Icon = ICONS[item.icon] ?? FileText;
    const active = isActive(item.href);
    const eligible = isPlanEligible(item);

    const baseClass =
      'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors w-full';
    const activeClass = 'bg-primary/10 font-medium text-primary';
    const inactiveClass = 'text-muted-foreground hover:bg-muted hover:text-foreground';
    const disabledClass = 'text-muted-foreground/50 cursor-default';

    if (!eligible) {
      return (
        <div
          key={item.href + item.label}
          title={`Available on ${item.planRequired
            ?.map(p => p.charAt(0).toUpperCase() + p.slice(1))
            .join(', ')} plans`}
          className={`${baseClass} ${disabledClass} group relative`}
        >
          <Icon className="size-4 shrink-0" />
          <span>{item.label}</span>
          <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            Growth+
          </span>
        </div>
      );
    }

    if (item.external) {
      return (
        <a
          key={item.href + item.label}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setSidebarOpen(false)}
          className={`${baseClass} ${inactiveClass}`}
        >
          <Icon className="size-4 shrink-0" />
          <span>{item.label}</span>
          <ExternalLink className="ml-auto size-3 text-muted-foreground/50" />
        </a>
      );
    }

    return (
      <Link
        key={item.href + item.label}
        href={item.href}
        onClick={() => setSidebarOpen(false)}
        className={`${baseClass} ${active ? activeClass : inactiveClass}`}
      >
        <Icon className="size-4 shrink-0" />
        {item.label}
      </Link>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-muted/30">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-[220px] flex-col border-r bg-background transition-transform duration-200 lg:static lg:inset-y-auto lg:z-auto lg:translate-x-0 lg:shrink-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        {/* Logo */}
        <div className="flex h-14 items-center border-b px-4">
          <Link href="/dashboard" className="inline-flex items-center">
            <figure className="hidden sm:block sm:max-w-[140px]">
              <NextImage
                src={mainLogo}
                alt="NativPost"
                className="h-auto w-full dark:invert"
                priority
              />
            </figure>
            <figure className="block max-w-[32px] sm:hidden">
              <NextImage
                src={logoIcon}
                alt="NativPost"
                className="block h-auto w-full dark:hidden"
                priority
              />
              <NextImage
                src={logoDark}
                alt="NativPost"
                className="hidden h-auto w-full dark:block"
                priority
              />
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
                organizationSwitcherTrigger:
                  'w-full justify-between rounded-lg border px-3 py-2 text-sm hover:bg-muted',
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
                {items.map(item => renderNavItem(item))}
              </div>
            </div>
          ))}
        </nav>

        {/* Admin ops — NativPost staff only */}
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
              <p className="truncate text-xs font-medium">
                {organization?.name || 'Organization'}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {isTeam
                  ? 'NativPost Team'
                  : `${currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)} plan`}
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
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar — always visible, never scrolls */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4 lg:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 hover:bg-muted lg:hidden"
          >
            <Menu className="size-5" />
          </button>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-2">
            <NotificationBell />
            <UserButton
              afterSignOutUrl="/"
              appearance={{ elements: { avatarBox: 'size-8' } }}
            />
          </div>
        </header>
        <BillingGate billing={billingStatus} />
        {/* Page content — only this area scrolls */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 lg:p-6">
          {children}
        </div>
      </main>

      {/* Support widget */}
      <SupportWidget currentPath={cleanPath} />
    </div>
  );
}