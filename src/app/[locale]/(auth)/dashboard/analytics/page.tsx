'use client';

import {
  BarChart3,
  Eye,
  Heart,
  Loader2,
  MessageCircle,
  // MousePointerClick,
  // Share2,
  TrendingUp,
  // Users,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { PageHeader } from '@/features/dashboard/PageHeader';
import { StatCard } from '@/features/dashboard/StatCard';
import { EmptyState } from '@/features/dashboard/EmptyState';

interface ContentItem {
  id: string;
  caption: string;
  status: string;
  targetPlatforms: string[];
  engagementData: Record<string, number>;
  publishedAt: string | null;
  antiSlopScore: number | null;
}

interface AnalyticsSummary {
  totalPublished: number;
  totalReach: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  avgEngagementRate: number;
  topContent: ContentItem[];
  platformBreakdown: Record<string, number>;
}

const PLATFORM_EMOJI: Record<string, string> = {
  instagram: '📸', linkedin: '💼', twitter: '𝕏', facebook: '📘', tiktok: '🎵',
};

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/content?status=published&limit=100');
        if (res.ok) {
          const data = await res.json();
          const items: ContentItem[] = data.items || [];
          setAnalytics(computeAnalytics(items));
        }
      } catch (err) {
        console.error('Failed to load analytics:', err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  if (isLoading) {
    return (
      <>
        <PageHeader title="Analytics" description="Track how your content performs across all platforms." />
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  if (!analytics || analytics.totalPublished === 0) {
    return (
      <>
        <PageHeader title="Analytics" description="Track how your content performs across all platforms." />
        <EmptyState
          icon={BarChart3}
          title="No data yet"
          description="Publish your first content to start tracking engagement. Analytics update automatically once posts are live."
          actionLabel="Create content"
          actionHref="/dashboard/content/create"
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Analytics" description="Track how your content performs across all platforms." />

      {/* Summary stats */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Eye} label="Total reach" value={formatNumber(analytics.totalReach)} />
        <StatCard icon={Heart} label="Total likes" value={formatNumber(analytics.totalLikes)} />
        <StatCard icon={MessageCircle} label="Total comments" value={formatNumber(analytics.totalComments)} />
        <StatCard icon={TrendingUp} label="Avg. engagement" value={`${analytics.avgEngagementRate.toFixed(1)}%`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Top performing content */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold">Top performing content</h3>
            {analytics.topContent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No engagement data yet.</p>
            ) : (
              <div className="space-y-3">
                {analytics.topContent.map((item, i) => {
                  const engagement = item.engagementData || {};
                  const totalEng = (engagement.likes || 0) + (engagement.comments || 0) + (engagement.shares || 0);
                  return (
                    <Link
                      key={item.id}
                      href={`/dashboard/content/${item.id}`}
                      className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/30"
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm line-clamp-2">{item.caption}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            {(item.targetPlatforms || []).map((p) => (
                              <span key={p}>{PLATFORM_EMOJI[p]}</span>
                            ))}
                          </span>
                          {engagement.reach && <span>{formatNumber(engagement.reach)} reach</span>}
                          <span>{formatNumber(totalEng)} engagements</span>
                          {item.publishedAt && (
                            <span>{new Date(item.publishedAt).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Platform breakdown + Publishing stats */}
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold">Posts by platform</h3>
            <div className="space-y-3">
              {Object.entries(analytics.platformBreakdown).map(([platform, count]) => (
                <div key={platform} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>{PLATFORM_EMOJI[platform] || ''}</span>
                    <span className="text-sm capitalize">{platform}</span>
                  </div>
                  <span className="text-sm font-semibold">{count}</span>
                </div>
              ))}
              {Object.keys(analytics.platformBreakdown).length === 0 && (
                <p className="text-xs text-muted-foreground">No platform data yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold">Content quality</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Published posts</span>
                <span className="text-sm font-semibold">{analytics.totalPublished}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total interactions</span>
                <span className="text-sm font-semibold">
                  {formatNumber(analytics.totalLikes + analytics.totalComments + analytics.totalShares)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// -----------------------------------------------------------
// HELPERS
// -----------------------------------------------------------

function computeAnalytics(items: ContentItem[]): AnalyticsSummary {
  let totalReach = 0, totalLikes = 0, totalComments = 0, totalShares = 0;
  const platformCounts: Record<string, number> = {};

  for (const item of items) {
    const eng = item.engagementData || {};
    totalReach += (eng.reach || 0);
    totalLikes += (eng.likes || 0);
    totalComments += (eng.comments || 0);
    totalShares += (eng.shares || 0);

    for (const p of (item.targetPlatforms || [])) {
      platformCounts[p] = (platformCounts[p] || 0) + 1;
    }
  }

  const avgEngagementRate = totalReach > 0
    ? ((totalLikes + totalComments + totalShares) / totalReach) * 100
    : 0;

  // Sort by total engagement for top content
  const sorted = [...items]
    .map((item) => {
      const eng = item.engagementData || {};
      const total = (eng.likes || 0) + (eng.comments || 0) + (eng.shares || 0);
      return { ...item, _totalEng: total };
    })
    .sort((a, b) => b._totalEng - a._totalEng)
    .slice(0, 5);

  return {
    totalPublished: items.length,
    totalReach,
    totalLikes,
    totalComments,
    totalShares,
    avgEngagementRate,
    topContent: sorted,
    platformBreakdown: platformCounts,
  };
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
