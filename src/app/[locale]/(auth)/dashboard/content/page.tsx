'use client';

import {
  Calendar as CalendarIcon,
  // ChevronLeft,
  // ChevronRight,
  Eye,
  // Filter,
  Loader2,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { PageHeader } from '@/features/dashboard/PageHeader';
import { EmptyState } from '@/features/dashboard/EmptyState';

// -----------------------------------------------------------
// TYPES
// -----------------------------------------------------------
interface ContentItem {
  id: string;
  caption: string;
  contentType: string;
  status: string;
  targetPlatforms: string[];
  scheduledFor: string | null;
  createdAt: string;
  antiSlopScore: number | null;
}

// type ViewMode = 'list' | 'calendar';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  pending_review: 'bg-yellow-50 text-yellow-700',
  approved: 'bg-blue-50 text-blue-700',
  scheduled: 'bg-purple-50 text-purple-700',
  published: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_review: 'Pending review',
  approved: 'Approved',
  scheduled: 'Scheduled',
  published: 'Published',
  rejected: 'Rejected',
};

const PLATFORM_EMOJI: Record<string, string> = {
  instagram: '📸',
  linkedin: '💼',
  twitter: '𝕏',
  facebook: '📘',
  tiktok: '🎵',
};

// -----------------------------------------------------------
// CONTENT CALENDAR PAGE
// -----------------------------------------------------------
export default function ContentPage() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const fetchContent = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/content?${params}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error('Failed to fetch content:', err);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  // Count by status
  const counts = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});

  if (isLoading) {
    return (
      <>
        <PageHeader title="Content Calendar" description="View, create, and manage your scheduled content." />
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Content Calendar"
        description="View, create, and manage your scheduled content."
        actions={
          <Link
            href="/dashboard/content/create"
            className="inline-flex items-center gap-2 rounded-lg bg-[#16A34A] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#15803d]"
          >
            <Plus className="size-4" />
            Create content
          </Link>
        }
      />

      {items.length === 0 && !statusFilter ? (
        <EmptyState
          icon={CalendarIcon}
          title="No content yet"
          description="Generate your first batch of studio-crafted content or create a post manually."
          actionLabel="Create your first post"
          actionHref="/dashboard/content/create"
        />
      ) : (
        <>
          {/* Status filter tabs */}
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setStatusFilter(null)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                !statusFilter ? 'bg-foreground text-background' : 'bg-muted hover:bg-muted/80'
              }`}
            >
              All ({items.length})
            </button>
            {Object.entries(STATUS_LABELS).map(([key, label]) => {
              const count = counts[key] || 0;
              if (count === 0 && key !== statusFilter) return null;
              return (
                <button
                  key={key}
                  onClick={() => setStatusFilter(statusFilter === key ? null : key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    statusFilter === key ? 'bg-foreground text-background' : 'bg-muted hover:bg-muted/80'
                  }`}
                >
                  {label} ({count})
                </button>
              );
            })}
          </div>

          {/* Content list */}
          <div className="space-y-3">
            {(statusFilter ? items.filter((i) => i.status === statusFilter) : items).map((item) => (
              <Link
                key={item.id}
                href={`/dashboard/content/${item.id}`}
                className="flex items-start gap-4 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/30"
              >
                {/* Status badge */}
                <div className="pt-0.5">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[item.status] || 'bg-muted'}`}>
                    {STATUS_LABELS[item.status] || item.status}
                  </span>
                </div>

                {/* Caption preview */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-relaxed line-clamp-2">
                    {item.caption}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {/* Platforms */}
                    <span className="flex items-center gap-1">
                      {(item.targetPlatforms || []).map((p) => (
                        <span key={p} title={p}>{PLATFORM_EMOJI[p] || p}</span>
                      ))}
                    </span>
                    {/* Type */}
                    <span>{item.contentType.replace('_', ' ')}</span>
                    {/* Quality score */}
                    {item.antiSlopScore !== null && (
                      <span className={item.antiSlopScore >= 0.7 ? 'text-green-600' : 'text-yellow-600'}>
                        Quality: {Math.round(item.antiSlopScore * 100)}%
                      </span>
                    )}
                    {/* Date */}
                    <span>
                      {item.scheduledFor
                        ? `Scheduled: ${new Date(item.scheduledFor).toLocaleDateString()}`
                        : `Created: ${new Date(item.createdAt).toLocaleDateString()}`}
                    </span>
                  </div>
                </div>

                {/* Action */}
                <Eye className="mt-1 size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>

          {items.length > 0 && statusFilter && (statusFilter ? items.filter((i) => i.status === statusFilter) : items).length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No content with status "{STATUS_LABELS[statusFilter]}".
            </div>
          )}
        </>
      )}
    </>
  );
}
