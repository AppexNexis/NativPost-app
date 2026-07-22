'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Eye,
  // Heart,
  MessageCircle,
  RefreshCw,
  Share2,
  ThumbsUp,
  TrendingUp,
  Video,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { EmptyState } from '@/features/dashboard/EmptyState';
import { ErrorBanner } from '@/features/dashboard/ErrorBanner';
import { PageHeader } from '@/features/dashboard/PageHeader';
import { AnalyticsSkeleton } from '@/features/dashboard/PageSkeletons';
import { fetchJson } from '@/lib/fetch-json';
import { PLATFORM_COLORS, PLATFORM_LABELS } from '@/lib/platforms';

// -----------------------------------------------------------
// TYPES
// -----------------------------------------------------------
type PlatformMetrics = {
  likes?: number;
  comments?: number;
  shares?: number;
  retweets?: number;
  impressions?: number;
  reach?: number;
  views?: number;
  saved?: number;
  replies?: number;
  bookmarks?: number;
  favorites?: number;
  clicks?: number;
};

type PostTotals = {
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  reach: number;
  views: number;
  engagement: number;
  engagementRate: number;
};

type Post = {
  id: string;
  caption: string;
  contentType: string;
  platforms: string[];
  platformMetrics: Record<string, PlatformMetrics>;
  publishedAt: string | null;
  antiSlopScore: number | null;
  hasEngagementData: boolean;
  publishedPlatforms: string[];
  totals: PostTotals;
};

type PlatformTotal = {
  posts: number;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  reach: number;
  views: number;
};

type Analytics = {
  summary: {
    totalPublished: number;
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    totalImpressions: number;
    totalReach: number;
    totalViews: number;
    totalEngagement: number;
    avgEngagementRate: number;
  };
  platformTotals: Record<string, PlatformTotal>;
  posts: Post[];
  topPosts: Post[];
  lastSyncedAt: string | null;
};

// -----------------------------------------------------------
// HELPERS
// -----------------------------------------------------------
function fmt(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}K`;
  }
  return String(n);
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) {
    return `${mins}m ago`;
  }
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    return `${hrs}h ago`;
  }
  return `${Math.floor(hrs / 24)}d ago`;
}

// Inline platform badge — text only, no emojis
function PlatformBadge({ platform }: { platform: string }) {
  const color = PLATFORM_COLORS[platform] || 'bg-zinc-500';
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold text-white ${color}`}>
      {PLATFORM_LABELS[platform] || platform}
    </span>
  );
}

// Simple stat pill
function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="inline-flex items-center gap-1 text-meta text-muted-foreground">
      <span className="font-medium text-foreground">{value}</span>
      {label}
    </span>
  );
}

// Platform metrics row inside expanded post
function PlatformMetricsRow({ platform, metrics }: { platform: string; metrics: PlatformMetrics }) {
  const entries = Object.entries(metrics).filter(([, v]) => v !== undefined && v > 0);
  if (entries.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <PlatformBadge platform={platform} />
        <span className="text-meta text-muted-foreground">No data yet</span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <PlatformBadge platform={platform} />
      {entries.map(([key, val]) => (
        <StatPill key={key} label={key} value={fmt(val as number)} />
      ))}
    </div>
  );
}

// Summary card
function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Eye;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-meta text-muted-foreground">{sub}</p>}
    </div>
  );
}

