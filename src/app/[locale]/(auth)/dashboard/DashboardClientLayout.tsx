'use client';

import { OrganizationSwitcher, useAuth, useOrganization, UserButton } from '@clerk/nextjs';
import {
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
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
  Megaphone,
  Menu,
  PenLine,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Gift,
  MessageCircle,
  Zap,
} from 'lucide-react';
import NextImage from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import logoIcon from '/public/assets/images/shared/logo.svg';
import logoDark from '/public/assets/images/shared/logo-dark.svg';
import mainLogo from '/public/assets/images/shared/main-logo.svg';
import { TrialLimitsPill, type TrialLimitsData } from '@/components/billing/TrialLimitsPill';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import SupportWidget from '@/components/support/SupportWidget';
import { getNavForRole, getUserRole, isTeamMember } from '@/lib/roles';
import type { NavItem } from '@/lib/roles';
import { BillingGate } from '@/features/dashboard/BillingGate';
import { useOrgSync } from '@/hooks/useOrgSync';

const ICONS: Record<string, typeof Calendar> = {
  BarChart3,
  BookOpen,
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
  Megaphone,
  PenLine,
  Settings,
  Sparkles,
  Users,
  Gift,
  MessageCircle,
  Zap,
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [subNavOpen, setSubNavOpen] = useState<Record<string, boolean>>({});
  const [currentPlan, setCurrentPlan] = useState<string>(plan || 'starter');
  const [billingStatus, setBillingStatus] = useState<{ planStatus: string; setupFeePaid: boolean } | null>(null);
  const [trialLimits, setTrialLimits] = useState<TrialLimitsData | null>(null);
  const navRef = useRef<HTMLElement>(null);

  const role = getUserRole(orgRole);
  const navGroups = getNavForRole(role);
  const isTeam = isTeamMember(role);

  const orgId = organization?.id;
  const teamOrgId = process.env.NEXT_PUBLIC_NATIVPOST_TEAM_ORG_ID;
  const isNativPostStaff = !!(teamOrgId && orgId === teamOrgId && role === 'admin');

  useOrgSync();

  // Restore sidebar collapse state from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('np-sidebar-collapsed');
      if (stored === 'true') setCollapsed(true);
    } catch { /* ignore */ }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('np-sidebar-collapsed', String(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // Fetch billing status once on mount. Always run — even when a `plan` prop
  // was passed — because the trial/usage pill needs live counters that the
  // prop does not carry.
  useEffect(() => {
    fetch('/api/billing/status')
      .then(r => r.ok ? r.json() : null)
      .then((data: {
        plan?: string;
        planStatus?: string;
        setupFeePaid?: boolean;
        isTrialing?: boolean;
        trialDaysLeft?: number;
        trialExpired?: boolean;
        usage?: { postsThisMonth?: number; postsLimit?: number };
      } | null) => {
        if (data?.plan) setCurrentPlan(data.plan);
        if (data) {
          setBillingStatus({ planStatus: data.planStatus ?? '', setupFeePaid: data.setupFeePaid ?? false });
          setTrialLimits({
            isTrialing: !!data.isTrialing,
            trialDaysLeft: data.trialDaysLeft ?? 0,
            trialExpired: !!data.trialExpired,
            plan: data.plan ?? 'starter',
            usage: {
              postsThisMonth: data.usage?.postsThisMonth ?? 0,
              postsLimit: data.usage?.postsLimit ?? 0,
            },
          });
        }
      })
      .catch(() => null);
  }, []);

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

  // Check if any sub-items in a group are active (auto-expand accordion)
  const hasActiveSubItem = (items: NavItem[]) => items.some(i => i.subGroup && isActive(i.href));

  const toggleSubNav = (group: string) => {
    setSubNavOpen(prev => ({ ...prev, [group]: !prev[group] }));
  };

  const isSubNavOpen = (group: string, items: NavItem[]) => {
    if (subNavOpen[group] !== undefined) return subNavOpen[group];
    return hasActiveSubItem(items);
  };

  const renderNavItem = (item: NavItem, dense = false) => {
    const Icon = ICONS[item.icon] ?? FileText;
    const active = isActive(item.href);
    const eligible = isPlanEligible(item);

    const py = dense ? 'py-1.5' : 'py-2';
    const baseClass = `relative flex items-center gap-2.5 rounded-lg px-2.5 ${py} text-[13px] transition-all duration-150 w-full`;
    const activeClass = 'bg-primary/10 font-medium text-primary before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-4 before:w-[3px] before:rounded-r-full before:bg-primary';
    const inactiveClass = 'text-muted-foreground hover:bg-muted/70 hover:text-foreground';
    const disabledClass = 'text-muted-foreground/40 cursor-default';

    if (!eligible) {
      return (
        <div
          key={item.href + item.label}
          title={`Available on ${item.planRequired?.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(', ')} plans`}
          className={`${baseClass} ${disabledClass} group`}
        >
          <Icon className="size-4 shrink-0" />
          {!collapsed && (
            <>
              <span className="truncate">{item.label}</span>
              <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Growth+
              </span>
            </>
          )}
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
          onClick={() => setMobileOpen(false)}
          title={collapsed ? item.label : undefined}
          className={`${baseClass} ${inactiveClass}`}
        >
          <Icon className="size-4 shrink-0" />
          {!collapsed && (
            <>
              <span className="truncate">{item.label}</span>
              <ExternalLink className="ml-auto size-3 text-muted-foreground/50 shrink-0" />
            </>
          )}
        </a>
      );
    }

    return (
      <Link
        key={item.href + item.label}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        title={collapsed ? item.label : undefined}
        className={`${baseClass} ${active ? activeClass : inactiveClass}`}
      >
        <Icon className={`size-4 shrink-0 ${active ? 'text-primary' : ''}`} />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-muted/30">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-screen flex-col border-r bg-background transition-all duration-200 ease-in-out
          ${collapsed ? 'w-[56px]' : 'w-[220px]'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:static lg:inset-y-auto lg:z-auto lg:translate-x-0 lg:shrink-0`}
      >
        {/* Logo */}
        <div className={`flex h-14 shrink-0 items-center border-b ${collapsed ? 'justify-center px-0' : 'px-4'}`}>
          <Link href="/dashboard" className="inline-flex items-center min-w-0">
            {collapsed ? (
              <figure className="w-8 shrink-0">
                <NextImage src={logoIcon} alt="NativPost" className="block h-auto w-full dark:hidden" priority />
                <NextImage src={logoDark} alt="NativPost" className="hidden h-auto w-full dark:block" priority />
              </figure>
            ) : (
              <figure className="max-w-[130px]">
                <NextImage src={mainLogo} alt="NativPost" className="h-auto w-full dark:invert" priority />
              </figure>
            )}
          </Link>
        </div>

        {/* Org switcher */}
        {!collapsed && (
          <div className="shrink-0 border-b px-3 py-2.5">
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
        )}

        {/* Create post button — team only */}
        {isTeam && (
          <div className={`shrink-0 ${collapsed ? 'px-2 pt-3' : 'px-3 pt-3'}`}>
            <Link
              href="/dashboard/content/create"
              title={collapsed ? 'Create post' : undefined}
              className={`flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90`}
            >
              <Plus className="size-4 shrink-0" />
              {!collapsed && 'Create post'}
            </Link>
          </div>
        )}

        {/* Navigation — hidden scrollbar */}
        <nav
          ref={navRef}
          className="flex-1 overflow-y-auto p-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          {Object.entries(navGroups).map(([group, items]) => {
            const mainItems = items.filter(i => !i.subGroup);
            const subItems = items.filter(i => i.subGroup);
            const subOpen = isSubNavOpen(group, items);

            return (
              <div key={group} className="mb-3">
                {/* Group label */}
                {!collapsed && (
                  <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 select-none">
                    {group}
                  </p>
                )}

                <div className="space-y-0.5">
                  {mainItems.map(item => renderNavItem(item))}
                </div>

                {/* Collapsible sub-group */}
                {subItems.length > 0 && !collapsed && (
                  <div className="mt-0.5">
                    <button
                      type="button"
                      onClick={() => toggleSubNav(group)}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] text-muted-foreground/60 transition-colors hover:bg-muted/70 hover:text-muted-foreground"
                    >
                      <ChevronRight
                        className={`size-3 shrink-0 transition-transform duration-150 ${subOpen ? 'rotate-90' : ''}`}
                      />
                      <span>More</span>
                    </button>
                    {subOpen && (
                      <div className="mt-0.5 space-y-0.5 pl-2">
                        {subItems.map(item => renderNavItem(item, true))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Admin ops — NativPost staff only */}
        {isNativPostStaff && (
          <div className="shrink-0 border-t px-3 py-2">
            <Link
              href="/admin/support"
              onClick={() => setMobileOpen(false)}
              title={collapsed ? 'Admin ops' : undefined}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ShieldCheck className="size-4 shrink-0" />
              {!collapsed && 'Admin ops'}
            </Link>
          </div>
        )}

        {/* User section + collapse toggle */}
        <div className="shrink-0 border-t p-3">
          {!collapsed ? (
            <div className="flex items-center gap-2">
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
              <button
                type="button"
                onClick={toggleCollapsed}
                className="hidden lg:flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Collapse sidebar"
              >
                <ChevronLeft className="size-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <UserButton
                afterSignOutUrl="/"
                appearance={{ elements: { avatarBox: 'size-7' } }}
              />
              <button
                type="button"
                onClick={toggleCollapsed}
                className="hidden lg:flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Expand sidebar"
              >
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4 lg:px-6">
          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 hover:bg-muted lg:hidden"
          >
            <Menu className="size-5" />
          </button>

          {/* Universal search — hidden until the command palette is wired.
            * Bringing it back means implementing the search modal, then
            * re-enabling the button and its shortcut handler. */}

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            <TrialLimitsPill data={trialLimits} />
            <NotificationBell />
            <UserButton
              afterSignOutUrl="/"
              appearance={{ elements: { avatarBox: 'size-8' } }}
            />
          </div>
        </header>
        <BillingGate billing={billingStatus} />
        {/* Page content */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 lg:p-6">
          {children}
        </div>
      </main>

      {/* Support widget */}
      <SupportWidget currentPath={cleanPath} />
    </div>
  );
}
