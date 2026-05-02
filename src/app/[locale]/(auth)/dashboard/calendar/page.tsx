'use client';

import {
  AlertCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Image as ImageIcon,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
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

type PlanTopic = {
  topic: string;
  category: 'educational' | 'social_proof' | 'behind_the_scenes' | 'promotional' | 'engagement' | 'trending';
  content_type: string;
  suggested_date: string; // YYYY-MM-DD
  rationale: string;
  position: number;
  dismissed?: boolean;
};

type PlanMeta = {
  topicsAllowed: number;
  regenerationsAllowed: number | null; // null = unlimited
  regenerationsUsed: number;
  canRegenerate: boolean;
};

type PlanState = {
  plan: { topics: PlanTopic[] } | null;
  locked: boolean;
  lockedReason?: string;
  meta: PlanMeta | null;
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

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  educational: { label: 'Educational', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  social_proof: { label: 'Social proof', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  behind_the_scenes: { label: 'Behind the scenes', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  promotional: { label: 'Promotional', color: 'bg-pink-50 text-pink-700 border-pink-200' },
  engagement: { label: 'Engagement', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  trending: { label: 'Trending', color: 'bg-purple-50 text-purple-700 border-purple-200' },
};

const CONTENT_TYPE_ICON: Record<string, React.ElementType> = {
  text_only: FileText,
  single_image: ImageIcon,
  carousel: Layers,
  reel: Video,
  ugc_ad: Video,
  data_story: Layers,
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

const WEEKDAYS_MOBILE = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// -----------------------------------------------------------
// DATE HELPERS
// -----------------------------------------------------------
function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function toMonthString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function parseLocalDate(str: string): Date {
  const [year, month, day] = str.split('-').map(Number);
  return new Date(year!, (month! - 1), day!);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
  );
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

  // Monthly Plan state
  const [planState, setPlanState] = useState<PlanState | null>(null);
  const [isPlanLoading, setIsPlanLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [dismissingPosition, setDismissingPosition] = useState<number | null>(null);

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

  // Derive the current month string from currentDate
  const currentMonth = toMonthString(currentDate);

  // -----------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------
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

  const fetchPlan = useCallback(async (month: string) => {
    setIsPlanLoading(true);
    setPlanError(null);
    try {
      const res = await fetch(`/api/calendar/plan?month=${month}`);
      if (res.ok) {
        const data = await res.json();
        setPlanState(data);
      }
    } catch (err) {
      console.error('Failed to fetch plan:', err);
    } finally {
      setIsPlanLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  // Refetch plan whenever the visible month changes
  useEffect(() => {
    fetchPlan(currentMonth);
  }, [currentMonth, fetchPlan]);

  // -----------------------------------------------------------
  // Plan actions
  // -----------------------------------------------------------
  const handleGeneratePlan = useCallback(async () => {
    setIsGenerating(true);
    setPlanError(null);
    try {
      const res = await fetch('/api/calendar/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: currentMonth }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPlanError(data.error || 'Failed to generate plan.');
        return;
      }
      setPlanState(data);
    } catch {
      setPlanError('Something went wrong. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }, [currentMonth]);

  const handleDismissTopic = useCallback(async (position: number, dismissed: boolean) => {
    setDismissingPosition(position);
    try {
      await fetch('/api/calendar/plan', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: currentMonth, position, dismissed }),
      });
      // Optimistic update
      setPlanState(prev => {
        if (!prev?.plan) {
          return prev;
        }
        return {
          ...prev,
          plan: {
            ...prev.plan,
            topics: prev.plan.topics.map(t =>
              t.position === position ? { ...t, dismissed } : t,
            ),
          },
        };
      });
      // If we dismissed the selected topic, close the panel
      if (dismissed) {
        setSelectedParam(null);
      }
    } catch (err) {
      console.error('Failed to dismiss topic:', err);
    } finally {
      setDismissingPosition(null);
    }
  }, [currentMonth, setSelectedParam]);

  // -----------------------------------------------------------
  // Calendar days
  // -----------------------------------------------------------
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

  // Get active (non-dismissed) topics for a specific date
  const getTopicsForDate = useCallback((date: Date): PlanTopic[] => {
    if (!planState?.plan?.topics) {
      return [];
    }
    const dateStr = toLocalDateString(date);
    return planState.plan.topics.filter(
      t => t.suggested_date === dateStr && !t.dismissed,
    );
  }, [planState]);

  const handleDayClick = (date: Date) => {
    const str = toLocalDateString(date);
    if (selectedParam === str) {
      setSelectedParam(null);
    } else {
      setSelectedParam(str);
    }
  };

  const selectedPosts = selectedDate ? getPostsForDate(selectedDate) : [];
  const selectedTopics = selectedDate ? getTopicsForDate(selectedDate) : [];

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

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedParam(null);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [setSelectedParam]);

  // -----------------------------------------------------------
  // Derived plan state
  // -----------------------------------------------------------
  const hasPlan = !!planState?.plan;
  const isLocked = planState?.locked ?? false;
  const planMeta = planState?.meta ?? null;
  const activeTopics = planState?.plan?.topics.filter(t => !t.dismissed) ?? [];

  const regenLabel = planMeta
    ? planMeta.regenerationsAllowed === null
      ? 'Regenerate plan'
      : planMeta.canRegenerate
        ? `Regenerate plan (${planMeta.regenerationsAllowed - planMeta.regenerationsUsed} left)`
        : 'No regenerations left'
    : '';

  // -----------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------
  return (
    <div className="relative">

      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-2 sm:gap-3">
        <h1 className="hidden text-xl font-semibold tracking-tight sm:block">Calendar</h1>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Previous"
          >
            <ChevronLeft className="size-4" />
          </button>

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

        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-md border p-0.5">
            {(['month', 'week'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => { setViewParam(mode); setSelectedParam(null); }}
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
            href="/dashboard/content/create"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary/90"
          >
            <Plus className="size-3.5" />
            <span className="xs:inline hidden sm:inline">New post</span>
          </Link>
        </div>
      </div>

      {/* ── Monthly Plan banner ──────────────────────────────── */}
      {!isPlanLoading && (
        <>
          {/* Locked state: upgrade prompt */}
          {isLocked && planState?.lockedReason && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3.5">
              <div className="flex items-center gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-100">
                  <Sparkles className="size-4 text-violet-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-violet-900">Monthly Plan</p>
                  <p className="text-xs text-violet-600">{planState.lockedReason}</p>
                </div>
              </div>
              <Link
                href="/dashboard/billing"
                className="shrink-0 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-700"
              >
                Upgrade
              </Link>
            </div>
          )}

          {/* No plan yet: generate prompt */}
          {!isLocked && !hasPlan && planState && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-dashed border-violet-300 bg-violet-50/50 px-4 py-3.5">
              <div className="flex items-center gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-100">
                  <Calendar className="size-4 text-violet-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-violet-900">
                    No Monthly Plan for {formatMonthYear(currentDate)}
                  </p>
                  <p className="text-xs text-violet-600">
                    Generate {planMeta?.topicsAllowed} strategic content topics to fill your month.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleGeneratePlan}
                disabled={isGenerating}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
              >
                {isGenerating
                  ? <Loader2 className="size-3.5 animate-spin" />
                  : <Sparkles className="size-3.5" />}
                {isGenerating ? 'Generating…' : 'Generate plan'}
              </button>
            </div>
          )}

          {/* Plan exists: status bar */}
          {!isLocked && hasPlan && planState && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-violet-200/60 bg-violet-50/40 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-violet-100">
                  <Sparkles className="size-3.5 text-violet-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-violet-900">
                    Monthly Plan active
                    {' '}
                    <span className="font-normal text-violet-500">·</span>
                    {' '}
                    <span className="font-normal text-violet-600">
                      {activeTopics.length} topic{activeTopics.length !== 1 ? 's' : ''} remaining
                    </span>
                  </p>
                  {planMeta && planMeta.regenerationsAllowed !== null && (
                    <p className="text-[11px] text-violet-500">
                      {planMeta.regenerationsAllowed - planMeta.regenerationsUsed} regeneration{planMeta.regenerationsAllowed - planMeta.regenerationsUsed !== 1 ? 's' : ''} left this month
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleGeneratePlan}
                disabled={isGenerating || !planMeta?.canRegenerate}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                title={!planMeta?.canRegenerate ? 'No regenerations remaining this month' : ''}
              >
                {isGenerating
                  ? <Loader2 className="size-3 animate-spin" />
                  : <RefreshCw className="size-3" />}
                {regenLabel}
              </button>
            </div>
          )}

          {/* Plan generation error */}
          {planError && (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-500" />
              <p className="text-sm text-red-700">{planError}</p>
            </div>
          )}
        </>
      )}

      {/* ── Calendar grid ───────────────────────────────────── */}
      <div className={`overflow-hidden rounded-xl border bg-card transition-opacity ${isLoading ? 'opacity-60' : ''}`}>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b bg-muted/30">
          {WEEKDAYS_SHORT.map((d, i) => (
            <div key={d} className="py-2 text-center">
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
            const topics = getTopicsForDate(date);
            const isThisToday = isSameDay(date, today);
            const isSelected = selectedDate ? isSameDay(date, selectedDate) : false;
            const isOutside = viewMode === 'month' && date.getMonth() !== currentDate.getMonth();
            const maxVisible = viewMode === 'week' ? 6 : 2;
            const totalItems = posts.length + topics.length;
            const overflowCount = totalItems - maxVisible;
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
                {/* Date number */}
                <div className="flex items-start justify-between p-1 sm:p-2">
                  <span
                    className={`
                      inline-flex size-5 items-center justify-center rounded-full text-[10px] font-semibold sm:size-6 sm:text-[11px]
                      ${isThisToday ? 'bg-primary text-white' : isOutside ? 'text-muted-foreground/30' : 'text-foreground/80'}
                    `}
                  >
                    {date.getDate()}
                  </span>
                  {totalItems > 0 && (
                    <span className="text-[9px] font-medium tabular-nums text-muted-foreground sm:text-[10px]">
                      {totalItems}
                    </span>
                  )}
                </div>

                {/* Mobile: dots only */}
                <div className="px-1 pb-1 sm:hidden">
                  {totalItems > 0 && (
                    <div className="flex flex-wrap gap-0.5">
                      {posts.slice(0, 3).map(post => {
                        const config = STATUS_CONFIG[post.status] || STATUS_CONFIG.draft!;
                        return <span key={post.id} className={`size-1.5 rounded-full ${config.dot}`} />;
                      })}
                      {topics.slice(0, 3).map(t => (
                        <span key={t.position} className="size-1.5 rounded-full border border-dashed border-violet-400 bg-violet-100" />
                      ))}
                    </div>
                  )}
                </div>

                {/* sm+: pills */}
                <div className="hidden space-y-0.5 px-2 pb-2 sm:block">
                  {/* Real posts first */}
                  {posts.slice(0, maxVisible).map((post) => {
                    const config = STATUS_CONFIG[post.status] || STATUS_CONFIG.draft!;
                    return (
                      <div key={post.id} onClick={e => e.stopPropagation()}>
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

                  {/* Plan topic suggestions */}
                  {topics.slice(0, Math.max(0, maxVisible - posts.length)).map((t) => (
                    <div
                      key={t.position}
                      className="flex items-center gap-1.5 rounded border border-dashed border-violet-300 bg-violet-50 px-1.5 py-0.5"
                    >
                      <span className="size-1.5 shrink-0 rounded-full bg-violet-400" />
                      <span className="truncate text-[11px] font-medium text-violet-700">
                        {t.topic.slice(0, 28)}
                      </span>
                    </div>
                  ))}

                  {overflowCount > 0 && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDayClick(date); }}
                      className="w-full px-1.5 text-left text-[10px] font-medium text-muted-foreground hover:text-foreground"
                    >
                      +
                      {overflowCount}
                      {' '}
                      more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Status legend ────────────────────────────────────── */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:gap-x-4">
        {Object.entries(STATUS_CONFIG)
          .filter(([k]) => k !== 'rejected')
          .map(([key, cfg]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className={`size-1.5 rounded-full ${cfg.dot}`} />
              <span className="text-[11px] text-muted-foreground">{cfg.label}</span>
            </div>
          ))}
        {hasPlan && (
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full border border-dashed border-violet-400 bg-violet-100" />
            <span className="text-[11px] font-medium text-violet-600">Suggested topic</span>
          </div>
        )}
      </div>

      {/* ── Day detail panel ─────────────────────────────────── */}
      {selectedDate && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px]" />

          <div
            ref={panelRef}
            className="
              absolute inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl
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

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">

              {/* ── Suggested topic(s) ── */}
              {selectedTopics.length > 0 && (
                <div className="border-b">
                  <div className="px-5 py-3">
                    <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-violet-500">
                      Monthly Plan suggestion{selectedTopics.length > 1 ? 's' : ''}
                    </p>
                    <div className="space-y-3">
                      {selectedTopics.map((t) => {
                        const catCfg = CATEGORY_CONFIG[t.category] ?? CATEGORY_CONFIG.educational!;
                        const ContentIcon = CONTENT_TYPE_ICON[t.content_type] || FileText;
                        const isDismissing = dismissingPosition === t.position;

                        return (
                          <div
                            key={t.position}
                            className="rounded-xl border border-violet-200/70 bg-violet-50/60 p-3.5"
                          >
                            {/* Category + content type */}
                            <div className="mb-2 flex items-center gap-2">
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${catCfg.color}`}>
                                {catCfg.label}
                              </span>
                              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <ContentIcon className="size-3" />
                                {t.content_type.replace('_', ' ')}
                              </span>
                            </div>

                            {/* Topic */}
                            <p className="mb-1.5 text-sm font-medium leading-snug text-violet-900">
                              {t.topic}
                            </p>

                            {/* Rationale */}
                            {t.rationale && (
                              <p className="mb-3 text-xs leading-relaxed text-violet-600">
                                {t.rationale}
                              </p>
                            )}

                            {/* Actions */}
                            <div className="flex gap-2">
                              <Link
                                href={`/dashboard/content/create?topic=${encodeURIComponent(t.topic)}&contentType=${t.content_type}&scheduledDate=${t.suggested_date}`}
                                className="flex-1 rounded-lg bg-violet-600 px-3 py-2 text-center text-xs font-medium text-white transition-colors hover:bg-violet-700"
                              >
                                Create this post
                              </Link>
                              <button
                                type="button"
                                onClick={() => handleDismissTopic(t.position, true)}
                                disabled={isDismissing}
                                className="rounded-lg border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                              >
                                {isDismissing ? <Loader2 className="size-3 animate-spin" /> : 'Dismiss'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Schedule a post CTA (always shown) ── */}
              <div className="border-b px-5 py-3">
                <Link
                  href={`/dashboard/content/create?scheduledDate=${toLocalDateString(selectedDate)}`}
                  className="flex items-center gap-2 text-xs font-medium text-primary hover:underline"
                >
                  <Plus className="size-3.5" />
                  Schedule a custom post for this day
                </Link>
              </div>

              {/* ── Existing posts ── */}
              <div className="px-5 py-4">
                {selectedPosts.length === 0 && selectedTopics.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                    <div className="rounded-lg border border-dashed p-3">
                      <Clock className="size-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">No posts on this day.</p>
                  </div>
                ) : selectedPosts.length > 0 ? (
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
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
