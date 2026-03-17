'use client';

import {
  // BarChart3,
  Calendar,
  CheckCircle2,
  FileText,
  Link2,
  Loader2,
  Palette,
  Plus,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useBrandProfile } from '@/features/brand-profile/useBrandProfile';
import { EmptyState } from '@/features/dashboard/EmptyState';
import { PageHeader } from '@/features/dashboard/PageHeader';
import { StatCard } from '@/features/dashboard/StatCard';

// -----------------------------------------------------------
// DASHBOARD DATA
// -----------------------------------------------------------
interface DashboardData {
  totalPosts: number;
  pendingApprovals: number;
  connectedPlatforms: number;
  recentContent: Array<{
    id: string;
    caption: string;
    status: string;
    createdAt: string;
    targetPlatforms: string[];
  }>;
}

// -----------------------------------------------------------
// SETUP CHECKLIST ITEM
// -----------------------------------------------------------
function SetupItem({ done, label, href }: { done: boolean; label: string; href: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm transition-colors hover:bg-muted/50"
    >
      <div className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${done ? 'border-[#16A34A] bg-[#16A34A]' : 'border-muted-foreground/30'}`}>
        {done && (
          <svg className="size-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <span className={done ? 'text-muted-foreground line-through' : ''}>{label}</span>
    </Link>
  );
}

// -----------------------------------------------------------
// STATUS COLORS
// -----------------------------------------------------------
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  pending_review: 'bg-yellow-50 text-yellow-700',
  approved: 'bg-blue-50 text-blue-700',
  scheduled: 'bg-purple-50 text-purple-700',
  published: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-700',
};

// -----------------------------------------------------------
// DASHBOARD PAGE
// -----------------------------------------------------------
export default function DashboardPage() {
  const { hasProfile, isLoading: profileLoading, profileCompleteness } = useBrandProfile();
  const [dashData, setDashData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        // Fetch content items
        const contentRes = await fetch('/api/content?limit=5');
        const contentData = contentRes.ok ? await contentRes.json() : { items: [] };

        // Fetch social accounts
        const accountsRes = await fetch('/api/social-accounts');
        const accountsData = accountsRes.ok ? await accountsRes.json() : { accounts: [] };

        // Count pending approvals from all content
        const allContentRes = await fetch('/api/content?status=pending_review&limit=100');
        const allContentData = allContentRes.ok ? await allContentRes.json() : { items: [] };

        setDashData({
          totalPosts: contentData.items?.length || 0,
          pendingApprovals: allContentData.items?.length || 0,
          connectedPlatforms: accountsData.accounts?.length || 0,
          recentContent: (contentData.items || []).slice(0, 5),
        });
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
        setDashData({ totalPosts: 0, pendingApprovals: 0, connectedPlatforms: 0, recentContent: [] });
      } finally {
        setIsLoading(false);
      }
    }

    fetchDashboard();
  }, []);

  if (profileLoading || isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ---- PRE-ONBOARDING STATE ----
  if (!hasProfile) {
    return (
      <>
        <PageHeader
          title="Welcome to NativPost"
          description="Let's get your brand set up. It takes about 10 minutes."
        />

        {/* Brand Profile CTA */}
        <div className="mb-8 overflow-hidden rounded-xl border bg-gradient-to-br from-[#16A34A]/5 via-card to-card">
          <div className="p-6 sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-lg">
                <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-[#16A34A]/10">
                  <Palette className="size-5 text-[#16A34A]" />
                </div>
                <h2 className="mb-2 text-xl font-semibold">Build your Brand Profile</h2>
                <p className="text-sm text-muted-foreground">
                  Your Brand Profile is how NativPost understands your business. It captures your voice, visual identity, and content preferences — so every piece of content feels authentically yours.
                </p>
              </div>
              <Link
                href="/dashboard/brand-profile/onboarding"
                className="inline-flex items-center gap-2 rounded-lg bg-[#16A34A] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-[#15803d]"
              >
                <Plus className="size-4" />
                Start Brand Profile
              </Link>
            </div>
          </div>
          <div className="border-t bg-muted/30 px-6 py-4 sm:px-8">
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-xs text-muted-foreground">
              {['Business basics', 'Voice & personality', 'Visual identity', 'Content preferences', 'Platform voices', 'Review & launch'].map((step, i) => (
                <span key={step} className="flex items-center gap-1.5">
                  <span className={`size-1.5 rounded-full ${i === 0 ? 'bg-[#16A34A]' : 'bg-border'}`} />
                  {step}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Checklist */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Getting started checklist</h3>
          <SetupItem done={false} label="Create your Brand Profile" href="/dashboard/brand-profile/onboarding" />
          <SetupItem done={(dashData?.connectedPlatforms || 0) > 0} label="Connect your first social account" href="/dashboard/social-accounts" />
          <SetupItem done={(dashData?.totalPosts || 0) > 0} label="Review your first content batch" href="/dashboard/content" />
          <SetupItem done={false} label="Publish your first post" href="/dashboard/content" />
        </div>
      </>
    );
  }

  // ---- POST-ONBOARDING STATE ----
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your content overview at a glance."
        actions={
          <Link
            href="/dashboard/content/create"
            className="inline-flex items-center gap-2 rounded-lg bg-[#16A34A] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#15803d]"
          >
            <Plus className="size-4" />
            Create content
          </Link>
        }
      />

      {/* Profile completeness bar (if not 100%) */}
      {profileCompleteness < 100 && (
        <div className="mb-6 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Brand Profile</span>
            <span className="text-xs text-[#16A34A]">{profileCompleteness}% complete</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-[#16A34A] transition-all" style={{ width: `${profileCompleteness}%` }} />
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={FileText} label="Total posts" value={dashData?.totalPosts || 0} />
        <StatCard icon={CheckCircle2} label="Pending approvals" value={dashData?.pendingApprovals || 0} />
        <StatCard icon={TrendingUp} label="Avg. engagement" value="—" />
        <StatCard icon={Link2} label="Connected platforms" value={dashData?.connectedPlatforms || 0} />
      </div>

      {/* Recent content */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">Recent content</h3>
          <Link href="/dashboard/content" className="text-xs font-medium text-[#16A34A] hover:underline">
            View all
          </Link>
        </div>

        {(dashData?.recentContent || []).length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="No content yet"
            description="Generate your first batch of studio-crafted content."
            actionLabel="Create content"
            actionHref="/dashboard/content/create"
          />
        ) : (
          <div className="space-y-2">
            {dashData!.recentContent.map((item) => (
              <Link
                key={item.id}
                href={`/dashboard/content/${item.id}`}
                className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-muted/30"
              >
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[item.status] || 'bg-muted'}`}>
                  {item.status.replace('_', ' ')}
                </span>
                <p className="min-w-0 flex-1 truncate text-sm">{item.caption}</p>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(item.createdAt).toLocaleDateString()}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
