'use client';

import { LayoutList, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, Suspense } from 'react';

import { PlatformIcons } from '@/components/icons/PlatformIcons';
import { EmptyState } from '@/features/dashboard/EmptyState';

interface ContentItem {
  id: string;
  caption: string;
  contentType: string;
  status: string;
  targetPlatforms: string[];
  scheduledFor: string | null;
  publishedAt: string | null;
  createdAt: string;
  antiSlopScore: number | null;
}

const STATUS_CONFIG: Record<string, { label: string; dot: string; bg: string }> = {
  draft: { label: 'Draft', dot: 'bg-gray-400', bg: 'bg-gray-50 text-gray-600' },
  pending_review: { label: 'Pending review', dot: 'bg-yellow-400', bg: 'bg-yellow-50 text-yellow-700' },
  approved: { label: 'Approved', dot: 'bg-blue-400', bg: 'bg-blue-50 text-blue-700' },
  scheduled: { label: 'Scheduled', dot: 'bg-purple-400', bg: 'bg-purple-50 text-purple-700' },
  published: { label: 'Published', dot: 'bg-[#16A34A]', bg: 'bg-green-50 text-green-700' },
  rejected: { label: 'Rejected', dot: 'bg-red-400', bg: 'bg-red-50 text-red-700' },
};

function PostsContent() {
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get('status');
  const [items, setItems] = useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchContent = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (statusFilter) params.set('status', statusFilter);
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

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {statusFilter ? STATUS_CONFIG[statusFilter]?.label || 'Posts' : 'All posts'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {items.length} post{items.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Status tabs */}
      <div className="mb-5 flex flex-wrap items-center gap-1.5 border-b pb-3">
        <Link
          href="/dashboard/posts"
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            !statusFilter ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          All
        </Link>
        {Object.entries(STATUS_CONFIG).map(([key, config]) => (
          <Link
            key={key}
            href={`/dashboard/posts?status=${key}`}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === key ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <span className={`size-1.5 rounded-full ${config.dot}`} />
            {config.label}
            {counts[key] ? ` (${counts[key]})` : ''}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={LayoutList}
          title={statusFilter ? `No ${STATUS_CONFIG[statusFilter]?.label?.toLowerCase()} posts` : 'No posts yet'}
          description="Content created by your NativPost team will appear here."
        />
      ) : (
        <div className="space-y-1">
          {items.map((item) => {
            const config = STATUS_CONFIG[item.status] || STATUS_CONFIG['draft']!;
            return (
              <Link
                key={item.id}
                href={`/dashboard/content/${item.id}`}
                className="flex items-center gap-4 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-muted/30"
              >
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${config.bg}`}>
                  {config.label}
                </span>
                <p className="min-w-0 flex-1 truncate text-sm">{item.caption}</p>
                <PlatformIcons platforms={item.targetPlatforms || []} className="size-3.5" />
                <span className="shrink-0 text-xs text-muted-foreground">
                  {item.scheduledFor
                    ? new Date(item.scheduledFor).toLocaleDateString()
                    : new Date(item.createdAt).toLocaleDateString()}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function PostsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <PostsContent />
    </Suspense>
  );
}