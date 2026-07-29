'use client';

import { OrganizationSwitcher, useAuth, useOrganization, UserButton } from '@clerk/nextjs';
import {
  BarChart3,
  BookOpen,
  Boxes,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  Coins,
  CreditCard,
  ExternalLink,
  FileText,
  Fingerprint,
  Gift,
  Image,
  LayoutList,
  LifeBuoy,
  Link2,
  Megaphone,
  Menu,
  MessageCircle,
  PenLine,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  Zap,
} from 'lucide-react';
import NextImage from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import logoIcon from '/public/assets/images/shared/logo.svg';
import logoDark from '/public/assets/images/shared/logo-dark.svg';
import mainLogo from '/public/assets/images/shared/main-logo.svg';
import { type TrialLimitsData, TrialLimitsPill } from '@/components/billing/TrialLimitsPill';
import { FeedbackDialog } from '@/components/feedback/FeedbackDialog';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { QueryProvider } from '@/components/providers/QueryProvider';
import SupportWidget from '@/components/support/SupportWidget';
import { CommandPalette } from '@/components/ui/command-palette';
import { Kbd } from '@/components/ui/kbd';
import { Toaster } from '@/components/ui/toaster';
import { useOrgCredits } from '@/features/credits/useOrgCredits';
import { type BillingGateState, BillingGate } from '@/features/dashboard/BillingGate';
import { useOrgSync } from '@/hooks/useOrgSync';
import type { NavItem } from '@/lib/roles';
import { getFooterNavForRole, getNavForRole, getUserRole, isTeamMember } from '@/lib/roles';

const ICONS: Record<string, typeof Calendar> = {
  BarChart3,
  BookOpen,
  Boxes,
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
  UserRound,
  Users,
  Gift,
  MessageCircle,
  Zap,
};

