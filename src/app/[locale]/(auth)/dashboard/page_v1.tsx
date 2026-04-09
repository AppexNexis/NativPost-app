'use client';

import { Link2Icon } from '@radix-ui/react-icons';
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock,
  Eye,
  // FileText,
  Loader2,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { StatCard } from '@/features/dashboard/StatCard';

type DashboardData = {
  pendingApprovals: number;
  scheduledPosts: number;
  publishedThisMonth: number;
  totalPublished: number;
  recentPending: Array<{
    id: string;
    caption: string;
    status: string;
    targetPlatforms: string[];
    createdAt: string;
  }>;
};

const PLATFORM_EMOJI: Record<string, string> = {
  instagram: '📸',
  linkedin: '💼',
  twitter: '𝕏',
  facebook: '📘',
  tiktok: '🎵',
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [pendingRes, scheduledRes, publishedRes] = await Promise.all([
          fetch('/api/content?status=pending_review&limit=10'),
          fetch('/api/content?status=scheduled&limit=100'),
          fetch('/api/content?status=published&limit=100'),
        ]);

        const pending = pendingRes.ok ? (await pendingRes.json()).items || [] : [];
        const scheduled = scheduledRes.ok ? (await scheduledRes.json()).items || [] : [];
        const published = publishedRes.ok ? (await publishedRes.json()).items || [] : [];

        setData({
          pendingApprovals: pending.length,
          scheduledPosts: scheduled.length,
          publishedThisMonth: published.filter((p: { publishedAt: string }) => {
            if (!p.publishedAt) {
              return false;
            }
            const d = new Date(p.publishedAt);
            const now = new Date();
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          }).length,
          totalPublished: published.length,
          recentPending: pending.slice(0, 5),
        });
      } catch (err) {
        console.error('Dashboard load failed:', err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your content overview at a glance.
        </p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Clock} label="Pending approval" value={data?.pendingApprovals || 0} />
        <StatCard icon={CalendarDays} label="Scheduled" value={data?.scheduledPosts || 0} />
        <StatCard icon={CheckCircle2} label="Published this month" value={data?.publishedThisMonth || 0} />
        <StatCard icon={TrendingUp} label="Total published" value={data?.totalPublished || 0} />
      </div>

      {/* Pending approvals — the primary action for customers */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Waiting for your approval</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Our team has crafted new content for your brand. Review and approve to publish.
            </p>
          </div>
          {(data?.pendingApprovals || 0) > 0 && (
            <Link
              href="/dashboard/approvals"
              className="rounded-lg bg-[#16A34A] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#15803d]"
            >
              Review all (
              {data?.pendingApprovals}
              )
            </Link>
          )}
        </div>

        {(data?.recentPending || []).length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center text-center">
            <div>
              <CheckCircle2 className="mx-auto mb-2 size-8 text-[#16A34A]/40" />
              <p className="text-sm font-medium text-muted-foreground">All caught up</p>
              <p className="mt-1 text-xs text-muted-foreground">
                No content waiting for approval. We'll notify you when new posts are ready.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y">
            {data!.recentPending.map(item => (
              <Link
                key={item.id}
                href={`/dashboard/content/${item.id}`}
                className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-muted/30"
              >
                <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-yellow-100">
                  <span className="size-2 rounded-full bg-yellow-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm leading-relaxed">{item.caption}</p>
                  <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      {(item.targetPlatforms || []).map(p => (
                        <span key={p}>{PLATFORM_EMOJI[p]}</span>
                      ))}
                    </span>
                    <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <Eye className="mt-1 size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Link
          href="/dashboard/calendar"
          className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/30"
        >
          <CalendarDays className="size-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Content calendar</p>
            <p className="text-xs text-muted-foreground">View your publishing schedule</p>
          </div>
        </Link>
        <Link
          href="/dashboard/analytics"
          className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/30"
        >
          <BarChart3 className="size-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Analytics</p>
            <p className="text-xs text-muted-foreground">See how your content performs</p>
          </div>
        </Link>
        <Link
          href="/dashboard/connections"
          className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/30"
        >
          <Link2Icon className="size-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Connections</p>
            <p className="text-xs text-muted-foreground">Manage social accounts</p>
          </div>
        </Link>
      </div>
    </>
  );
}
