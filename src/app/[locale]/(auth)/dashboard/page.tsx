'use client';

import {
  AlertCircle,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Layers,
  Loader2,
  PenLine,
  Send,
  TrendingUp,
  Video,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

// -----------------------------------------------------------
// TYPES
// -----------------------------------------------------------
type PendingItem = {
  id: string;
  caption: string;
  targetPlatforms: string[];
  contentType: string;
  createdAt: string;
  antiSlopScore: number | null;
};

type UpcomingPost = {
  id: string;
  caption: string;
  targetPlatforms: string[];
  contentType: string;
  scheduledFor: string;
};

type RecentFailure = {
  contentItemId: string;
  platform: string;
  errorMessage: string | null;
  createdAt: string;
};

type DashboardData = {
  stats: {
    pendingApprovals: number;
    scheduledPosts: number;
    publishedThisMonth: number;
    totalPublished: number;
    drafts: number;
  };
  pendingItems: PendingItem[];
  upcoming: UpcomingPost[];
  recentFailures: RecentFailure[];
};

// -----------------------------------------------------------
// CONFIG
// -----------------------------------------------------------
const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  linkedin_page: 'LinkedIn Page',
  twitter: 'X',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  threads: 'Threads',
  pinterest: 'Pinterest',
};

const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'bg-pink-500',
  linkedin: 'bg-blue-600',
  linkedin_page: 'bg-blue-700',
  twitter: 'bg-zinc-800',
  facebook: 'bg-blue-500',
  tiktok: 'bg-zinc-900',
  youtube: 'bg-red-600',
  threads: 'bg-zinc-700',
  pinterest: 'bg-red-500',
};

// -----------------------------------------------------------
// HELPERS
// -----------------------------------------------------------
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
console.log({ formatDate });

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
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

function timeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) {
    return 'Past due';
  }
  const hrs = Math.floor(diff / 3_600_000);
  if (hrs < 24) {
    return `in ${hrs}h`;
  }
  return `in ${Math.floor(hrs / 24)}d`;
}

function contentTypeIcon(type: string) {
  if (type === 'reel') {
    return <Video className="size-3.5" />;
  }
  if (type === 'carousel') {
    return <Layers className="size-3.5" />;
  }
  return <FileText className="size-3.5" />;
}

// -----------------------------------------------------------
// SUB-COMPONENTS
// -----------------------------------------------------------
function PlatformBadge({ platform }: { platform: string }) {
  const color = PLATFORM_COLORS[platform] || 'bg-zinc-500';
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white ${color}`}>
      {PLATFORM_LABELS[platform] || platform}
    </span>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  href,
  accent,
}: {
  label: string;
  value: number;
  icon: typeof Clock;
  href: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group relative overflow-hidden rounded-xl border bg-card p-5 transition-colors hover:bg-muted/30 ${accent ? 'border-amber-200 bg-amber-50/30' : ''}`}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className={`flex size-8 items-center justify-center rounded-lg ${accent ? 'bg-amber-100' : 'bg-muted'}`}>
          <Icon className={`size-4 ${accent ? 'text-amber-600' : 'text-muted-foreground'}`} />
        </div>
        <ChevronRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <p className={`text-2xl font-bold tracking-tight ${accent && value > 0 ? 'text-amber-700' : ''}`}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </Link>
  );
}

