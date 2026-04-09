'use client';

import {
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Image as ImageIcon,
  Layers,
  Plus,
  Video,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { parseAsString, useQueryState } from 'nuqs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// -----------------------------------------------------------
// TYPES
// -----------------------------------------------------------
type ContentItem = {
  id: string;
  caption: string;
  status: string;
  contentType: string;
  targetPlatforms: string[];
  scheduledFor: string | null;
  publishedAt: string | null;
  createdAt: string;
};

type ViewMode = 'month' | 'week';

// -----------------------------------------------------------
// CONSTANTS
// -----------------------------------------------------------
const STATUS_CONFIG: Record<string, { dot: string; label: string; bar: string }> = {
  draft: { dot: 'bg-zinc-300', label: 'Draft', bar: 'bg-zinc-200' },
  pending_review: { dot: 'bg-amber-400', label: 'Pending review', bar: 'bg-amber-100' },
  approved: { dot: 'bg-blue-400', label: 'Approved', bar: 'bg-blue-100' },
  scheduled: { dot: 'bg-violet-500', label: 'Scheduled', bar: 'bg-violet-100' },
  published: { dot: 'bg-emerald-500', label: 'Published', bar: 'bg-emerald-100' },
  rejected: { dot: 'bg-red-400', label: 'Rejected', bar: 'bg-red-100' },
};

const PLATFORM_ABBR: Record<string, string> = {
  linkedin: 'LI',
  linkedin_page: 'LI',
  instagram: 'IG',
  twitter: 'X',
  facebook: 'FB',
  tiktok: 'TT',
  youtube: 'YT',
  threads: 'TH',
  pinterest: 'PT',
};

const CONTENT_TYPE_ICON: Record<string, React.ElementType> = {
  text: FileText,
  single_image: ImageIcon,
  carousel: Layers,
  reel: Video,
};

// Single letter for mobile, 3-letter for desktop
const WEEKDAYS_MOBILE = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// -----------------------------------------------------------
// DATE HELPERS
// -----------------------------------------------------------
function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseLocalDate(str: string): Date {
  const [year, month, day] = str.split('-').map(Number);
  return new Date(year!, (month! - 1), day!);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatMonthYearShort(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function formatWeekRange(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth();
  const sameYear = start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    return `${start.toLocaleDateString('en-US', { month: 'long' })} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`;
  }
  if (sameYear) {
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${end.getFullYear()}`;
  }
  return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function formatWeekRangeShort(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth();
  if (sameMonth) {
    return `${start.toLocaleDateString('en-US', { month: 'short' })} ${start.getDate()}–${end.getDate()}`;
  }
  return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

// -----------------------------------------------------------
// PAGE
// -----------------------------------------------------------
export default function CalendarPage() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // URL state via nuqs
  const [viewParam, setViewParam] = useQueryState('view', parseAsString.withDefault('month'));
  const [dateParam, setDateParam] = useQueryState('date', parseAsString.withDefault(''));
  const [selectedParam, setSelectedParam] = useQueryState('selected', parseAsString.withDefault(''));

  const viewMode: ViewMode = viewParam === 'week' ? 'week' : 'month';
  const today = useMemo(() => new Date(), []);

  const currentDate = useMemo(() => {
    if (dateParam) {
      return parseLocalDate(dateParam);
    }
    return today;
  }, [dateParam, today]);

  const selectedDate = useMemo(() => {
    if (selectedParam) {
      return parseLocalDate(selectedParam);
    }
    return null;
  }, [selectedParam]);

  const panelRef = useRef<HTMLDivElement>(null);

  const fetchContent = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/content?limit=500');
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error('Failed to fetch content:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  // Close panel on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setSelectedParam(null);
      }
    };
    if (selectedDate) {
      document.addEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [selectedDate, setSelectedParam]);

  // Close panel on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedParam(null);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [setSelectedParam]);

  // Build calendar days
  const calendarDays = useMemo(() => {
    if (viewMode === 'week') {
      const start = new Date(currentDate);
      start.setDate(start.getDate() - start.getDay());
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        return d;
      });
    }
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startDate.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      return d;
    });
  }, [currentDate, viewMode]);

  const weekStart = viewMode === 'week' ? calendarDays[0]! : null;
  const weekEnd = viewMode === 'week' ? calendarDays[6]! : null;

  const navigate = (dir: -1 | 1) => {
    const next = new Date(currentDate);
    if (viewMode === 'month') {
      next.setMonth(next.getMonth() + dir);
    } else {
      next.setDate(next.getDate() + dir * 7);
    }
    setDateParam(toLocalDateString(next));
    setSelectedParam(null);
  };

  const goToToday = () => {
    setDateParam(toLocalDateString(today));
    setSelectedParam(null);
  };

  const getPostsForDate = useCallback((date: Date): ContentItem[] => {
    const dateStr = toLocalDateString(date);
    return items.filter((item) => {
      const ref = item.scheduledFor || item.publishedAt || item.createdAt;
      if (!ref) {
        return false;
      }
      return ref.startsWith(dateStr);
    });
  }, [items]);

  const handleDayClick = (date: Date) => {
    const str = toLocalDateString(date);
    if (selectedParam === str) {
      setSelectedParam(null);
    } else {
      setSelectedParam(str);
    }
  };

  const selectedPosts = selectedDate ? getPostsForDate(selectedDate) : [];

  return (
    <div className="relative">

      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-2 sm:gap-3">

        {/* Title — hidden on very small screens to save space */}
        <h1 className="hidden text-xl font-semibold tracking-tight sm:block">Calendar</h1>

        {/* Navigation */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Previous"
          >
            <ChevronLeft className="size-4" />
          </button>

          {/* Long label on md+, short on mobile */}
          <span className="hidden min-w-[180px] text-center text-sm font-medium sm:block">
            {viewMode === 'month'
              ? formatMonthYear(currentDate)
              : formatWeekRange(weekStart!, weekEnd!)}
          </span>
          <span className="block min-w-[100px] text-center text-sm font-medium sm:hidden">
            {viewMode === 'month'
              ? formatMonthYearShort(currentDate)
              : formatWeekRangeShort(weekStart!, weekEnd!)}
          </span>

          <button
            type="button"
            onClick={() => navigate(1)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Next"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={goToToday}
          className="rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
        >
          Today
        </button>

        {/* Right side controls */}
        <div className="ml-auto flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-md border p-0.5">
            {(['month', 'week'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setViewParam(mode); setSelectedParam(null);
                }}
                className={`rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                  viewMode === mode
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <Link
            href="/dashboard/posts/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary/90"
          >
            <Plus className="size-3.5" />
            {/* Label hidden on very small screens */}
            <span className="xs:inline hidden sm:inline">New post</span>
          </Link>
        </div>
      </div>

      {/* ── Calendar grid ───────────────────────────────────── */}
      <div className={`overflow-hidden rounded-xl border bg-card transition-opacity ${isLoading ? 'opacity-60' : ''}`}>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b bg-muted/30">
          {WEEKDAYS_SHORT.map((d, i) => (
            <div key={d} className="py-2 text-center">
              {/* Single letter on mobile, 3-letter on sm+ */}
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:hidden">
                {WEEKDAYS_MOBILE[i]}
              </span>
              <span className="hidden text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:block">
                {d}
              </span>
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {calendarDays.map((date, i) => {
            const posts = getPostsForDate(date);
            const isThisToday = isSameDay(date, today);
            const isSelected = selectedDate ? isSameDay(date, selectedDate) : false;
            const isOutside = viewMode === 'month' && date.getMonth() !== currentDate.getMonth();
            // Fewer visible pills on mobile to avoid overflow
            const maxVisible = viewMode === 'week' ? 6 : 2;
            const overflow = posts.length - maxVisible;
            const isLastCol = i % 7 === 6;
            const isLastRow = i >= calendarDays.length - 7;

            return (
              <div
                key={i}
                onClick={() => handleDayClick(date)}
                className={`
                  relative cursor-pointer border-b border-r transition-colors
                  ${viewMode === 'week' ? 'min-h-[120px] sm:min-h-[180px]' : 'min-h-[60px] sm:min-h-[100px]'}
                  ${isLastCol ? 'border-r-0' : ''}
                  ${isLastRow ? 'border-b-0' : ''}
                  ${isOutside ? 'bg-muted/20' : ''}
                  ${isSelected ? 'bg-primary/5 ring-1 ring-inset ring-primary/20' : 'hover:bg-muted/30'}
                `}
              >
                {/* Date number + post count */}
                <div className="flex items-start justify-between p-1 sm:p-2">
                  <span
                    className={`
                      inline-flex size-5 items-center justify-center rounded-full text-[10px] font-semibold sm:size-6 sm:text-[11px]
                      ${isThisToday ? 'bg-primary text-white' : isOutside ? 'text-muted-foreground/30' : 'text-foreground/80'}
                    `}
                  >
                    {date.getDate()}
                  </span>
                  {posts.length > 0 && (
                    <span className="text-[9px] font-medium tabular-nums text-muted-foreground sm:text-[10px]">
                      {posts.length}
                    </span>
                  )}
                </div>

                {/* Post pills — hidden on mobile below the date number,
                    shown as colored dots on mobile, full pills on sm+ */}
                <div className="px-1 pb-1 sm:px-2 sm:pb-2">

                  {/* Mobile: colored dots only */}
                  {posts.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 sm:hidden">
                      {posts.slice(0, 4).map((post) => {
                        const config = STATUS_CONFIG[post.status] || STATUS_CONFIG.draft!;
                        return (
                          <span
                            key={post.id}
                            className={`size-1.5 rounded-full ${config.dot}`}
                          />
                        );
                      })}
                      {posts.length > 4 && (
                        <span className="text-[8px] font-bold text-muted-foreground">
                          +
                          {posts.length - 4}
                        </span>
                      )}
                    </div>
                  )}

                  {/* sm+: full text pills */}
                  <div className="hidden space-y-0.5 sm:block">
                    {posts.slice(0, maxVisible).map((post) => {
                      const config = STATUS_CONFIG[post.status] || STATUS_CONFIG.draft!;
                      return (
                        <div
                          key={post.id}
                          onClick={e => e.stopPropagation()}
                        >
                          <Link
                            href={`/dashboard/content/${post.id}`}
                            className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors ${config.bar} hover:opacity-80`}
                          >
                            <span className={`size-1.5 shrink-0 rounded-full ${config.dot}`} />
                            <span className="truncate text-[11px] font-medium text-foreground/80">
                              {post.caption.slice(0, 28)}
                            </span>
                          </Link>
                        </div>
                      );
                    })}
                    {overflow > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation(); handleDayClick(date);
                        }}
                        className="w-full px-1.5 text-left text-[10px] font-medium text-muted-foreground hover:text-foreground"
                      >
                        +
                        {overflow}
                        {' '}
                        more
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Status legend ────────────────────────────────────── */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:gap-x-4">
        {Object.entries(STATUS_CONFIG).filter(([k]) => k !== 'rejected').map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className={`size-1.5 rounded-full ${cfg.dot}`} />
            <span className="text-[11px] text-muted-foreground">{cfg.label}</span>
          </div>
        ))}
      </div>

      {/* ── Day detail panel ─────────────────────────────────── */}
      {selectedDate && (
        <div className="fixed inset-0 z-40">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px]" />

          {/* Panel — bottom sheet on mobile, right sidebar on sm+ */}
          <div
            ref={panelRef}
            className="
              absolute inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col rounded-t-2xl
              border-t bg-card shadow-xl sm:bottom-auto
              sm:right-0 sm:top-0 sm:h-full sm:max-h-none sm:w-96 sm:rounded-none
              sm:rounded-l-xl sm:border-l sm:border-t-0
            "
          >
            {/* Drag handle — mobile only */}
            <div className="flex justify-center pt-3 sm:hidden">
              <div className="h-1 w-10 rounded-full bg-muted-foreground/20" />
            </div>

            {/* Panel header */}
            <div className="flex items-start justify-between border-b px-5 py-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {WEEKDAYS_LONG[selectedDate.getDay()]}
                </p>
                <h2 className="text-base font-semibold tracking-tight sm:text-lg">
                  {selectedDate.toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedParam(null)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Create shortcut */}
            <div className="border-b px-5 py-3">
              <Link
                href={`/dashboard/posts/new?scheduledDate=${toLocalDateString(selectedDate)}`}
                className="flex items-center gap-2 text-xs font-medium text-primary hover:underline"
              >
                <Plus className="size-3.5" />
                Schedule a post for this day
              </Link>
            </div>

            {/* Posts list */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {selectedPosts.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                  <div className="rounded-lg border border-dashed p-3">
                    <Clock className="size-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">No posts on this day.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="mb-3 text-xs font-medium text-muted-foreground">
                    {selectedPosts.length}
                    {' '}
                    {selectedPosts.length === 1 ? 'post' : 'posts'}
                  </p>
                  {selectedPosts.map((post) => {
                    const config = STATUS_CONFIG[post.status] || STATUS_CONFIG.draft!;
                    const Icon = CONTENT_TYPE_ICON[post.contentType] || FileText;
                    const ref = post.scheduledFor || post.publishedAt;
                    return (
                      <Link
                        key={post.id}
                        href={`/dashboard/content/${post.id}`}
                        className="group block rounded-lg border bg-background p-3 transition-colors hover:border-primary/30 hover:bg-muted/30"
                      >
                        <div className="mb-1.5 flex items-center gap-2">
                          <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                          <div className="ml-auto flex flex-wrap items-center gap-1.5">
                            {post.targetPlatforms.slice(0, 3).map(p => (
                              <span
                                key={p}
                                className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                              >
                                {PLATFORM_ABBR[p] || p.toUpperCase().slice(0, 2)}
                              </span>
                            ))}
                            <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${config.bar} text-foreground/70`}>
                              <span className={`size-1.5 rounded-full ${config.dot}`} />
                              {config.label}
                            </span>
                          </div>
                        </div>
                        <p className="line-clamp-2 text-xs text-foreground/80 group-hover:text-foreground">
                          {post.caption}
                        </p>
                        {ref && (
                          <p className="mt-1.5 text-[10px] text-muted-foreground">
                            {new Date(ref).toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </p>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
