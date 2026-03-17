'use client';

import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  // Plus,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

// import { PageHeader } from '@/features/dashboard/PageHeader';

// -----------------------------------------------------------
// TYPES
// -----------------------------------------------------------
interface ContentItem {
  id: string;
  caption: string;
  status: string;
  targetPlatforms: string[];
  scheduledFor: string | null;
  publishedAt: string | null;
  createdAt: string;
}

type ViewMode = 'month' | 'week';

const STATUS_DOT: Record<string, string> = {
  draft: 'bg-gray-300',
  pending_review: 'bg-yellow-400',
  approved: 'bg-blue-400',
  scheduled: 'bg-purple-400',
  published: 'bg-[#16A34A]',
  rejected: 'bg-red-400',
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// -----------------------------------------------------------
// CALENDAR PAGE
// -----------------------------------------------------------
export default function CalendarPage() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());

  console.log({isLoading})

  const fetchContent = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/content?limit=200');
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

  useEffect(() => { fetchContent(); }, [fetchContent]);

  const today = new Date();
  const isToday = (d: Date) =>
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();

  const isCurrentMonth = (d: Date) => d.getMonth() === currentDate.getMonth();

  // Get posts for a specific date
  const getPostsForDate = (date: Date): ContentItem[] => {
    const dateStr = date.toISOString().split('T')[0];
    return items.filter((item) => {
      const itemDate = item.scheduledFor || item.createdAt;
      return itemDate && itemDate.startsWith(dateStr!);
    });
  };

  // Navigation
  const navigate = (direction: -1 | 1) => {
    const next = new Date(currentDate);
    if (viewMode === 'month') {
      next.setMonth(next.getMonth() + direction);
    } else {
      next.setDate(next.getDate() + (direction * 7));
    }
    setCurrentDate(next);
  };

  // Generate calendar grid
  const getMonthDays = (): Date[] => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    // const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - startDate.getDay());
    const days: Date[] = [];
    const current = new Date(startDate);
    while (days.length < 42) { // 6 rows
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return days;
  };

  const getWeekDays = (): Date[] => {
    const start = new Date(currentDate);
    start.setDate(start.getDate() - start.getDay());
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      days.push(new Date(start));
      start.setDate(start.getDate() + 1);
    }
    return days;
  };

  const days = viewMode === 'month' ? getMonthDays() : getWeekDays();

  // Header label
  const headerLabel = viewMode === 'month'
    ? currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : `${days[0]!.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${days[6]!.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <>
      {/* Calendar header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold tracking-tight">Calendar</h1>
          <div className="flex items-center gap-1">
            <button onClick={() => navigate(-1)} className="rounded-lg p-1.5 hover:bg-muted">
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-[180px] text-center text-sm font-medium">{headerLabel}</span>
            <button onClick={() => navigate(1)} className="rounded-lg p-1.5 hover:bg-muted">
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex rounded-lg border p-0.5">
            <button
              onClick={() => setViewMode('month')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'month' ? 'bg-[#16A34A] text-white' : 'hover:bg-muted'
              }`}
            >
              <CalendarIcon className="size-3" />
              Month
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === 'week' ? 'bg-[#16A34A] text-white' : 'hover:bg-muted'
              }`}
            >
              <CalendarIcon className="size-3" />
              Week
            </button>
          </div>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="overflow-hidden rounded-xl border bg-background">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b">
          {DAYS.map((day) => (
            <div key={day} className="px-3 py-2.5 text-center text-xs font-medium text-muted-foreground">
              {day}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className={`grid grid-cols-7 ${viewMode === 'week' ? '' : 'auto-rows-fr'}`}>
          {days.map((date, i) => {
            const posts = getPostsForDate(date);
            const todayCell = isToday(date);
            const outsideMonth = viewMode === 'month' && !isCurrentMonth(date);

            return (
              <div
                key={i}
                className={`relative border-b border-r p-2 transition-colors ${
                  viewMode === 'week' ? 'min-h-[300px]' : 'min-h-[100px]'
                } ${todayCell ? 'bg-[#16A34A]/5' : ''} ${outsideMonth ? 'bg-muted/20' : ''} ${
                  i % 7 === 6 ? 'border-r-0' : ''
                } hover:bg-muted/30`}
              >
                {/* Date number */}
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={`text-xs ${
                      todayCell
                        ? 'flex size-6 items-center justify-center rounded-full bg-[#16A34A] font-semibold text-white'
                        : outsideMonth
                          ? 'text-muted-foreground/40'
                          : 'font-medium'
                    }`}
                  >
                    {viewMode === 'week'
                      ? date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })
                      : `${date.toLocaleDateString('en-US', { month: 'short' })} ${date.getDate()}`}
                  </span>
                </div>

                {/* Posts */}
                {posts.length > 0 ? (
                  <div className="space-y-0.5">
                    {posts.slice(0, viewMode === 'week' ? 10 : 3).map((post) => (
                      <Link
                        key={post.id}
                        href={`/dashboard/content/${post.id}`}
                        className="group flex items-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:bg-muted"
                      >
                        <span className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[post.status] || 'bg-gray-300'}`} />
                        <span className="truncate text-[11px] text-muted-foreground group-hover:text-foreground">
                          {post.caption.slice(0, 40)}
                        </span>
                      </Link>
                    ))}
                    {posts.length > (viewMode === 'week' ? 10 : 3) && (
                      <p className="px-1 text-[10px] text-muted-foreground">
                        +{posts.length - (viewMode === 'week' ? 10 : 3)} more
                      </p>
                    )}
                  </div>
                ) : (
                  !outsideMonth && (
                    <p className="px-1 text-[10px] text-muted-foreground/40">No posts</p>
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-4">
        {Object.entries({ draft: 'Draft', pending_review: 'Pending review', approved: 'Approved', scheduled: 'Scheduled', published: 'Published' }).map(
          ([key, label]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${STATUS_DOT[key]}`} />
              <span className="text-[11px] text-muted-foreground">{label}</span>
            </div>
          ),
        )}
      </div>
    </>
  );
}
