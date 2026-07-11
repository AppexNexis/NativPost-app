'use client';

/**
 * CampaignCalendar — month view of a campaign's scheduled posts.
 *
 * Data source: GET /api/campaigns/[id]/calendar?month=YYYY-MM which returns
 *   Array<{ date: 'YYYY-MM-DD', contentItems: Array<CampaignContent & { contentItem }> }>
 *
 * Behavior
 *   - Month grid (7 x 5-6). Each day cell shows the day number and up to
 *     three post chips; overflow renders "+N more". Click a day to open
 *     the right sidebar drawer with that day's full post list.
 *   - Drag any post chip onto another day cell to reschedule via
 *     PATCH /api/campaigns/[id]/content/[contentItemId]/schedule with the
 *     new scheduledDate (time is preserved). Optimistic; resync on error.
 *   - Click a post's "Edit" button to jump into the editor for that item
 *     with returnTo pointing back to the calendar. The editor's Blitz-edit
 *     CTA swap already handles the `mode=` / `returnTo=` params (see
 *     EditorLayout — for the calendar path we use plain edit mode).
 *   - Month switcher (prev / next / today) and locale-aware weekday +
 *     month labels. Inline error banner per team convention — never a
 *     blocking modal.
 */

import { AlertTriangle, ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Clock, Loader2, Pencil, RefreshCcw, RefreshCw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Campaign, ContentItem } from '@/types/v2';

import { CampaignPostEditModal } from './CampaignPostEditModal';

// Thumbnail + video URL resolvers — mirror CampaignReviewGrid exactly.
//
// Key insight: for video content types (talking_head, ugc, green_screen,
// video_hook*, reel), Cloudinary video URLs cannot reliably be transformed
// to a still image via `<img>` (Cloudinary AUP moderation + unsigned URL
// restrictions on the paid video add-on frequently return 401). ReviewGrid
// solves this by rendering `<video>` with `autoplay muted loop poster=`
// so the video itself is the preview — with the poster (when present) as
// the fallback still. We do the same here for both PostChip (calendar cell)
// and DayPostRow (day sidebar).
const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v)(\?|$)/i;
const VIDEO_CONTENT_TYPES = new Set([
  'ugc',
  'talking_head',
  'video_hook_demo',
  'video_hook',
  'green_screen',
  'green_screen_meme',
  'reel',
]);

function resolveThumb(item: ContentItem | null): string | null {
  if (!item) return null;

  const enrichment = (item.enrichmentData ?? {}) as Record<string, unknown>;
  const slots = (enrichment.sourceMediaSlots ?? {}) as Record<string, unknown>;
  const snapshot = (enrichment.templateSnapshot ?? {}) as Record<string, unknown>;

  // 1. Slideshow / carousel — first slide image (skip if it's a video).
  const rawSlides = slots.slides;
  if (Array.isArray(rawSlides) && rawSlides.length > 0) {
    const first = rawSlides[0] as Record<string, unknown> | undefined;
    if (first && typeof first.url === 'string' && first.url && !VIDEO_EXT_RE.test(first.url)) {
      return first.url;
    }
  }

  // 2. Template snapshot thumbnailUrl (usually a CDN image).
  if (typeof snapshot.thumbnailUrl === 'string' && snapshot.thumbnailUrl && !VIDEO_EXT_RE.test(snapshot.thumbnailUrl)) {
    return snapshot.thumbnailUrl;
  }

  // 3. Template snapshot thumbnailUrls array/object.
  const tus = snapshot.thumbnailUrls;
  if (Array.isArray(tus) && tus.length > 0 && typeof tus[0] === 'string' && !VIDEO_EXT_RE.test(tus[0])) {
    return tus[0];
  }
  if (tus && typeof tus === 'object' && !Array.isArray(tus)) {
    const first = Object.values(tus as Record<string, unknown>)[0];
    if (typeof first === 'string' && first && !VIDEO_EXT_RE.test(first)) return first;
  }

  // 4. Background: explicit thumbnailUrl → image-only url.
  const bg = (slots.background ?? {}) as Record<string, unknown>;
  if (typeof bg.thumbnailUrl === 'string' && bg.thumbnailUrl && !VIDEO_EXT_RE.test(bg.thumbnailUrl)) {
    return bg.thumbnailUrl;
  }
  if (typeof bg.url === 'string' && bg.url && bg.assetType !== 'video' && !VIDEO_EXT_RE.test(bg.url)) {
    return bg.url;
  }

  // 5. hookVideo / demoVideo thumbnail images.
  const hook = (slots.hookVideo ?? {}) as Record<string, unknown>;
  if (typeof hook.thumbnailUrl === 'string' && hook.thumbnailUrl && !VIDEO_EXT_RE.test(hook.thumbnailUrl)) {
    return hook.thumbnailUrl;
  }
  const demo = (slots.demoVideo ?? {}) as Record<string, unknown>;
  if (typeof demo.thumbnailUrl === 'string' && demo.thumbnailUrl && !VIDEO_EXT_RE.test(demo.thumbnailUrl)) {
    return demo.thumbnailUrl;
  }

  // 6. graphicUrls — skip video URLs.
  const graphic = Array.isArray(item.graphicUrls) ? item.graphicUrls[0] : null;
  if (graphic && typeof graphic === 'string' && !VIDEO_EXT_RE.test(graphic)) return graphic;

  return null;
}

