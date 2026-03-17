'use client';

import { OrganizationSwitcher, UserButton } from '@clerk/nextjs';
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  CreditCard,
  HelpCircle,
  LayoutDashboard,
  Link2,
  Menu,
  Palette,
  Settings,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
// import { useTranslations } from 'next-intl';
import { useState } from 'react';

// -----------------------------------------------------------
// SIDEBAR NAV CONFIG
// -----------------------------------------------------------
const mainNav = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    label: 'Brand Profile',
    href: '/dashboard/brand-profile',
    icon: Palette,
  },
  {
    label: 'Content Calendar',
    href: '/dashboard/content',
    icon: Calendar,
  },
  {
    label: 'Approvals',
    href: '/dashboard/approvals',
    icon: CheckCircle2,
    badge: 0, // dynamic count later
  },
  {
    label: 'Social Accounts',
    href: '/dashboard/social-accounts',
    icon: Link2,
  },
  {
    label: 'Analytics',
    href: '/dashboard/analytics',
    icon: BarChart3,
  },
];

const bottomNav = [
  {
    label: 'Billing',
    href: '/dashboard/billing',
    icon: CreditCard,
  },
  {
    label: 'Settings',
    href: '/dashboard/settings',
    icon: Settings,
  },
  {
    label: 'Support',
    href: '#',
    icon: HelpCircle,
    external: true,
  },
];

// -----------------------------------------------------------
// SIDEBAR LINK COMPONENT
// -----------------------------------------------------------
function SidebarLink({
  item,
  isActive,
  onClick,
}: {
  item: (typeof mainNav)[number] & { badge?: number; external?: boolean };
  isActive: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;

  const linkClasses = `
    group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200
    ${
      isActive
        ? 'bg-primary text-primary-foreground'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    }
  `;

  return (
    <Link href={item.href} className={linkClasses} onClick={onClick}>
      <Icon className="size-[18px] shrink-0" />
      <span className="flex-1">{item.label}</span>
      {item.badge !== undefined && item.badge > 0 && (
        <span className="flex size-5 items-center justify-center rounded-full bg-destructive text-[11px] font-semibold text-destructive-foreground">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

// -----------------------------------------------------------
// SIDEBAR COMPONENT
// -----------------------------------------------------------
function Sidebar({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  // Strip locale prefix for matching (e.g. /en/dashboard → /dashboard)
  const cleanPath = pathname.replace(/^\/[a-z]{2}(?=\/)/, '');

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return cleanPath === '/dashboard';
    }
    return cleanPath.startsWith(href);
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r bg-background transition-transform duration-300
          lg:translate-x-0
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b px-4">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            {/* NativPost green icon */}
            <div className="flex size-8 items-center justify-center rounded-full bg-[#16A34A]">
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M3 2.5C3 2.22386 3.22386 2 3.5 2H4.5C4.77614 2 5 2.22386 5 2.5V13.5C5 13.7761 4.77614 14 4.5 14H3.5C3.22386 14 3 13.7761 3 13.5V2.5Z"
                  fill="white"
                />
                <path
                  d="M4 13L12 3"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <path
                  d="M11 2.5C11 2.22386 11.2239 2 11.5 2H12.5C12.7761 2 13 2.22386 13 2.5V13.5C13 13.7761 12.7761 14 12.5 14H11.5C11.2239 14 11 13.7761 11 13.5V2.5Z"
                  fill="white"
                />
              </svg>
            </div>
            <span className="text-base font-bold tracking-tight">
              Nativ
              <span className="opacity-50">Post</span>
            </span>
          </Link>
          {/* Mobile close button */}
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted lg:hidden"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Org switcher */}
        <div className="border-b px-4 py-3">
          <OrganizationSwitcher
            hidePersonal
            appearance={{
              elements: {
                rootBox: 'w-full',
                organizationSwitcherTrigger:
                  'w-full justify-between rounded-lg border px-3 py-2 text-sm',
              },
            }}
          />
        </div>

        {/* Main navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {mainNav.map((item) => (
            <SidebarLink
              key={item.href}
              item={item}
              isActive={isActive(item.href)}
              onClick={onClose}
            />
          ))}
        </nav>

        {/* Bottom navigation */}
        <div className="space-y-1 border-t px-3 py-4">
          {bottomNav.map((item) => (
            <SidebarLink
              key={item.href}
              item={item}
              isActive={isActive(item.href)}
              onClick={onClose}
            />
          ))}
        </div>
      </aside>
    </>
  );
}

// -----------------------------------------------------------
// TOPBAR COMPONENT
// -----------------------------------------------------------
function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur-sm lg:px-6">
      {/* Mobile menu button */}
      <button
        onClick={onMenuClick}
        className="rounded-md p-2 hover:bg-muted lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right side actions */}
      <div className="flex items-center gap-3">
        <UserButton
          afterSignOutUrl="/"
          appearance={{
            elements: {
              avatarBox: 'size-8',
            },
          }}
        />
      </div>
    </header>
  );
}

// -----------------------------------------------------------
// DASHBOARD LAYOUT
// -----------------------------------------------------------
export default function DashboardLayout(props: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-muted/30">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content area — offset by sidebar width on desktop */}
      <div className="lg:pl-[260px]">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />

        <main className="p-4 lg:p-6">
          {props.children}
        </main>
      </div>
    </div>
  );
}
