'use client';

import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { EmptyState } from '@/features/dashboard/EmptyState';
import { PageHeader } from '@/features/dashboard/PageHeader';

// -----------------------------------------------------------
// TYPES
// -----------------------------------------------------------
type ContentItem = {
  id: string;
  caption: string;
  contentType: string;
  status: string;
  targetPlatforms: string[];
  antiSlopScore: number | null;
  qualityFlags: string[];
  hashtags: string[];
  platformSpecific: Record<string, string>;
  contentMode: string | null;
  createdAt: string;
  variantGroupId: string | null;
  variantNumber: number;
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
// SUB-COMPONENTS
// -----------------------------------------------------------
function PlatformBadge({ platform }: { platform: string }) {
  const color = PLATFORM_COLORS[platform] || 'bg-zinc-500';
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold text-white ${color}`}>
      {PLATFORM_LABELS[platform] || platform}
    </span>
  );
}

function QualityBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = score >= 0.8
    ? 'bg-emerald-50 text-emerald-700'
    : score >= 0.7
      ? 'bg-yellow-50 text-yellow-700'
      : 'bg-red-50 text-red-700';
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${color}`}>
      {pct}
      % quality
    </span>
  );
}

// -----------------------------------------------------------
// PAGE
// -----------------------------------------------------------
export default function ApprovalsPage() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectFeedback, setRejectFeedback] = useState('');

  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch('/api/content?status=pending_review&limit=100');
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error('Failed to fetch pending items:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelected(selected.size === items.length
      ? new Set()
      : new Set(items.map(i => i.id)));
  };

  const approveItem = async (id: string) => {
    setActionLoading(id);
    try {
      await fetch(`/api/content/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved', isSelectedVariant: true }),
      });
      setItems(prev => prev.filter(i => i.id !== id));
      setSelected((prev) => {
        const next = new Set(prev); next.delete(id); return next;
      });
    } catch (err) {
      console.error('Approve failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const rejectItem = async (id: string) => {
    setActionLoading(id);
    try {
      await fetch(`/api/content/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected', rejectionFeedback: rejectFeedback }),
      });
      setItems(prev => prev.filter(i => i.id !== id));
      setRejectingId(null);
      setRejectFeedback('');
    } catch (err) {
      console.error('Reject failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // Parallel bulk approve — much faster than sequential for large queues
  const bulkApprove = async () => {
    setActionLoading('bulk');
    const ids = Array.from(selected);
    await Promise.allSettled(
      ids.map(id =>
        fetch(`/api/content/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'approved', isSelectedVariant: true }),
        }),
      ),
    );
    setItems(prev => prev.filter(i => !selected.has(i.id)));
    setSelected(new Set());
    setActionLoading(null);
  };

  if (isLoading) {
    return (
      <>
        <PageHeader title="Approvals" description="Review and approve content before it goes live." />
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Review and approve content before it goes live."
        actions={items.length > 0 ? (
          // Responsive actions: stack on mobile, row on sm+
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground sm:text-sm">
              {selected.size > 0 ? `${selected.size} selected` : `${items.length} pending`}
            </span>
            <button
              type="button"
              onClick={selectAll}
              className="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted sm:px-3 sm:py-2"
            >
              {selected.size === items.length ? 'Deselect all' : 'Select all'}
            </button>
            {selected.size > 0 && (
              <button
                type="button"
                onClick={bulkApprove}
                disabled={actionLoading === 'bulk'}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-60 sm:px-3 sm:py-2"
              >
                {actionLoading === 'bulk'
                  ? <Loader2 className="size-3 animate-spin" />
                  : <Check className="size-3" />}
                Approve
                {' '}
                {selected.size}
              </button>
            )}
          </div>
        ) : undefined}
      />

      {items.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="All caught up"
          description="No content waiting for approval. When NativPost generates new content, it'll appear here for your review."
        />
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {items.map((item) => {
            const isSelected = selected.has(item.id);
            const isRejecting = rejectingId === item.id;
            const isActioning = actionLoading === item.id;

            return (
              <div
                key={item.id}
                className={`overflow-hidden rounded-xl border bg-card transition-all ${
                  isSelected ? 'border-emerald-500 ring-1 ring-emerald-500/20' : ''
                }`}
              >
                {/* ── Card header ──────────────────────────── */}
                <div className="flex items-center gap-3 border-b px-4 py-3 sm:px-5">
                  {/* Checkbox */}
                  <button
                    type="button"
                    onClick={() => toggleSelect(item.id)}
                    className={`flex size-5 shrink-0 items-center justify-center rounded border transition-colors ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-500'
                        : 'border-muted-foreground/30 hover:border-muted-foreground'
                    }`}
                    aria-label={isSelected ? 'Deselect' : 'Select'}
                  >
                    {isSelected && <Check className="size-3 text-white" />}
                  </button>

                  {/* Meta — wraps gracefully on mobile */}
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-xs text-muted-foreground">
                      Variant
                      {' '}
                      {item.variantNumber}
                    </span>
                    <span className="text-xs text-muted-foreground/40">·</span>
                    <span className="text-xs text-muted-foreground">
                      {item.contentType.replace(/_/g, ' ')}
                    </span>

                    {/* Platform badges */}
                    <div className="flex flex-wrap gap-1">
                      {(item.targetPlatforms || []).map(p => (
                        <PlatformBadge key={p} platform={p} />
                      ))}
                    </div>

                    {/* Quality score */}
                    {item.antiSlopScore !== null && (
                      <QualityBadge score={item.antiSlopScore} />
                    )}
                  </div>

                  {/* Date + view link */}
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="hidden text-xs text-muted-foreground sm:block">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                    <Link
                      href={`/dashboard/content/${item.id}`}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      title="View full post"
                    >
                      <ExternalLink className="size-3.5" />
                    </Link>
                  </div>
                </div>

                {/* ── Caption ──────────────────────────────── */}
                <div className="p-4 sm:px-5">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{item.caption}</p>

                  {item.hashtags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(item.hashtags as string[]).map(tag => (
                        <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Rejection form ───────────────────────── */}
                {isRejecting && (
                  <div className="border-t p-4 sm:px-5">
                    <label className="mb-1.5 block text-xs font-medium">
                      Why are you rejecting this?
                    </label>
                    <textarea
                      value={rejectFeedback}
                      onChange={e => setRejectFeedback(e.target.value)}
                      placeholder="e.g. Tone is too casual, needs more industry-specific language..."
                      rows={2}
                      className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-100"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => rejectItem(item.id)}
                        disabled={isActioning}
                        className="inline-flex items-center gap-1 rounded-lg bg-red-500 px-3 py-2 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-60"
                      >
                        {isActioning
                          ? <Loader2 className="size-3 animate-spin" />
                          : <X className="size-3" />}
                        Confirm rejection
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingId(null); setRejectFeedback('');
                        }}
                        className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Actions ──────────────────────────────── */}
                {!isRejecting && (
                  <div className="flex items-center gap-2 border-t px-4 py-3 sm:px-5">
                    {/* Approve — primary action, larger touch target */}
                    <button
                      type="button"
                      onClick={() => approveItem(item.id)}
                      disabled={isActioning}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {isActioning
                        ? <Loader2 className="size-3 animate-spin" />
                        : <Check className="size-3" />}
                      Approve
                    </button>

                    {/* Reject */}
                    <button
                      type="button"
                      onClick={() => setRejectingId(item.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    >
                      <X className="size-3" />
                      Reject
                    </button>

                    {/* Copy — pushed to right */}
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(item.caption)}
                      className="ml-auto inline-flex items-center gap-1 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors hover:bg-muted"
                      title="Copy caption"
                    >
                      <Copy className="size-3" />
                      <span className="hidden sm:inline">Copy</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