// Returns the raw video URL for video-type content, so PostChip / DayPostRow
// can render an autoplaying <video> element (matching ReviewGrid).
function resolveVideoUrl(item: ContentItem | null): string | null {
  if (!item) return null;
  const enrichment = (item.enrichmentData ?? {}) as Record<string, unknown>;
  const slots = (enrichment.sourceMediaSlots ?? {}) as Record<string, unknown>;
  const bg = (slots.background ?? {}) as Record<string, unknown>;
  if (typeof bg.url === 'string' && bg.url && (bg.assetType === 'video' || VIDEO_EXT_RE.test(bg.url))) {
    return bg.url;
  }
  const hook = (slots.hookVideo ?? {}) as Record<string, unknown>;
  if (typeof hook.url === 'string' && hook.url && VIDEO_EXT_RE.test(hook.url)) return hook.url;
  const demo = (slots.demoVideo ?? {}) as Record<string, unknown>;
  if (typeof demo.url === 'string' && demo.url && VIDEO_EXT_RE.test(demo.url)) return demo.url;
  const snapshot = (enrichment.templateSnapshot ?? {}) as Record<string, unknown>;
  const src = (typeof snapshot.sourceUrl === 'string' ? snapshot.sourceUrl : null)
    ?? (typeof snapshot.mediaUrl === 'string' ? snapshot.mediaUrl : null);
  if (src && VIDEO_EXT_RE.test(src)) return src;
  // Some engine-supplement rows tuck the video into graphicUrls[0].
  const graphic = Array.isArray(item.graphicUrls) ? item.graphicUrls[0] : null;
  if (graphic && typeof graphic === 'string' && VIDEO_EXT_RE.test(graphic)) return graphic;
  return null;
}

function isVideoContentType(item: ContentItem | null): boolean {
  if (!item) return false;
  return VIDEO_CONTENT_TYPES.has(item.contentType ?? '');
}

type CampaignContentRow = {
  id: string;
  campaignId: string;
  contentItemId: string;
  sequenceIndex: number;
  scheduledDate: string | null;
  scheduledTime: string | null;
  isRolled: boolean | null;
  contentItem: ContentItem | null;
};

type CalendarDayGroup = {
  date: string; // YYYY-MM-DD
  contentItems: CampaignContentRow[];
};

type Props = {
  campaign: Campaign;
  locale: string;
};

// ── Date helpers ───────────────────────────────────────────────────────────
// All calendar math runs in UTC to match the API's ISO-date grouping (see
// getCampaignCalendar: it groups by scheduledDate.toISOString().slice(0,10)).
// Using local time here would shift cells across day boundaries near
// midnight for users east/west of UTC.