function SectionHeader({
  title,
  count,
  href,
  linkLabel,
}: {
  title: string;
  count?: number;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b px-5 py-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {count !== undefined && count > 0 && (
          <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </div>
      {href && linkLabel && (
        <Link
          href={href}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {linkLabel}
          <ChevronRight className="ml-0.5 inline-block size-3" />
        </Link>
      )}
    </div>
  );
}

// -----------------------------------------------------------
// PAGE
// -----------------------------------------------------------
export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/dashboard');
        if (res.ok) {
          setData(await res.json());
        }
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

  const stats = data?.stats || {
    pendingApprovals: 0,
    scheduledPosts: 0,
    publishedThisMonth: 0,
    totalPublished: 0,
    drafts: 0,
  };

  const hasPending = (data?.pendingItems.length || 0) > 0;
  const hasFailures = (data?.recentFailures.length || 0) > 0;
  const hasUpcoming = (data?.upcoming.length || 0) > 0;

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Failure alert — shown only when there are recent failures */}
      {hasFailures && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-red-700">
              {data!.recentFailures.length}
              {' '}
              {data!.recentFailures.length === 1 ? 'post' : 'posts'}
              {' '}
              failed to publish in the last 7 days
            </p>
            <div className="mt-1 space-y-0.5">
              {data!.recentFailures.map((f, i) => (
                <p key={i} className="text-xs text-red-600">
                  <Link
                    href={`/dashboard/content/${f.contentItemId}`}
                    className="underline hover:text-red-700"
                  >
                    {PLATFORM_LABELS[f.platform] || f.platform}
                  </Link>
                  {f.errorMessage ? ` — ${f.errorMessage.slice(0, 80)}` : ''}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          icon={Clock}
          label="Pending approval"
          value={stats.pendingApprovals}
          href="/dashboard/approvals"
          accent={stats.pendingApprovals > 0}
        />
        <StatCard
          icon={Calendar}
          label="Scheduled"
          value={stats.scheduledPosts}
          href="/dashboard/posts?status=scheduled"
        />
        <StatCard
          icon={Send}
          label="Published this month"
          value={stats.publishedThisMonth}
          href="/dashboard/posts?status=published"
        />
        <StatCard
          icon={TrendingUp}
          label="Total published"
          value={stats.totalPublished}
          href="/dashboard/posts?status=published"
        />
      </div>

      {/* Main content grid */}
      <div className="grid gap-6 lg:grid-cols-3">

        {/* ── Left column: Pending approvals ── */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border bg-card">
            <SectionHeader
              title="Waiting for approval"
              count={stats.pendingApprovals}
              href="/dashboard/approvals"
              linkLabel={stats.pendingApprovals > 6 ? `View all ${stats.pendingApprovals}` : undefined}
            />

            {!hasPending ? (
              <div className="flex flex-col items-center justify-center px-5 py-14 text-center">
                <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-emerald-50">
                  <CheckCircle2 className="size-5 text-emerald-600" />
                </div>
                <p className="text-sm font-medium">All caught up</p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                  No content waiting for your review. We'll notify you when new posts are ready.
                </p>
                <Link
                  href="/dashboard/content/create"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted"
                >
                  <PenLine className="size-3.5" />
                  Create new post
                </Link>
              </div>
            ) : (
              <div className="divide-y">
                {data!.pendingItems.map(item => (
                  <Link
                    key={item.id}
                    href={`/dashboard/content/${item.id}`}
                    className="group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-muted/30"
                  >
                    {/* Content type indicator */}
                    <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted/50 text-muted-foreground">
                      {contentTypeIcon(item.contentType)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm leading-relaxed">{item.caption}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {(item.targetPlatforms || []).map(p => (
                          <PlatformBadge key={p} platform={p} />
                        ))}
                        <span className="text-xs text-muted-foreground">
                          {relativeTime(item.createdAt)}
                        </span>
                        {item.antiSlopScore !== null && item.antiSlopScore >= 0.8 && (
                          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                            {Math.round(item.antiSlopScore * 100)}
                            {' '}
                            quality
                          </span>
                        )}
                      </div>
                    </div>

                    <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                ))}
              </div>
            )}

            {/* CTA footer when there are items */}
            {hasPending && (
              <div className="border-t px-5 py-3.5">
                <Link
                  href="/dashboard/approvals"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <CheckCircle2 className="size-3.5" />
                  Review all
                  {stats.pendingApprovals > 0 && (
                    <span className="rounded-full bg-primary-foreground/20 px-1.5 py-0.5 text-[10px]">
                      {stats.pendingApprovals}
                    </span>
                  )}
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* ── Right column: Upcoming + Quick links ── */}
        <div className="space-y-4">

          {/* Upcoming scheduled posts */}
          <div className="rounded-xl border bg-card">
            <SectionHeader
              title="Upcoming"
              href="/dashboard/posts?status=scheduled"
              linkLabel={stats.scheduledPosts > 5 ? 'View all' : undefined}
            />

            {!hasUpcoming ? (
              <div className="px-5 py-8 text-center">
                <Calendar className="mx-auto mb-2 size-6 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">Nothing scheduled.</p>
                <Link
                  href="/dashboard/calendar"
                  className="mt-2 block text-xs text-primary underline"
                >
                  Open calendar
                </Link>
              </div>
            ) : (
              <div className="divide-y">
                {data!.upcoming.map(post => (
                  <Link
                    key={post.id}
                    href={`/dashboard/content/${post.id}`}
                    className="group flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-muted/30"
                  >
                    <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border bg-violet-50 text-violet-600">
                      {contentTypeIcon(post.contentType)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-xs">{post.caption}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {(post.targetPlatforms || []).map(p => (
                          <PlatformBadge key={p} platform={p} />
                        ))}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] font-medium text-violet-600">
                        {timeUntil(post.scheduledFor)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatDateTime(post.scheduledFor)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="rounded-xl border bg-card">
            <div className="border-b px-5 py-4">
              <h2 className="text-sm font-semibold">Quick actions</h2>
            </div>
            <div className="space-y-1 p-3">
              {[
                {
                  href: '/dashboard/content/create',
                  icon: PenLine,
                  label: 'Create new post',
                  sub: 'Generate with AI',
                },
                {
                  href: '/dashboard/calendar',
                  icon: Calendar,
                  label: 'Content calendar',
                  sub: 'View schedule',
                },
                {
                  href: '/dashboard/analytics',
                  icon: BarChart3,
                  label: 'Analytics',
                  sub: 'Performance data',
                },
                {
                  href: '/dashboard/connections',
                  icon: TrendingUp,
                  label: 'Connections',
                  sub: 'Manage social accounts',
                },
                {
                  href: '/dashboard/brand-profile',
                  icon: FileText,
                  label: 'Brand profile',
                  sub: 'Voice and identity',
                },
              ].map(({ href, icon: Icon, label, sub }) => (
                <Link
                  key={href}
                  href={href}
                  className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/40"
                >
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Icon className="size-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight">{label}</p>
                    <p className="text-[11px] text-muted-foreground">{sub}</p>
                  </div>
                  <ChevronRight className="ml-auto size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
