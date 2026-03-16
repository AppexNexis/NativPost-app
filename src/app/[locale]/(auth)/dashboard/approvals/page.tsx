'use client';

import {
  Check,
  CheckCircle2,
  // ChevronDown,
  Copy,
  Loader2,
  // MessageSquare,
  // Send,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { PageHeader } from '@/features/dashboard/PageHeader';
import { EmptyState } from '@/features/dashboard/EmptyState';

interface ContentItem {
  id: string;
  caption: string;
  contentType: string;
  status: string;
  targetPlatforms: string[];
  antiSlopScore: number | null;
  qualityFlags: string[];
  hashtags: string[];
  platformSpecific: Record<string, string>;
  createdAt: string;
  variantGroupId: string | null;
  variantNumber: number;
}

const PLATFORM_EMOJI: Record<string, string> = {
  instagram: '📸', linkedin: '💼', twitter: '𝕏', facebook: '📘', tiktok: '🎵',
};

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

  useEffect(() => { fetchPending(); }, [fetchPending]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((i) => i.id)));
    }
  };

  const approveItem = async (id: string) => {
    setActionLoading(id);
    try {
      await fetch(`/api/content/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved', isSelectedVariant: true }),
      });
      setItems((prev) => prev.filter((i) => i.id !== id));
      setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
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
      setItems((prev) => prev.filter((i) => i.id !== id));
      setRejectingId(null);
      setRejectFeedback('');
    } catch (err) {
      console.error('Reject failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const bulkApprove = async () => {
    setActionLoading('bulk');
    const ids = Array.from(selected);
    for (const id of ids) {
      try {
        await fetch(`/api/content/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'approved', isSelectedVariant: true }),
        });
      } catch (err) {
        console.error(`Bulk approve failed for ${id}:`, err);
      }
    }
    setItems((prev) => prev.filter((i) => !selected.has(i.id)));
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
        actions={
          items.length > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {selected.size} of {items.length} selected
              </span>
              <button
                onClick={selectAll}
                className="rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted"
              >
                {selected.size === items.length ? 'Deselect all' : 'Select all'}
              </button>
              {selected.size > 0 && (
                <button
                  onClick={bulkApprove}
                  disabled={actionLoading === 'bulk'}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#16A34A] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
                >
                  {actionLoading === 'bulk' ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Check className="size-3" />
                  )}
                  Approve selected ({selected.size})
                </button>
              )}
            </div>
          ) : undefined
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="All caught up"
          description="No content waiting for approval. When NativPost generates new content, it'll appear here for your review."
        />
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div
              key={item.id}
              className={`rounded-xl border bg-card transition-all ${
                selected.has(item.id) ? 'border-[#16A34A] ring-1 ring-[#16A34A]/20' : ''
              }`}
            >
              {/* Header */}
              <div className="flex items-center gap-3 border-b px-5 py-3">
                <button
                  onClick={() => toggleSelect(item.id)}
                  className={`flex size-5 shrink-0 items-center justify-center rounded border transition-colors ${
                    selected.has(item.id)
                      ? 'border-[#16A34A] bg-[#16A34A]'
                      : 'border-muted-foreground/30 hover:border-muted-foreground'
                  }`}
                >
                  {selected.has(item.id) && (
                    <Check className="size-3 text-white" />
                  )}
                </button>
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Variant {item.variantNumber}
                  </span>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground">
                    {item.contentType.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="flex items-center gap-1">
                    {(item.targetPlatforms || []).map((p) => (
                      <span key={p} className="text-xs" title={p}>{PLATFORM_EMOJI[p] || p}</span>
                    ))}
                  </span>
                  {item.antiSlopScore !== null && (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      item.antiSlopScore >= 0.8 ? 'bg-green-50 text-green-700' :
                      item.antiSlopScore >= 0.7 ? 'bg-yellow-50 text-yellow-700' :
                      'bg-red-50 text-red-700'
                    }`}>
                      Quality: {Math.round(item.antiSlopScore * 100)}%
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(item.createdAt).toLocaleDateString()}
                </span>
              </div>

              {/* Caption */}
              <div className="px-5 py-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{item.caption}</p>
                {item.hashtags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {(item.hashtags as string[]).map((tag) => (
                      <span key={tag} className="text-xs text-[#16A34A]">{tag}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* Rejection feedback form */}
              {rejectingId === item.id && (
                <div className="border-t px-5 py-3">
                  <label className="mb-1 block text-xs font-medium">Why are you rejecting this?</label>
                  <textarea
                    value={rejectFeedback}
                    onChange={(e) => setRejectFeedback(e.target.value)}
                    placeholder="e.g. Tone is too casual, needs more industry-specific language..."
                    rows={2}
                    className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-100"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => rejectItem(item.id)}
                      disabled={actionLoading === item.id}
                      className="inline-flex items-center gap-1 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-60"
                    >
                      Confirm rejection
                    </button>
                    <button
                      onClick={() => { setRejectingId(null); setRejectFeedback(''); }}
                      className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Actions */}
              {rejectingId !== item.id && (
                <div className="flex items-center gap-2 border-t px-5 py-3">
                  <button
                    onClick={() => approveItem(item.id)}
                    disabled={actionLoading === item.id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#16A34A] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#15803d] disabled:opacity-60"
                  >
                    {actionLoading === item.id ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                    Approve
                  </button>
                  <button
                    onClick={() => setRejectingId(item.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                  >
                    <X className="size-3" />
                    Reject
                  </button>
                  <button
                    onClick={() => navigator.clipboard.writeText(item.caption)}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted"
                  >
                    <Copy className="size-3" />
                    Copy
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