function monthKey(year: number, monthIdx: number): string {
  const m = String(monthIdx + 1).padStart(2, '0');
  return `${year}-${m}`;
}

function dateKey(year: number, monthIdx: number, day: number): string {
  const m = String(monthIdx + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function todayKey(): string {
  const now = new Date();
  return dateKey(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function parseMonthKey(key: string): { year: number; monthIdx: number } {
  const [y, m] = key.split('-').map(Number);
  return { year: y!, monthIdx: (m ?? 1) - 1 };
}

function monthLabel(key: string, locale: string): string {
  const { year, monthIdx } = parseMonthKey(key);
  return new Date(Date.UTC(year, monthIdx, 1)).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function dayLabel(dateKey: string, locale: string): string {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function weekdayHeaders(locale: string): string[] {
  // Sunday-first grid; 2026-07-05 is a Sunday.
  return [0, 1, 2, 3, 4, 5, 6].map((offset) => {
    const d = new Date(Date.UTC(2026, 6, 5 + offset));
    return d.toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' });
  });
}

function buildMonthCells(monthKey: string): { key: string; inMonth: boolean; day: number }[] {
  const { year, monthIdx } = parseMonthKey(monthKey);
  const firstOfMonth = new Date(Date.UTC(year, monthIdx, 1));
  const startWeekday = firstOfMonth.getUTCDay(); // 0 = Sunday
  const daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();

  const cells: { key: string; inMonth: boolean; day: number }[] = [];

  // Leading days from previous month
  if (startWeekday > 0) {
    const prevMonthLastDay = new Date(Date.UTC(year, monthIdx, 0)).getUTCDate();
    const prevYear = monthIdx === 0 ? year - 1 : year;
    const prevMonthIdx = monthIdx === 0 ? 11 : monthIdx - 1;
    for (let i = startWeekday - 1; i >= 0; i--) {
      const day = prevMonthLastDay - i;
      cells.push({ key: dateKey(prevYear, prevMonthIdx, day), inMonth: false, day });
    }
  }

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ key: dateKey(year, monthIdx, day), inMonth: true, day });
  }

  // Trailing days to complete 6-row (42-cell) grid
  const target = cells.length <= 35 ? 35 : 42;
  let trailDay = 1;
  const nextYear = monthIdx === 11 ? year + 1 : year;
  const nextMonthIdx = monthIdx === 11 ? 0 : monthIdx + 1;
  while (cells.length < target) {
    cells.push({
      key: dateKey(nextYear, nextMonthIdx, trailDay),
      inMonth: false,
      day: trailDay,
    });
    trailDay++;
  }

  return cells;
}

function shiftMonth(key: string, delta: number): string {
  const { year, monthIdx } = parseMonthKey(key);
  const next = new Date(Date.UTC(year, monthIdx + delta, 1));
  return monthKey(next.getUTCFullYear(), next.getUTCMonth());
}

// ── Component ──────────────────────────────────────────────────────────────

export function CampaignCalendar({ campaign, locale }: Props) {
  const initialMonth = useMemo(() => {
    if (campaign.startDate) {
      const d = new Date(campaign.startDate);
      if (!isNaN(d.getTime())) {
        return monthKey(d.getUTCFullYear(), d.getUTCMonth());
      }
    }
    const now = new Date();
    return monthKey(now.getUTCFullYear(), now.getUTCMonth());
  }, [campaign.startDate]);

  const [currentMonth, setCurrentMonth] = useState(initialMonth);
  const [groups, setGroups] = useState<CalendarDayGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [reschedulingIds, setReschedulingIds] = useState<Set<string>>(new Set());
  // Post being edited via the lightweight modal. Lifted here so the sidebar
  // can close without unmounting the modal.
  const [editingItem, setEditingItem] = useState<ContentItem | null>(null);

  const fetchMonth = useCallback(async (month: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/campaigns/${campaign.id}/calendar?month=${month}`,
        { cache: 'no-store' },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { posts: CalendarDayGroup[] };
      setGroups(Array.isArray(data.posts) ? data.posts : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load calendar');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [campaign.id]);

  useEffect(() => {
    fetchMonth(currentMonth);
  }, [currentMonth, fetchMonth]);

  const byDay = useMemo(() => {
    const map = new Map<string, CampaignContentRow[]>();
    for (const g of groups) map.set(g.date, g.contentItems);
    return map;
  }, [groups]);

  const cells = useMemo(() => buildMonthCells(currentMonth), [currentMonth]);
  const weekdays = useMemo(() => weekdayHeaders(locale), [locale]);
  const today = todayKey();

  const goPrev = () => setCurrentMonth((m) => shiftMonth(m, -1));
  const goNext = () => setCurrentMonth((m) => shiftMonth(m, +1));
  const goToday = () => {
    const now = new Date();
    setCurrentMonth(monthKey(now.getUTCFullYear(), now.getUTCMonth()));
  };

  const reschedule = useCallback(async (row: CampaignContentRow, newDate: string) => {
    if (!row.contentItemId) return;
    if (row.scheduledDate?.slice(0, 10) === newDate) return;

    // Optimistic: move row into new date's list.
    const prevGroups = groups;
    setReschedulingIds((s) => new Set(s).add(row.id));
    setGroups((old) => {
      const next = old.map((g) => ({
        date: g.date,
        contentItems: g.contentItems.filter((it) => it.id !== row.id),
      })).filter((g) => g.contentItems.length > 0);
      const existing = next.find((g) => g.date === newDate);
      const patched: CampaignContentRow = {
        ...row,
        scheduledDate: `${newDate}T00:00:00.000Z`,
      };
      if (existing) {
        existing.contentItems = [...existing.contentItems, patched];
      } else {
        next.push({ date: newDate, contentItems: [patched] });
      }
      return next;
    });

    try {
      const res = await fetch(
        `/api/campaigns/${campaign.id}/content/${row.contentItemId}/schedule`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scheduledDate: newDate }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      // Success — new date remains in state. Refetch quietly to align with
      // server truth (scheduledTime, updatedAt, etc.).
      fetchMonth(currentMonth);
    } catch (err: any) {
      setError(err.message || 'Failed to reschedule');
      setGroups(prevGroups);
    } finally {
      setReschedulingIds((s) => {
        const next = new Set(s);
        next.delete(row.id);
        return next;
      });
    }
  }, [campaign.id, currentMonth, fetchMonth, groups]);

  const totalScheduled = useMemo(
    () => groups.reduce((sum, g) => sum + g.contentItems.length, 0),
    [groups],
  );

  const selectedRows = selectedDay ? byDay.get(selectedDay) ?? [] : [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/${locale}/dashboard/campaigns`}
            className="mb-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All campaigns
          </Link>
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {campaign.name}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Calendar view. Drag posts to reschedule, click any day to see details.
          </p>
        </div>

        <div className="flex flex-shrink-0 items-center gap-3">
          <div className="hidden text-right text-xs text-muted-foreground sm:block">
            <div>{totalScheduled} scheduled this month</div>
            <div className="capitalize">{campaign.status}</div>
          </div>
          <button
            type="button"
            onClick={() => fetchMonth(currentMonth)}
            disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div className="flex-1">{error}</div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-xs opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Month switcher */}
      <div className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            className="flex h-8 w-8 items-center justify-center rounded-lg border bg-background text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goNext}
            className="flex h-8 w-8 items-center justify-center rounded-lg border bg-background text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="h-8 rounded-lg border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Today
          </button>
        </div>

        <div className="text-sm font-semibold text-foreground">
          {monthLabel(currentMonth, locale)}
        </div>

        <div className="w-[112px]" aria-hidden />
      </div>

      {/* Calendar grid */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {weekdays.map((w) => (
            <div key={w} className="px-2 py-2 text-center">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell) => {
            const rows = byDay.get(cell.key) ?? [];
            const isToday = cell.key === today;
            const isSelected = cell.key === selectedDay;
            const isDragOver = cell.key === dragOverKey;

            return (
              <div
                key={cell.key}
                onClick={() => setSelectedDay(cell.key)}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverKey !== cell.key) setDragOverKey(cell.key);
                }}
                onDragLeave={() => {
                  if (dragOverKey === cell.key) setDragOverKey(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverKey(null);
                  const rowId = e.dataTransfer.getData('text/campaign-content-id');
                  if (!rowId) return;
                  const source = groups.flatMap((g) => g.contentItems).find((it) => it.id === rowId);
                  if (source) reschedule(source, cell.key);
                }}
                className={`group relative flex min-h-[112px] cursor-pointer flex-col gap-1 border-b border-r p-2 transition-colors ${
                  cell.inMonth ? 'bg-card' : 'bg-muted/20'
                } ${isSelected ? 'ring-2 ring-inset ring-primary/60' : ''} ${
                  isDragOver ? 'bg-primary/10' : ''
                } hover:bg-muted/30`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex h-6 min-w-[24px] items-center justify-center rounded-full px-1.5 text-xs font-medium ${
                      isToday
                        ? 'bg-primary text-primary-foreground'
                        : cell.inMonth
                          ? 'text-foreground'
                          : 'text-muted-foreground/60'
                    }`}
                  >
                    {cell.day}
                  </span>
                  {rows.length > 0 && (
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {rows.length}
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  {rows.slice(0, 3).map((row) => (
                    <PostChip
                      key={row.id}
                      row={row}
                      dimmed={reschedulingIds.has(row.id)}
                    />
                  ))}
                  {rows.length > 3 && (
                    <span className="pl-1 text-[10px] font-medium text-muted-foreground">
                      +{rows.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Empty state — only when API returns nothing and not loading */}
      {!loading && groups.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-14 text-muted-foreground">
          <CalendarDays className="mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No posts scheduled in {monthLabel(currentMonth, locale)}</p>
          <p className="mt-1 text-xs">Generate or launch this campaign to populate the calendar.</p>
        </div>
      )}

      {/* Day sidebar drawer */}
      {selectedDay && (
        <DaySidebar
          campaignId={campaign.id}
          dateKey={selectedDay}
          rows={selectedRows}
          locale={locale}
          onClose={() => setSelectedDay(null)}
          onEdit={setEditingItem}
          onRefresh={() => fetchMonth(currentMonth)}
        />
      )}

      {/* Lightweight post editor modal, shared with the Review grid */}
      {editingItem && (
        <CampaignPostEditModal
          campaignId={campaign.id}
          contentItem={editingItem}
          reRollsRemaining={campaign.reRollsRemaining ?? 0}
          onCancel={() => setEditingItem(null)}
          onSaved={() => {
            setEditingItem(null);
            fetchMonth(currentMonth);
          }}
        />
      )}
    </div>
  );
}

// ── Post chip (calendar cell) ──────────────────────────────────────────────

function PostChip({ row, dimmed }: { row: CampaignContentRow; dimmed: boolean }) {
  const item = row.contentItem;
  const thumb = resolveThumb(item);
  const videoUrl = resolveVideoUrl(item);
  const isVideo = isVideoContentType(item);
  const label = item?.caption?.trim() || item?.topic || item?.contentType || 'Post';
  const platforms = item?.targetPlatforms ?? [];

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/campaign-content-id', row.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={(e) => {
        // Prevent day-cell click when interacting with the chip itself.
        e.stopPropagation();
      }}
      className={`flex items-center gap-1.5 truncate rounded-md border bg-background/70 px-1.5 py-1 text-[11px] transition-opacity hover:border-primary/50 ${
        dimmed ? 'opacity-50' : ''
      }`}
      title={label}
    >
      <span className="relative flex h-4 w-4 flex-shrink-0 overflow-hidden rounded-sm bg-muted">
        {isVideo && videoUrl ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            src={videoUrl}
            poster={thumb ?? undefined}
            className="h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
        ) : thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : null}
      </span>
      <span className="truncate">{row.scheduledTime?.slice(0, 5) || '—'}</span>
      <span className="truncate text-muted-foreground">
        {platforms[0] || item?.contentType || ''}
      </span>
    </div>
  );
}

// ── Day sidebar drawer ─────────────────────────────────────────────────────

function DaySidebar({
  campaignId,
  dateKey,
  rows,
  locale,
  onClose,
  onEdit,
  onRefresh,
}: {
  campaignId: string;
  dateKey: string;
  rows: CampaignContentRow[];
  locale: string;
  onClose: () => void;
  onEdit: (item: ContentItem) => void;
  onRefresh: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      {/* Scrim — inline dismiss, not a blocking modal for errors. */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label={`Posts scheduled for ${dayLabel(dateKey, locale)}`}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-hidden border-l bg-background shadow-2xl"
      >
        <div className="flex items-start justify-between gap-2 border-b p-4">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Scheduled
            </div>
            <div className="mt-0.5 truncate text-base font-semibold text-foreground">
              {dayLabel(dateKey, locale)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-muted-foreground">
              <CalendarDays className="mb-2 h-6 w-6 text-muted-foreground/50" />
              <p className="text-sm">No posts scheduled</p>
              <p className="mt-0.5 text-xs">Drag a post from another day onto this cell to move it here.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {rows.map((row) => (
                <DayPostRow
                  key={row.id}
                  campaignId={campaignId}
                  row={row}
                  onEdit={onEdit}
                  onRefresh={onRefresh}
                />
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}

function DayPostRow({
  campaignId,
  row,
  onEdit,
  onRefresh,
}: {
  campaignId: string;
  row: CampaignContentRow;
  onEdit: (item: ContentItem) => void;
  onRefresh: () => void;
}) {
  const item = row.contentItem;
  const thumb = resolveThumb(item);
  const videoUrl = resolveVideoUrl(item);
  const isVideo = isVideoContentType(item);
  const caption = item?.caption?.trim() || item?.topic || 'Untitled post';
  const platforms = item?.targetPlatforms ?? [];

  const [isRerolling, setIsRerolling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleReroll = async () => {
    if (!item || isRerolling) return;
    setIsRerolling(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/re-roll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentItemId: item.id, keepText: false }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Re-roll failed');
    } finally {
      setIsRerolling(false);
    }
  };

  const handleDelete = async () => {
    if (!item || isDeleting) return;
    if (!window.confirm('Delete this post from the campaign?')) return;
    setIsDeleting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/content/${item.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Delete failed');
      setIsDeleting(false);
    }
  };

  return (
    <li className="rounded-xl border bg-card p-3">
      <div className="flex gap-3">
        <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
          {isVideo && videoUrl ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              src={videoUrl}
              poster={thumb ?? undefined}
              className="h-full w-full object-cover"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
            />
          ) : thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
              No media
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{row.scheduledTime?.slice(0, 5) || 'Time not set'}</span>
            {item?.contentType && (
              <>
                <span aria-hidden>·</span>
                <span className="capitalize">{item.contentType.replace(/_/g, ' ')}</span>
              </>
            )}
          </div>
          <p className="mt-1 line-clamp-3 text-sm text-foreground">{caption}</p>
          {platforms.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {platforms.map((p) => (
                <span
                  key={p}
                  className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground"
                >
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {actionError && (
        <p className="mt-2 text-xs text-destructive">{actionError}</p>
      )}

      {item && (
        <div className="mt-3 flex items-center justify-end gap-1.5 border-t pt-2">
          <button
            type="button"
            onClick={() => onEdit(item)}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
          <button
            type="button"
            onClick={handleReroll}
            disabled={isRerolling || isDeleting}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            title="Re-roll"
          >
            {isRerolling ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Re-roll
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isRerolling || isDeleting}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            title="Delete"
          >
            {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            Delete
          </button>
        </div>
      )}
    </li>
  );
}
