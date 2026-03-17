'use client';

import { useAuth, useOrganization, UserButton, OrganizationSwitcher } from '@clerk/nextjs';
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  // ChevronDown,
  CircleCheck,
  Clock,
  CreditCard,
  FileText,
  Fingerprint,
  LayoutList,
  Link2,
  Menu,
  PenLine,
  Plus,
  Settings,
  Users,

} from 'lucide-react';
// import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { getNavForRole, getUserRole, isTeamMember,} from '@/lib/roles';

// Icon map for dynamic rendering
const ICONS: Record<string, typeof Calendar> = {
  Calendar, LayoutList, Clock, CheckCircle2, FileText, CircleCheck,
  BarChart3, PenLine, Fingerprint, Link2, Users, Settings, CreditCard,
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { orgRole } = useAuth();
  const { organization } = useOrganization();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const role = getUserRole(orgRole);
  const navGroups = getNavForRole(role);
  const isTeam = isTeamMember(role);

  // Strip locale prefix for active link matching
  const cleanPath = pathname.replace(/^\/[a-z]{2}(\/|$)/, '/');

  const isActive = (href: string) => {
    if (href.includes('?')) {
      return cleanPath === href.split('?')[0] && pathname.includes(href.split('?')[1] || '');
    }
    return cleanPath === href || cleanPath.startsWith(href + '/');
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
        <div className="flex h-14 items-center gap-2.5 border-b px-5">
          <div className="flex size-7 items-center justify-center rounded-full bg-[#16A34A]">
            <span className="text-xs font-bold text-white">N</span>
          </div>
          <span className="text-sm font-semibold tracking-tight">NativPost</span>
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

        {/* Create post button (team only) */}
        {isTeam && (
          <div className="px-3 pt-3">
            <Link
              href="/dashboard/content/create"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#16A34A] px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#15803d]"
            >
              <Plus className="size-4" />
              Create post
            </Link>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-3">
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
                          ? 'bg-[#16A34A]/10 font-medium text-[#16A34A]'
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

        {/* User section */}
        <div className="border-t px-3 py-3">
          <div className="flex items-center gap-2.5">
            <UserButton
              afterSignOutUrl="/"
              appearance={{
                elements: { avatarBox: 'size-8' },
              }}
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
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 hover:bg-muted lg:hidden"
          >
            <Menu className="size-5" />
          </button>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-3">
            <UserButton
              afterSignOutUrl="/"
              appearance={{
                elements: { avatarBox: 'size-8' },
              }}
            />
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