// -----------------------------------------------------------
// PAGE
// -----------------------------------------------------------
export default function AnalyticsPage() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [expandedPost, setExpandedPost] = useState<string | null>(null);

  // Cached server state — back-navigation paints instantly, revalidates quietly.
  const { data: analytics, isLoading, error: loadError, refetch } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetchJson<Analytics>('/api/analytics'),
  });

  const syncNow = async () => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      // Call via internal API route that handles auth server-side
      const res = await fetch('/api/analytics/sync', { method: 'POST' });
      if (res.ok) {
        // Reload analytics data after sync
        await refetch();
      } else {
        setSyncError('Sync failed. Try again.');
      }
    } catch {
      setSyncError('Network error. Try again.');
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <>
        <PageHeader title="Analytics" description="Track how your content performs across all platforms." />
        <AnalyticsSkeleton />
      </>
    );
  }

  if (loadError && !analytics) {
    return (
      <>
        <PageHeader title="Analytics" description="Track how your content performs across all platforms." />
        <ErrorBanner
          title="Couldn't load analytics"
          detail={loadError.message}
          onRetry={() => {
            void refetch();
          }}
        />
      </>
    );
  }

  if (!analytics || analytics.summary.totalPublished === 0) {
    return (
      <>
        <PageHeader title="Analytics" description="Track how your content performs across all platforms." />
        <EmptyState
          icon={BarChart3}
          title="Publish your first post to unlock analytics"
          description="Engagement, reach, and follower growth sync every 6 hours once posts are live. Start with Blitz for a ready-to-go queue, or build a post from scratch."
          primary={{ label: 'Start with Blitz', href: '/dashboard/blitz' }}
          secondary={{ label: 'Create manually', href: '/dashboard/content/create' }}
        />
      </>
    );
  }

  const { summary, platformTotals, posts, topPosts, lastSyncedAt } = analytics;
  const hasEngagementData = posts.some(p => p.hasEngagementData);

  // Bar chart max for platform breakdown
  const maxPlatformPosts = Math.max(...Object.values(platformTotals).map(p => p.posts), 1);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Track how your content performs across all platforms."
        actions={(
          <div className="flex items-center gap-3">
            {lastSyncedAt && (
              <span className="hidden text-meta text-muted-foreground sm:block">
                Synced
                {' '}
                {relativeTime(lastSyncedAt)}
              </span>
            )}
            <button
              type="button"
              onClick={syncNow}
              disabled={isSyncing}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60"
            >
              <RefreshCw className={`size-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Sync now'}
            </button>
          </div>
        )}
      />

      {syncError && (
        <div className="mb-4">
          <ErrorBanner
            title="Sync failed"
            detail={syncError}
            onRetry={() => {
              void syncNow();
            }}
            onDismiss={() => setSyncError(null)}
          />
        </div>
      )}

      {!hasEngagementData && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-900/20">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Engagement data hasn't synced yet. Click "Sync now" to fetch the latest metrics from your connected platforms, or wait for the next automatic sync in up to 6 hours.
          </p>
        </div>
      )}

      {/* Summary stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <SummaryCard
          icon={Eye}
          label="Total impressions"
          value={fmt(summary.totalImpressions || summary.totalReach)}
          sub={summary.totalViews > 0 ? `${fmt(summary.totalViews)} views` : undefined}
        />
        <SummaryCard
          icon={ThumbsUp}
          label="Total likes"
          value={fmt(summary.totalLikes)}
        />
        <SummaryCard
          icon={MessageCircle}
          label="Total comments"
          value={fmt(summary.totalComments)}
        />
        <SummaryCard
          icon={TrendingUp}
          label="Avg. engagement"
          value={`${summary.avgEngagementRate.toFixed(1)}%`}
          sub={`${summary.totalPublished} published posts`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── Posts table ──────────────────────────── */}
        <div className="space-y-4 lg:col-span-2">

          {/* Top performing */}
          {topPosts.length > 0 && topPosts[0]!.totals.engagement > 0 && (
            <div className="rounded-xl border bg-card p-5">
              <h3 className="mb-4 border-b pb-3 text-sm font-semibold">Top performing</h3>
              <div className="space-y-2">
                {topPosts.map((post, i) => (
                  <Link
                    key={post.id}
                    href={`/dashboard/content/${post.id}`}
                    className="flex items-start gap-3 rounded-lg p-2.5 transition-colors hover:bg-muted/40"
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-micro font-bold text-muted-foreground">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm leading-snug">{post.caption}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {post.platforms.map(p => (
                          <PlatformBadge key={p} platform={p} />
                        ))}
                        <StatPill label="likes" value={fmt(post.totals.likes)} />
                        <StatPill label="comments" value={fmt(post.totals.comments)} />
                        {post.totals.impressions > 0 && (
                          <StatPill label="impressions" value={fmt(post.totals.impressions)} />
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-primary">
                      {post.totals.engagementRate.toFixed(1)}
                      %
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* All posts */}
          <div className="rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h3 className="text-sm font-semibold">All published posts</h3>
              <span className="text-meta text-muted-foreground">
                {posts.length}
                {' '}
                posts
              </span>
            </div>

            <div className="divide-y">
              {posts.map((post) => {
                const isExpanded = expandedPost === post.id;
                const platformsWithData = post.platforms.filter(
                  p => post.platformMetrics[p] && Object.values(post.platformMetrics[p] || {}).some(v => v! > 0),
                );

                return (
                  <div key={post.id}>
                    {/* Post row */}
                    <button
                      type="button"
                      onClick={() => setExpandedPost(isExpanded ? null : post.id)}
                      className="w-full px-5 py-3.5 text-left transition-colors hover:bg-muted/30"
                    >
                      <div className="flex items-start gap-3">
                        {/* Content type icon */}
                        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted">
                          {post.contentType === 'reel'
                            ? <Video className="size-3.5 text-muted-foreground" />
                            : <BarChart3 className="size-3.5 text-muted-foreground" />}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-1 text-sm">{post.caption}</p>

                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                            {/* Platforms */}
                            <div className="flex flex-wrap gap-1">
                              {post.platforms.map(p => (
                                <PlatformBadge key={p} platform={p} />
                              ))}
                            </div>

                            {/* Date */}
                            {post.publishedAt && (
                              <span className="text-meta text-muted-foreground">
                                {new Date(post.publishedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Quick stats — shown on wider screens */}
                        <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
                          {post.hasEngagementData ? (
                            <>
                              <span className="text-sm font-semibold">
                                {fmt(post.totals.engagement)}
                                <span className="ml-1 text-xs font-normal text-muted-foreground">interactions</span>
                              </span>
                              {post.totals.impressions > 0 && (
                                <span className="text-meta text-muted-foreground">
                                  {fmt(post.totals.impressions)}
                                  {' '}
                                  impressions
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-meta text-muted-foreground">Pending sync</span>
                          )}
                        </div>
                      </div>

                      {/* Mobile quick stats */}
                      {post.hasEngagementData && (
                        <div className="mt-2 flex items-center gap-3 sm:hidden">
                          <StatPill label="likes" value={fmt(post.totals.likes)} />
                          <StatPill label="comments" value={fmt(post.totals.comments)} />
                          {post.totals.impressions > 0 && (
                            <StatPill label="impressions" value={fmt(post.totals.impressions)} />
                          )}
                        </div>
                      )}
                    </button>

                    {/* Expanded platform breakdown */}
                    {isExpanded && (
                      <div className="border-t bg-muted/20 px-5 py-4">
                        <div className="mb-3 flex items-center justify-between">
                          <p className="text-xs font-medium text-muted-foreground">Platform breakdown</p>
                          <Link
                            href={`/dashboard/content/${post.id}`}
                            className="text-xs text-primary underline"
                            onClick={e => e.stopPropagation()}
                          >
                            View post
                          </Link>
                        </div>

                        {post.platforms.length === 0 ? (
                          <p className="text-meta text-muted-foreground">No platform data.</p>
                        ) : (
                          <div className="space-y-2.5">
                            {post.platforms.map(platform => (
                              <PlatformMetricsRow
                                key={platform}
                                platform={platform}
                                metrics={post.platformMetrics[platform] || {}}
                              />
                            ))}
                          </div>
                        )}

                        {platformsWithData.length === 0 && post.platforms.length > 0 && (
                          <p className="mt-2 text-meta text-muted-foreground">
                            No engagement data yet. Metrics sync automatically every 6 hours.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Sidebar ──────────────────────────────── */}
        <div className="space-y-4">

          {/* Platform breakdown */}
          <div className="rounded-xl border bg-card p-5">
            <h3 className="mb-4 border-b pb-3 text-sm font-semibold">By platform</h3>
            {Object.keys(platformTotals).length === 0 ? (
              <p className="text-meta text-muted-foreground">No platform data yet.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(platformTotals)
                  .sort((a, b) => b[1].posts - a[1].posts)
                  .map(([platform, totals]) => {
                    const barWidth = Math.round((totals.posts / maxPlatformPosts) * 100);
                    const color = PLATFORM_COLORS[platform] || 'bg-zinc-400';
                    return (
                      <div key={platform}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs font-medium">{PLATFORM_LABELS[platform] || platform}</span>
                          <span className="text-meta text-muted-foreground">
                            {totals.posts}
                            {' '}
                            {totals.posts === 1 ? 'post' : 'posts'}
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${color}`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        {/* Platform engagement totals if available */}
                        {(totals.likes > 0 || totals.impressions > 0) && (
                          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                            {totals.likes > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                {fmt(totals.likes)}
                                {' '}
                                likes
                              </span>
                            )}
                            {totals.impressions > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                {fmt(totals.impressions)}
                                {' '}
                                impressions
                              </span>
                            )}
                            {totals.views > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                {fmt(totals.views)}
                                {' '}
                                views
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Engagement breakdown */}
          <div className="rounded-xl border bg-card p-5">
            <h3 className="mb-4 border-b pb-3 text-sm font-semibold">Engagement breakdown</h3>
            <div className="space-y-3">
              {[
                { icon: ThumbsUp, label: 'Likes', value: summary.totalLikes },
                { icon: MessageCircle, label: 'Comments', value: summary.totalComments },
                { icon: Share2, label: 'Shares', value: summary.totalShares },
                { icon: Eye, label: 'Impressions', value: summary.totalImpressions },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="size-3.5 text-muted-foreground" />
                    <span className="text-body text-muted-foreground">{label}</span>
                  </div>
                  <span className="text-sm font-semibold">{fmt(value)}</span>
                </div>
              ))}
              {summary.totalViews > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Video className="size-3.5 text-muted-foreground" />
                    <span className="text-body text-muted-foreground">Video views</span>
                  </div>
                  <span className="text-sm font-semibold">{fmt(summary.totalViews)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Sync info */}
          <div className="rounded-xl border bg-card p-5">
            <h3 className="mb-3 border-b pb-3 text-sm font-semibold">Data sync</h3>
            <div className="space-y-2">
              <p className="text-meta text-muted-foreground">
                Engagement metrics are fetched automatically from your connected platforms every 6 hours.
              </p>
              {lastSyncedAt && (
                <p className="text-meta text-muted-foreground">
                  Last synced:
                  {' '}
                  <span className="font-medium text-foreground">{relativeTime(lastSyncedAt)}</span>
                </p>
              )}
              <p className="text-meta text-muted-foreground">
                Supported:
                {' '}
                <span className="font-medium text-foreground">Instagram, Facebook, X, YouTube, TikTok, LinkedIn, Threads, Pinterest</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