// -----------------------------------------------------------
// CreditsNavPill — compact AI-credits balance in the header.
// Reuses the shared useOrgCredits hook (no extra fetch) and links to the
// Credits settings tab. Balance mirrors CreditBadge:
// monthlyRemaining + addon.remaining - reserved.
// -----------------------------------------------------------
function CreditsNavPill() {
  const { wallet, loading } = useOrgCredits();

  if (loading && !wallet) return null;
  if (!wallet) return null;

  const monthlyRemaining = Math.max(0, wallet.monthly.limit - wallet.monthly.used);
  const reserved = wallet.reservedCredits ?? 0;
  const balance = Math.max(0, monthlyRemaining + wallet.addon.remaining - reserved);
  const display = balance >= 1000 ? `${(balance / 1000).toFixed(1)}k` : String(balance);

  return (
    <Link
      href="/dashboard/settings?tab=credits"
      aria-label={`${balance} AI credits remaining. Click to manage credits.`}
      title={`${balance.toLocaleString()} AI credits`}
      className="hidden h-7 items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:inline-flex"
    >
      <Coins className="size-3.5" />
      <span>{display}</span>
    </Link>
  );
}

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
  const [currentPlan, setCurrentPlan] = useState<string>(plan || 'free');
  const [billingStatus, setBillingStatus] = useState<BillingGateState | null>(null);
  const [trialLimits, setTrialLimits] = useState<TrialLimitsData | null>(null);
  const [workspaceUsage, setWorkspaceUsage] = useState<{ count: number; limit: number } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [isMac, setIsMac] = useState(true);
  const navRef = useRef<HTMLElement>(null);

  const role = getUserRole(orgRole);
  const navGroups = getNavForRole(role);
  const footerNav = getFooterNavForRole(role);
  const isTeam = isTeamMember(role);

  const orgId = organization?.id;
  const teamOrgId = process.env.NEXT_PUBLIC_NATIVPOST_TEAM_ORG_ID;
  const isNativPostStaff = !!(teamOrgId && orgId === teamOrgId && role === 'admin');

  useOrgSync();

  // Restore sidebar collapse state from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('np-sidebar-collapsed');
      if (stored === 'true') {
        setCollapsed(true);
      }
    } catch { /* ignore */ }
  }, []);

  // Global ⌘K / Ctrl+K opens the command palette
  useEffect(() => {
    setIsMac(/mac|iphone|ipad/i.test(navigator.userAgent));
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(prev => !prev);
        return;
      }
      // "/" opens the palette too — but never while the user is typing.
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        const typing = !!target && (
          target.tagName === 'INPUT'
          || target.tagName === 'TEXTAREA'
          || target.tagName === 'SELECT'
          || target.isContentEditable
        );
        if (!typing) {
          e.preventDefault();
          setPaletteOpen(true);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('np-sidebar-collapsed', String(next));
      } catch { /* ignore */ }
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
        isFree?: boolean;
        freeTrialEnded?: boolean;
        isTrialing?: boolean;
        trialDaysLeft?: number;
        trialExpired?: boolean;
        usage?: { postsThisMonth?: number; postsLimit?: number };
      } | null) => {
        if (data?.plan) {
          setCurrentPlan(data.plan);
        }
        if (data) {
          setBillingStatus({
            planStatus: data.planStatus ?? '',
            freeTrialEnded: !!data.freeTrialEnded,
          });
          setTrialLimits({
            isTrialing: !!data.isTrialing,
            trialDaysLeft: data.trialDaysLeft ?? 0,
            trialExpired: !!data.trialExpired,
            isFree: !!data.isFree,
            plan: data.plan ?? 'free',
            usage: {
              postsThisMonth: data.usage?.postsThisMonth ?? 0,
              postsLimit: data.usage?.postsLimit ?? 0,
            },
          });
        }
      })
      .catch(() => null);
  }, []);

  // Fetch workspace usage to drive the soft create-org gate near the switcher.
  useEffect(() => {
    fetch('/api/workspaces/usage', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((data: { count?: number; limit?: number } | null) => {
        if (data && typeof data.count === 'number' && typeof data.limit === 'number') {
          setWorkspaceUsage({ count: data.count, limit: data.limit });
        }
      })
      .catch(() => null);
  }, []);

  const workspaceLimitReached
    = !!workspaceUsage && workspaceUsage.limit !== -1 && workspaceUsage.count >= workspaceUsage.limit;

  const cleanPath = pathname.replace(/^\/[a-z]{2}(\/|$)/, '/');

  const isActive = (href: string) => {
    if (href.startsWith('http')) {
      return false;
    }
    if (href.includes('?')) {
      return (
        cleanPath === href.split('?')[0]
        && pathname.includes(href.split('?')[1] ?? '')
      );
    }
    return cleanPath === href || cleanPath.startsWith(`${href}/`);
  };

  const isPlanEligible = (item: NavItem) => {
    if (!item.planRequired) {
      return true;
    }
    return item.planRequired.includes(currentPlan);
  };

  // Check if any sub-items in a group are active (auto-expand accordion)
  const hasActiveSubItem = (items: NavItem[]) => items.some(i => i.subGroup && isActive(i.href));

  const toggleSubNav = (group: string) => {
    setSubNavOpen(prev => ({ ...prev, [group]: !prev[group] }));
  };

  const isSubNavOpen = (group: string, items: NavItem[]) => {
    if (subNavOpen[group] !== undefined) {
      return subNavOpen[group];
    }
    return hasActiveSubItem(items);
  };

  const renderNavItem = (item: NavItem, dense = false) => {
    const Icon = ICONS[item.icon] ?? FileText;
    const active = isActive(item.href);
    const eligible = isPlanEligible(item);

    const py = dense ? 'py-1.5' : 'py-2';
    const baseClass = `relative flex items-center gap-2.5 rounded-lg px-2.5 ${py} text-ui transition-all duration-150 w-full`;
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
              <ExternalLink className="ml-auto size-3 shrink-0 text-muted-foreground/50" />
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
    <QueryProvider>
      <div className="flex h-screen overflow-hidden bg-muted/30">
        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex h-screen flex-col border-r bg-background transition-all duration-200 ease-in-out
          ${collapsed ? 'w-[56px]' : 'w-[220px]'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:static lg:inset-y-auto lg:z-auto lg:shrink-0 lg:translate-x-0`}
        >
          {/* Logo */}
          <div className={`flex h-14 shrink-0 items-center border-b ${collapsed ? 'justify-center px-0' : 'px-4'}`}>
            <Link href="/dashboard" className="inline-flex min-w-0 items-center">
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
                    // Soft gate: once the user is at their plan's workspace
                    // limit, hide Clerk's built-in create-organization action.
                    // The webhook backstop still enforces this server-side.
                    ...(workspaceLimitReached
                      ? { organizationSwitcherPopoverActionButton__createOrganization: 'hidden' }
                      : {}),
                  },
                }}
              />
              {workspaceUsage && (
                <p className="mt-2 text-meta text-muted-foreground">
                  {workspaceUsage.count}
                  {' / '}
                  {workspaceUsage.limit === -1 ? 'Unlimited' : workspaceUsage.limit}
                  {' workspaces'}
                </p>
              )}
              {workspaceLimitReached && (
                <Link
                  href="/dashboard/billing"
                  className="mt-1 block text-meta font-medium text-primary hover:underline"
                >
                  Upgrade to add more workspaces
                </Link>
              )}
            </div>
          )}

          {/* Create post button — team only */}
          {isTeam && (
            <div className={`shrink-0 ${collapsed ? 'px-2 pt-3' : 'px-3 pt-3'}`}>
              <Link
                href="/dashboard/content/create"
                title={collapsed ? 'Create post' : undefined}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Plus className="size-4 shrink-0" />
                {!collapsed && 'Create post'}
              </Link>
            </div>
          )}

          {/* Navigation — hidden scrollbar */}
          <nav
            ref={navRef}
            className="flex-1 overflow-y-auto p-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {Object.entries(navGroups).map(([group, items]) => {
              const mainItems = items.filter(i => !i.subGroup);
              const subItems = items.filter(i => i.subGroup);
              const subOpen = isSubNavOpen(group, items);

              return (
                <div key={group} className="mb-3">
                  {/* Group label */}
                  {!collapsed && (
                    <p className="mb-1 select-none px-2.5 font-mono text-label uppercase text-muted-foreground/50">
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
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-meta text-muted-foreground/60 transition-colors hover:bg-muted/70 hover:text-muted-foreground"
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

          {/* Pinned footer cluster — secondary account/resource links kept out
              of the scrolling list so the primary nav fits one viewport. */}
          {footerNav.length > 0 && (
            <div className="shrink-0 border-t px-3 py-2">
              <div className="space-y-0.5">
                {footerNav.map(item => renderNavItem(item, true))}
              </div>
            </div>
          )}

          {/* Admin ops — NativPost staff only */}
          {isNativPostStaff && (
            <div className="shrink-0 border-t px-3 py-2">
              <Link
                href="/admin/support"
                onClick={() => setMobileOpen(false)}
                title={collapsed ? 'Admin ops' : undefined}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-ui text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
                  <p className="truncate text-micro text-muted-foreground">
                    {isTeam
                      ? 'NativPost Team'
                      : `${currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)} plan`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  className="hidden size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex"
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
                  className="hidden size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex"
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
          <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3 sm:gap-3 sm:px-4 lg:px-6">
            {/* Mobile menu toggle */}
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="shrink-0 rounded-lg p-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>

            {/* Universal search — opens the command palette (⌘K / Ctrl+K) */}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="hidden w-full max-w-xs items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5 text-body text-muted-foreground transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex"
            >
              <Search className="size-4 shrink-0" />
              <span className="flex-1 text-left">Search…</span>
              <Kbd className="bg-background">{isMac ? '⌘K' : 'Ctrl K'}</Kbd>
            </button>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
              aria-label="Search"
            >
              <Search className="size-5" />
            </button>

            <div className="min-w-0 flex-1" />

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => setFeedbackOpen(true)}
                className="hidden rounded-lg border px-3 py-1.5 text-ui font-medium text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:block"
              >
                Feedback
              </button>
              <a
                href="https://docs.nativpost.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Documentation"
                title="Docs"
                className="hidden size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex"
              >
                <BookOpen className="size-5" />
              </a>
              <a
                href="https://discord.com/invite/N5SgkwfCAY"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Join our Discord"
                title="Join our Discord"
                className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-5"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
                </svg>
              </a>
              <CreditsNavPill />
              <TrialLimitsPill data={trialLimits} />
              <NotificationBell />
              <UserButton
                afterSignOutUrl="/"
                appearance={{ elements: { avatarBox: 'size-8' } }}
              />
            </div>
          </header>
          <BillingGate billing={billingStatus} />
          {/* Page content. --header-h = header (56px) + this wrapper's vertical
              padding, so full-viewport views (Blitz) can size themselves with
              h-[calc(100dvh-var(--header-h))] without guessing the chrome. */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 [--header-h:88px] lg:p-6 lg:[--header-h:104px]">
            {children}
          </div>
        </main>

        {/* Command palette (⌘K) */}
        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          role={role}
          currentPlan={currentPlan}
          isTeam={isTeam}
        />

        {/* Feedback dialog */}
        <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} currentPath={cleanPath} />

        {/* Support widget */}
        <SupportWidget currentPath={cleanPath} />
        <Toaster />
      </div>
    </QueryProvider>
  );
}
