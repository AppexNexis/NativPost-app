'use client';

import {
  FileText,
  Grid3X3,
  ImageIcon,
  Layers,
  LayoutList,
  List,
  Loader2,
  Video,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

import { PlatformIcons } from '@/components/icons/PlatformIcons';
import { EmptyState } from '@/features/dashboard/EmptyState';

// -----------------------------------------------------------
// TYPES
// -----------------------------------------------------------
type ContentItem = {
  id: string;
  caption: string;
  contentType: string;
  status: string;
  targetPlatforms: string[];
  scheduledFor: string | null;
  publishedAt: string | null;
  createdAt: string;
  antiSlopScore: number | null;
};

type LayoutMode = 'list' | 'grid' | 'compact';

// -----------------------------------------------------------
// CONFIG
// -----------------------------------------------------------
const STATUS_CONFIG: Record<string, { label: string; dot: string; bg: string }> = {
  draft: { label: 'Draft', dot: 'bg-zinc-400', bg: 'bg-zinc-100 text-zinc-600' },
  pending_review: { label: 'Pending review', dot: 'bg-amber-400', bg: 'bg-amber-50 text-amber-700' },
  approved: { label: 'Approved', dot: 'bg-blue-400', bg: 'bg-blue-50 text-blue-700' },
  scheduled: { label: 'Scheduled', dot: 'bg-violet-400', bg: 'bg-violet-50 text-violet-700' },
  published: { label: 'Published', dot: 'bg-emerald-500', bg: 'bg-emerald-50 text-emerald-700' },
  rejected: { label: 'Rejected', dot: 'bg-red-400', bg: 'bg-red-50 text-red-700' },
};

const CONTENT_TYPE_ICON: Record<string, React.ElementType> = {
  text: FileText,
  single_image: ImageIcon,
  carousel: Layers,
  reel: Video,
};

// -----------------------------------------------------------
// HELPERS
// -----------------------------------------------------------
function formatDate(item: ContentItem): string {
  const ref = item.scheduledFor || item.publishedAt || item.createdAt;
  return new Date(ref).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function QualityDot({ score }: { score: number | null }) {
  if (score === null) {
    return null;
  }
  const pct = Math.round(score * 100);
  const color = score >= 0.8 ? 'bg-emerald-500' : score >= 0.7 ? 'bg-yellow-400' : 'bg-orange-400';
  return (
    <span title={`Quality: ${pct}`} className={`inline-flex size-1.5 shrink-0 rounded-full ${color}`} />
  );
}

// -----------------------------------------------------------
// LIST ROW
// -----------------------------------------------------------
function ListRow({ item }: { item: ContentItem }) {
  const config = STATUS_CONFIG[item.status] || STATUS_CONFIG.draft!;
  const Icon = CONTENT_TYPE_ICON[item.contentType] || FileText;

  return (
    <Link
      href={`/dashboard/content/${item.id}`}
      className="group flex items-start gap-3 rounded-lg border bg-card px-4 py-3.5 transition-colors hover:bg-muted/30 sm:items-center"
    >
      {/* Content type icon */}
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground sm:mt-0">
        <Icon className="size-3.5" />
      </div>

      {/* Status badge */}
      <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline-flex sm:items-center sm:gap-1 ${config.bg}`}>
        <span className={`size-1.5 rounded-full ${config.dot}`} />
        {config.label}
      </span>
      {/* Mobile: dot only */}
      <span className={`mt-1.5 size-2 shrink-0 rounded-full sm:hidden ${config.dot}`} />

      {/* Caption */}
      <p className="line-clamp-2 min-w-0 flex-1 text-sm leading-relaxed sm:line-clamp-1">
        {item.caption}
      </p>

      {/* Right side meta */}
      <div className="flex shrink-0 items-center gap-3">
        <QualityDot score={item.antiSlopScore} />
        <PlatformIcons platforms={item.targetPlatforms || []} className="size-3.5" />
        <span className="hidden text-xs text-muted-foreground sm:block">
          {formatDate(item)}
        </span>
      </div>
    </Link>
  );
}

// -----------------------------------------------------------
// GRID CARD
// -----------------------------------------------------------
function GridCard({ item }: { item: ContentItem }) {
  const config = STATUS_CONFIG[item.status] || STATUS_CONFIG.draft!;
  const Icon = CONTENT_TYPE_ICON[item.contentType] || FileText;

  return (
    <Link
      href={`/dashboard/content/${item.id}`}
      className="group flex flex-col rounded-xl border bg-card p-4 transition-colors hover:bg-muted/30"
    >
      {/* Top row: type icon + status + quality */}
      <div className="mb-3 flex items-center gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
          <Icon className="size-3.5" />
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${config.bg}`}>
          <span className={`size-1.5 rounded-full ${config.dot}`} />
          {config.label}
        </span>
        <div className="ml-auto">
          <QualityDot score={item.antiSlopScore} />
        </div>
      </div>

      {/* Caption */}
      <p className="mb-4 line-clamp-3 min-h-[3.75rem] flex-1 text-sm leading-relaxed text-foreground/80 group-hover:text-foreground">
        {item.caption}
      </p>

      {/* Bottom: platforms + date */}
      <div className="flex items-center justify-between border-t pt-3">
        <PlatformIcons platforms={item.targetPlatforms || []} className="size-3.5" />
        <span className="text-xs text-muted-foreground">{formatDate(item)}</span>
      </div>
    </Link>
  );
}

// -----------------------------------------------------------
// COMPACT ROW
// -----------------------------------------------------------
function CompactRow({ item }: { item: ContentItem }) {
  const config = STATUS_CONFIG[item.status] || STATUS_CONFIG.draft!;

  return (
    <Link
      href={`/dashboard/content/${item.id}`}
      className="flex items-center gap-3 border-b px-3 py-2 transition-colors last:border-b-0 hover:bg-muted/30"
    >
      <span className={`size-1.5 shrink-0 rounded-full ${config.dot}`} />
      <p className="min-w-0 flex-1 truncate text-xs">{item.caption}</p>
      <PlatformIcons platforms={item.targetPlatforms || []} className="size-3" />
      <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:block">
        {formatDate(item)}
      </span>
    </Link>
  );
}

// -----------------------------------------------------------
// LAYOUT TOGGLE
// -----------------------------------------------------------
function LayoutToggle({
  layout,
  onChange,
}: {
  layout: LayoutMode;
  onChange: (l: LayoutMode) => void;
}) {
  const options: { value: LayoutMode; icon: typeof List; label: string }[] = [
    { value: 'list', icon: LayoutList, label: 'List' },
    { value: 'grid', icon: Grid3X3, label: 'Grid' },
    { value: 'compact', icon: List, label: 'Compact' },
  ];

  return (
    <div className="flex rounded-md border p-0.5" role="group" aria-label="Layout">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          title={label}
          onClick={() => onChange(value)}
          className={`rounded p-1.5 transition-colors ${
            layout === value
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}

// -----------------------------------------------------------
// MAIN CONTENT
// -----------------------------------------------------------
function PostsContent() {
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get('status');
  const layoutParam = (searchParams.get('layout') as LayoutMode) || 'list';

  const [items, setItems] = useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [layout, setLayout] = useState<LayoutMode>(
    ['list', 'grid', 'compact'].includes(layoutParam) ? layoutParam : 'list',
  );

  const fetchContent = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (statusFilter) {
        params.set('status', statusFilter);
      }
      const res = await fetch(`/api/content?${params}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error('Failed to fetch:', err);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  // Update URL when layout changes (without full navigation)
  const handleLayoutChange = (newLayout: LayoutMode) => {
    setLayout(newLayout);
    const url = new URL(window.location.href);
    if (newLayout === 'list') {
      url.searchParams.delete('layout');
    } else {
      url.searchParams.set('layout', newLayout);
    }
    window.history.replaceState({}, '', url.toString());
  };

  // Count per status from current result set
  const counts = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const pageTitle = statusFilter ? STATUS_CONFIG[statusFilter]?.label || 'Posts' : 'All posts';

  return (
    <>
      {/* Header */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{pageTitle}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {items.length}
            {' '}
            {items.length === 1 ? 'post' : 'posts'}
          </p>
        </div>

        {/* Layout toggle — hidden on mobile, visible sm+ */}
        <div className="hidden sm:block">
          <LayoutToggle layout={layout} onChange={handleLayoutChange} />
        </div>
      </div>

      {/* Status filter tabs — horizontally scrollable on mobile */}
      <div className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex min-w-max items-center gap-1.5 border-b pb-3 sm:min-w-0 sm:flex-wrap">
          <Link
            href={`/dashboard/posts${layout !== 'list' ? `?layout=${layout}` : ''}`}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              !statusFilter ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            All
            {items.length > 0 && !statusFilter && (
              <span className="ml-1.5 opacity-60">{items.length}</span>
            )}
          </Link>
          {Object.entries(STATUS_CONFIG).map(([key, config]) => {
            const count = counts[key];
            return (
              <Link
                key={key}
                href={`/dashboard/posts?status=${key}${layout !== 'list' ? `&layout=${layout}` : ''}`}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  statusFilter === key
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <span className={`size-1.5 rounded-full ${config.dot} ${statusFilter === key ? 'opacity-60' : ''}`} />
                {config.label}
                {count !== undefined && (
                  <span className={`ml-0.5 ${statusFilter === key ? 'opacity-60' : ''}`}>
                    (
                    {count}
                    )
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Content */}
      {items.length === 0 ? (
        <EmptyState
          icon={LayoutList}
          title={statusFilter ? `No ${STATUS_CONFIG[statusFilter]?.label?.toLowerCase()} posts` : 'No posts yet'}
          description="Content created by your NativPost team will appear here."
        />
      ) : (
        <>
          {layout === 'list' && (
            <div className="space-y-1.5">
              {items.map(item => <ListRow key={item.id} item={item} />)}
            </div>
          )}

          {layout === 'grid' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map(item => <GridCard key={item.id} item={item} />)}
            </div>
          )}

          {layout === 'compact' && (
            <div className="overflow-hidden rounded-xl border bg-card">
              {/* Compact header */}
              <div className="hidden grid-cols-[1rem_1fr_auto_6rem] items-center gap-3 border-b bg-muted/30 px-3 py-2 sm:grid">
                <span />
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Caption</span>
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Platforms</span>
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Date</span>
              </div>
              {items.map(item => <CompactRow key={item.id} item={item} />)}
            </div>
          )}
        </>
      )}
    </>
  );
}

// -----------------------------------------------------------
// PAGE
// -----------------------------------------------------------
export default function PostsPage() {
  return (
    <Suspense
      fallback={(
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}
    >
      <PostsContent />
    </Suspense>
  );
}
