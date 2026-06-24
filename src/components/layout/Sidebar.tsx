'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Sparkles, Library, Megaphone, Image, BarChart3, Settings, Zap } from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'AI Studio', href: '/dashboard/ai-studio', icon: Sparkles },
  { label: 'Content Library', href: '/dashboard/content-library', icon: Library },
  { label: 'Campaigns', href: '/dashboard/campaigns', icon: Megaphone },
  { label: 'Media Library', href: '/dashboard/media-library', icon: Image },
  { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { label: 'Automation', href: '/dashboard/automation', icon: Zap },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="flex w-64 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-16 items-center gap-3 border-b border-gray-100 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600">
          <span className="text-sm font-bold text-white">N</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">NativPost</p>
          <p className="text-xs text-gray-400">Workspace</p>
        </div>
      </div>
      <nav className="flex-1 py-4">
        <div className="space-y-1 px-3">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? 'bg-purple-50 text-purple-700' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? 'text-purple-600' : 'text-gray-400'}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
