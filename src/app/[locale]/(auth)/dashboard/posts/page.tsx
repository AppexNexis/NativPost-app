'use client';

import {
  Grid3X3,
  LayoutList,
  List,
  Loader2,
  Rows3,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';

import { BulkActionBar } from '@/components/content/BulkActionBar';
import { PostCard } from '@/components/content/PostCard';
import { PostListRow } from '@/components/content/PostListRow';
import { PostsFilters } from '@/components/content/PostsFilters';
import { PostTableView } from '@/components/content/PostTableView';
import { EmptyState } from '@/features/dashboard/EmptyState';
import type { ContentItem } from '@/types/v2';
import { cn } from '@/utils/Helpers';

// -----------------------------------------------------------
// STATUS TAB CONFIG
// -----------------------------------------------------------
type ViewMode = 'grid' | 'list' | 'compact';

type Counts = {
  draft: number;
  pending_review: number;
  approved: number;
  scheduled: number;
  published: number;
  rejected: number;
  total: number;
};

const EMPTY_COUNTS: Counts = {
  draft: 0,
  pending_review: 0,
  approved: 0,
  scheduled: 0,
  published: 0,
  rejected: 0,
  total: 0,
};

const STATUS_TABS: { key: keyof Counts | null; label: string; dot: string }[] = [
  { key: null, label: 'All', dot: 'bg-foreground' },
  { key: 'draft', label: 'Draft', dot: 'bg-zinc-400' },
  { key: 'pending_review', label: 'Pending review', dot: 'bg-amber-400' },
  { key: 'approved', label: 'Approved', dot: 'bg-emerald-500' },
  { key: 'scheduled', label: 'Scheduled', dot: 'bg-blue-500' },
  { key: 'published', label: 'Published', dot: 'bg-emerald-600' },
  { key: 'rejected', label: 'Rejected', dot: 'bg-red-400' },
];

// -----------------------------------------------------------
// LAYOUT TOGGLE
// -----------------------------------------------------------
function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const options: { value: ViewMode; icon: typeof List; label: string }[] = [
    { value: 'grid', icon: Grid3X3, label: 'Grid' },
    { value: 'list', icon: Rows3, label: 'List' },
    { value: 'compact', icon: List, label: 'Table' },
  ];
  return (
    <div className="flex rounded-md border p-0.5" role="group" aria-label="View mode">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          title={label}
          onClick={() => onChange(value)}
          className={cn(
            'rounded p-1.5 transition-colors',
            view === value
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}

// -----------------------------------------------------------
// URL HELPERS
// -----------------------------------------------------------
function updateUrl(patch: Record<string, string | null>) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === '') url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  window.history.replaceState({}, '', url.toString());
}

// -----------------------------------------------------------
// MAIN CLIENT
// -----------------------------------------------------------
function PostsClient() {
  const searchParams = useSearchParams();

  // ── URL-synced filter state ─────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<string | null>(searchParams.get('status'));
  const [view, setView] = useState<ViewMode>(() => {
    const v = searchParams.get('view');
    return (v === 'list' || v === 'compact' || v === 'grid') ? v : 'grid';
  });
  const [search, setSearch] = useState<string>(searchParams.get('search') || '');
  const [contentTypes, setContentTypes] = useState<string[]>(() => {
    const v = searchParams.get('contentType');
    return v ? v.split(',').filter(Boolean) : [];
  });
  const [platforms, setPlatforms] = useState<string[]>(() => {
    const v = searchParams.get('platform');
    return v ? v.split(',').filter(Boolean) : [];
  });
  const [sort, setSort] = useState<string>(searchParams.get('sort') || 'newest');

  // ── Data state ──────────────────────────────────────────────────────────
  const [items, setItems] = useState<ContentItem[]>([]);
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isBulkBusy, setIsBulkBusy] = useState(false);

  // ── Selection state ─────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ── Sync filters to URL ─────────────────────────────────────────────────
  useEffect(() => {
    updateUrl({
      status: statusFilter,
      view: view === 'grid' ? null : view,
      search: search || null,
      contentType: contentTypes.length ? contentTypes.join(',') : null,
      platform: platforms.length ? platforms.join(',') : null,
      sort: sort === 'newest' ? null : sort,
    });
  }, [statusFilter, view, search, contentTypes, platforms, sort]);

  // ── Fetcher ─────────────────────────────────────────────────────────────
  const buildParams = useCallback((cursor?: string | null) => {
    const p = new URLSearchParams({ limit: '50' });
    if (statusFilter) p.set('status', statusFilter);
    if (search.trim()) p.set('search', search.trim());
    if (contentTypes.length) p.set('contentType', contentTypes.join(','));
    if (platforms.length) p.set('platform', platforms.join(','));
    if (sort && sort !== 'newest') p.set('sort', sort);
    if (cursor) p.set('cursor', cursor);
    return p;
  }, [statusFilter, search, contentTypes, platforms, sort]);

  const fetchItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/content?${buildParams()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
        setCounts(data.counts || EMPTY_COUNTS);
        setNextCursor(data.nextCursor || null);
      }
    } catch (err) {
      console.error('[Posts] fetch failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [buildParams]);

  const fetchMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const res = await fetch(`/api/content?${buildParams(nextCursor)}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setItems(prev => [...prev, ...(data.items || [])]);
        setNextCursor(data.nextCursor || null);
      }
    } catch (err) {
      console.error('[Posts] fetch more failed:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextCursor, isLoadingMore, buildParams]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // ── Selection helpers ───────────────────────────────────────────────────
  const toggleSelected = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((ids: string[], select: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (select) ids.forEach(id => next.add(id));
      else ids.forEach(id => next.delete(id));
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const selectAllVisible = useCallback(() => {
    setSelected(new Set(items.map(i => i.id)));
  }, [items]);

  // ── Mutation helpers ────────────────────────────────────────────────────
  const callBulk = useCallback(async (
    action: string,
    ids: string[],
    payload?: Record<string, unknown>,
  ) => {
    setIsBulkBusy(true);
    try {
      const res = await fetch('/api/content/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids, payload }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('[Posts] bulk action failed:', err);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[Posts] bulk request failed:', err);
      return false;
    } finally {
      setIsBulkBusy(false);
    }
  }, []);

  const applyOptimisticUpdate = useCallback((ids: string[], patch: Partial<ContentItem>) => {
    setItems(prev => prev.map(item => (ids.includes(item.id) ? { ...item, ...patch } : item)));
  }, []);
  const applyOptimisticRemove = useCallback((ids: string[]) => {
    setItems(prev => prev.filter(item => !ids.includes(item.id)));
  }, []);

  // Single-card handlers
  const handleApproveOne = useCallback(async (id: string) => {
    applyOptimisticUpdate([id], { status: 'approved' });
    const ok = await callBulk('approve', [id]);
    if (!ok) fetchItems();
    else fetchItems();
  }, [callBulk, fetchItems, applyOptimisticUpdate]);

  const handleDeleteOne = useCallback(async (id: string) => {
    if (!window.confirm('Delete this post? This action cannot be undone.')) return;
    applyOptimisticRemove([id]);
    const ok = await callBulk('delete', [id]);
    if (!ok) fetchItems();
    else fetchItems();
  }, [callBulk, fetchItems, applyOptimisticRemove]);

  // Bulk handlers
  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  const handleBulkApprove = useCallback(async () => {
    if (selectedIds.length === 0) return;
    applyOptimisticUpdate(selectedIds, { status: 'approved' });
    const ok = await callBulk('approve', selectedIds);
    clearSelection();
    if (!ok) fetchItems();
    else fetchItems();
  }, [selectedIds, callBulk, fetchItems, clearSelection, applyOptimisticUpdate]);

  const handleBulkReject = useCallback(async (feedback: string) => {
    if (selectedIds.length === 0) return;
    applyOptimisticUpdate(selectedIds, { status: 'rejected' });
    const ok = await callBulk('reject', selectedIds, { rejectionFeedback: feedback });
    clearSelection();
    if (!ok) fetchItems();
    else fetchItems();
  }, [selectedIds, callBulk, fetchItems, clearSelection, applyOptimisticUpdate]);

  const handleBulkSchedule = useCallback(async (scheduledFor: string) => {
    if (selectedIds.length === 0) return;
    applyOptimisticUpdate(selectedIds, { status: 'scheduled', scheduledFor });
    const ok = await callBulk('schedule', selectedIds, { scheduledFor });
    clearSelection();
    if (!ok) fetchItems();
    else fetchItems();
  }, [selectedIds, callBulk, fetchItems, clearSelection, applyOptimisticUpdate]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.length === 0) return;
    applyOptimisticRemove(selectedIds);
    const ok = await callBulk('delete', selectedIds);
    clearSelection();
    if (!ok) fetchItems();
    else fetchItems();
  }, [selectedIds, callBulk, fetchItems, clearSelection, applyOptimisticRemove]);

  // ── Derived render bits ─────────────────────────────────────────────────
  const anySelected = selected.size > 0;
  const activeTab = STATUS_TABS.find(t => t.key === statusFilter) ?? STATUS_TABS[0]!;
  const pageTitle = activeTab.label === 'All' ? 'All posts' : activeTab.label;

  return (
    <>
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{pageTitle}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {counts.total}
            {' '}
            {counts.total === 1 ? 'post' : 'posts'}
            {anySelected && ` — ${selected.size} selected`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {anySelected && (
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Deselect all
            </button>
          )}
          {!anySelected && items.length > 0 && (
            <button
              type="button"
              onClick={selectAllVisible}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Select all
              {' '}
              {items.length}
            </button>
          )}
          <div className="hidden sm:block">
            <ViewToggle view={view} onChange={setView} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex min-w-max items-center gap-1.5 border-b pb-3 sm:min-w-0 sm:flex-wrap">
          {STATUS_TABS.map((tab) => {
            const isActive = statusFilter === tab.key;
            const count = tab.key === null ? counts.total : counts[tab.key];
            return (
              <button
                key={tab.key ?? 'all'}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className={cn(
                  'flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  isActive ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                <span className={cn('size-1.5 rounded-full', tab.dot, isActive && 'opacity-60')} />
                {tab.label}
                <span className={cn('ml-0.5', isActive && 'opacity-60')}>
                  (
                  {count}
                  )
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <PostsFilters
        search={search}
        onSearchChange={setSearch}
        contentTypes={contentTypes}
        onContentTypesChange={setContentTypes}
        platforms={platforms}
        onPlatformsChange={setPlatforms}
        sort={sort}
        onSortChange={setSort}
      />

      {/* Content */}
      {isLoading
        ? (
            <div className="flex min-h-[400px] items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )
        : items.length === 0
          ? (
              <EmptyState
                icon={LayoutList}
                title={statusFilter ? 'No matching posts' : 'No posts yet'}
                description="Content created by your NativPost team will appear here."
                actionLabel="Open Blitz"
                actionHref="/dashboard/blitz"
              />
            )
          : (
              <>
                {view === 'grid' && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {items.map(item => (
                      <PostCard
                        key={item.id}
                        item={item}
                        selected={selected.has(item.id)}
                        onToggleSelected={toggleSelected}
                        onApprove={handleApproveOne}
                        onDelete={handleDeleteOne}
                        anySelected={anySelected}
                      />
                    ))}
                  </div>
                )}

                {view === 'list' && (
                  <div className="space-y-2">
                    {items.map(item => (
                      <PostListRow
                        key={item.id}
                        item={item}
                        selected={selected.has(item.id)}
                        onToggleSelected={toggleSelected}
                        onApprove={handleApproveOne}
                        onDelete={handleDeleteOne}
                      />
                    ))}
                  </div>
                )}

                {view === 'compact' && (
                  <PostTableView
                    items={items}
                    selected={selected}
                    onToggleSelected={toggleSelected}
                    onToggleAll={toggleAll}
                    onApprove={handleApproveOne}
                    onDelete={handleDeleteOne}
                  />
                )}

                {/* Load more */}
                {nextCursor && (
                  <div className="mt-6 flex justify-center pb-24">
                    <button
                      type="button"
                      onClick={fetchMore}
                      disabled={isLoadingMore}
                      className="inline-flex items-center gap-2 rounded-md border bg-card px-4 py-2 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      {isLoadingMore && <Loader2 className="size-3.5 animate-spin" />}
                      {isLoadingMore ? 'Loading...' : 'Load more'}
                    </button>
                  </div>
                )}
              </>
            )}

      {/* Bulk action bar */}
      <BulkActionBar
        selectedCount={selected.size}
        onApprove={handleBulkApprove}
        onReject={handleBulkReject}
        onSchedule={handleBulkSchedule}
        onDelete={handleBulkDelete}
        onClear={clearSelection}
        isBusy={isBulkBusy}
      />
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
      <PostsClient />
    </Suspense>
  );
}
