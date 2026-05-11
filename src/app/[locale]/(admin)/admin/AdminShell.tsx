'use client';

/**
 * src/app/[locale]/(admin)/admin/AdminShell.tsx
 *
 * The admin ops shell. Deliberately different from the client dashboard:
 * - No OrgSwitcher (admins operate across all orgs)
 * - Different nav: Tickets, Knowledge Base, Analytics, Settings
 * - Red "Admin" badge so the team always knows which surface they're on
 * - UserButton kept for sign-out
 */

import { useAuth, UserButton } from '@clerk/nextjs';
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  HeadphonesIcon,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Settings,
  ShieldCheck,
  Tag,
} from 'lucide-react';
import NextImage from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import mainLogo from '/public/assets/images/shared/main-logo.svg';

// -----------------------------------------------------------
// NAV DEFINITION
// -----------------------------------------------------------
const NAV = [
  {
    group: 'Support ops',
    items: [
      { label: 'Overview', href: '/admin/support', icon: LayoutDashboard },
      { label: 'All tickets', href: '/admin/support/tickets', icon: MessageSquare },
      { label: 'Open', href: '/admin/support/tickets?status=open', icon: HeadphonesIcon },
    ],
  },
  {
    group: 'Knowledge base',
    items: [
      { label: 'Articles', href: '/admin/support/kb', icon: BookOpen },
      { label: 'Categories', href: '/admin/support/kb/categories', icon: Tag },
    ],
  },
  {
    group: 'Analytics',
    items: [
      { label: 'Support stats', href: '/admin/support/analytics', icon: BarChart3 },
    ],
  },
  {
    group: 'System',
    items: [
      { label: 'Settings', href: '/admin/settings', icon: Settings },
    ],
  },
];

// -----------------------------------------------------------
// COMPONENT
// -----------------------------------------------------------
export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { orgId, orgRole, isLoaded } = useAuth();
  const [open, setOpen] = useState(false);

  // Client-side auth gate — belt-and-suspenders after middleware
  const teamOrgId = process.env.NEXT_PUBLIC_NATIVPOST_TEAM_ORG_ID;
  const isStaff = !!(teamOrgId && orgId === teamOrgId && orgRole === 'org:admin');

  useEffect(() => {
    if (isLoaded && !isStaff) {
      router.replace('/dashboard');
    }
  }, [isLoaded, isStaff, router]);

  if (!isLoaded || !isStaff) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Strip locale prefix for active matching
  const clean = pathname.replace(/^\/[a-z]{2}(\/|$)/, '/');

  const isActive = (href: string) => {
    const path = href.split('?')[0]!;
    const query = href.includes('?') ? href.split('?')[1] : null;
    if (query) return clean === path && pathname.includes(query);
    // Exact match for overview, prefix match for others
    if (href === '/admin/support') return clean === '/admin/support';
    return clean.startsWith(path);
  };

  const Sidebar = () => (
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r bg-background">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b px-4">
        <Link href="/admin/support" className="flex items-center gap-2.5">
          <figure className="max-w-[110px]">
            <NextImage src={mainLogo} alt="NativPost" className="h-auto w-full dark:invert" priority />
          </figure>
        </Link>
        {/* Admin badge */}
        <span className="flex items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-600">
          <ShieldCheck className="size-3" />
          Admin
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3">
        {NAV.map(({ group, items }) => (
          <div key={group} className="mb-4">
            <p className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
              {group}
            </p>
            <div className="space-y-0.5">
              {items.map(({ label, href, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href + label}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors ${active
                        ? 'bg-primary/10 font-medium text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                  >
                    <Icon className="size-4 shrink-0" />
                    {label}
                    {active && <ChevronRight className="ml-auto size-3 opacity-40" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer — back to dashboard + user */}
      <div className="border-t p-3 space-y-2">
        <Link
          href="/dashboard"
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronRight className="size-4 rotate-180" />
          Back to dashboard
        </Link>
        <div className="flex items-center gap-2.5 px-1">
          <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: 'size-8' } }} />
          <p className="text-xs text-muted-foreground">NativPost team</p>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-muted/30">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {/* Mobile sidebar */}
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-50 lg:hidden">
            <Sidebar />
          </div>
        </>
      )}

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setOpen(true)}
              className="rounded-lg p-2 hover:bg-muted lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>
            {/* Breadcrumb context */}
            <span className="hidden text-sm text-muted-foreground sm:block">
              NativPost Support Operations
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-600">
              Internal admin
            </span>
            <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: 'size-8' } }} />
          </div>
        </header>

        {/* Page */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}