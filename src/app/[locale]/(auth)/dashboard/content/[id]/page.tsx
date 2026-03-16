'use client';

import {
  ArrowLeft,
  Check,
  Copy,
  Edit3,
  Loader2,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { PageHeader } from '@/features/dashboard/PageHeader';

interface ContentItem {
  id: string;
  caption: string;
  hashtags: string[];
  contentType: string;
  topic: string | null;
  status: string;
  targetPlatforms: string[];
  platformSpecific: Record<string, string>;
  antiSlopScore: number | null;
  qualityFlags: string[];
  scheduledFor: string | null;
  publishedAt: string | null;
  rejectionFeedback: string | null;
  engagementData: Record<string, unknown>;
  graphicUrls: string[];
  createdAt: string;
  updatedAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-600' },
  pending_review: { label: 'Pending review', color: 'bg-yellow-50 text-yellow-700' },
  approved: { label: 'Approved', color: 'bg-blue-50 text-blue-700' },
  scheduled: { label: 'Scheduled', color: 'bg-purple-50 text-purple-700' },
  published: { label: 'Published', color: 'bg-green-50 text-green-700' },
  rejected: { label: 'Rejected', color: 'bg-red-50 text-red-700' },
};

const PLATFORM_EMOJI: Record<string, string> = {
  instagram: '📸', linkedin: '💼', twitter: '𝕏', facebook: '📘', tiktok: '🎵',
};

export default function ContentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [item, setItem] = useState<ContentItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editCaption, setEditCaption] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { id } = await params;
      try {
        const res = await fetch(`/api/content/${id}`);
        if (res.ok) {
          const data = await res.json();
          setItem(data.item);
          setEditCaption(data.item.caption);
        }
      } catch (err) {
        console.error('Failed to load content:', err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [params]);

  const updateStatus = async (status: string) => {
    if (!item) return;
    setActionLoading(status);
    try {
      const res = await fetch(`/api/content/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const data = await res.json();
        setItem(data.item);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const saveEdit = async () => {
    if (!item) return;
    setActionLoading('save');
    try {
      const res = await fetch(`/api/content/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption: editCaption }),
      });
      if (res.ok) {
        const data = await res.json();
        setItem(data.item);
        setIsEditing(false);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const publishNow = async () => {
    if (!item) return;
    setActionLoading('publish');
    try {
      const res = await fetch(`/api/content/${item.id}/publish`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        // Refresh the item
        const refreshRes = await fetch(`/api/content/${item.id}`);
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          setItem(refreshData.item);
        }
      }
    } finally {
      setActionLoading(null);
    }
  };

  const deleteItem = async () => {
    if (!item || !confirm('Delete this content? This cannot be undone.')) return;
    setActionLoading('delete');
    try {
      await fetch(`/api/content/${item.id}`, { method: 'DELETE' });
      router.push('/dashboard/content');
    } finally {
      setActionLoading(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-muted-foreground">Content not found.</p>
        <Link href="/dashboard/content" className="mt-2 text-sm text-[#16A34A] underline">Back to calendar</Link>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[item.status] || { label: item.status, color: 'bg-muted' };

  return (
    <>
      <PageHeader
        title="Content detail"
        actions={
          <Link href="/dashboard/content" className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted">
            <ArrowLeft className="size-4" />
            Back
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Caption card */}
          <div className="rounded-xl border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusConfig.color}`}>
                {statusConfig.label}
              </span>
              <div className="flex items-center gap-2">
                {!isEditing && (
                  <button onClick={() => setIsEditing(true)} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
                    <Edit3 className="size-3" /> Edit
                  </button>
                )}
                <button onClick={() => navigator.clipboard.writeText(item.caption)} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
                  <Copy className="size-3" /> Copy
                </button>
              </div>
            </div>

            {isEditing ? (
              <div>
                <textarea
                  value={editCaption}
                  onChange={(e) => setEditCaption(e.target.value)}
                  rows={8}
                  className="w-full resize-none rounded-lg border bg-background px-3.5 py-2.5 text-sm leading-relaxed focus:border-[#16A34A] focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30"
                />
                <div className="mt-3 flex gap-2">
                  <button onClick={saveEdit} disabled={actionLoading === 'save'} className="inline-flex items-center gap-1 rounded-lg bg-[#16A34A] px-3 py-2 text-xs font-medium text-white hover:bg-[#15803d] disabled:opacity-60">
                    {actionLoading === 'save' ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />} Save changes
                  </button>
                  <button onClick={() => { setIsEditing(false); setEditCaption(item.caption); }} className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{item.caption}</p>
            )}

            {item.hashtags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1">
                {(item.hashtags as string[]).map((tag) => (
                  <span key={tag} className="text-xs text-[#16A34A]">{tag}</span>
                ))}
              </div>
            )}
          </div>

          {/* Platform adaptations */}
          {Object.keys(item.platformSpecific || {}).length > 0 && (
            <div className="rounded-xl border bg-card p-5">
              <h3 className="mb-3 text-sm font-semibold">Platform adaptations</h3>
              <div className="space-y-3">
                {Object.entries(item.platformSpecific).map(([platform, text]) => (
                  <div key={platform} className="rounded-lg bg-muted/50 p-3">
                    <div className="mb-1 flex items-center gap-1.5">
                      <span>{PLATFORM_EMOJI[platform] || ''}</span>
                      <span className="text-xs font-semibold capitalize">{platform}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rejection feedback */}
          {item.rejectionFeedback && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-5">
              <h3 className="mb-1 text-sm font-semibold text-red-700">Rejection feedback</h3>
              <p className="text-sm text-red-600">{item.rejectionFeedback}</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Actions card */}
          <div className="rounded-xl border bg-card p-5 space-y-3">
            <h3 className="text-sm font-semibold">Actions</h3>
            {(item.status === 'pending_review' || item.status === 'draft') && (
              <button onClick={() => updateStatus('approved')} disabled={!!actionLoading} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#16A34A] px-3 py-2.5 text-sm font-medium text-white hover:bg-[#15803d] disabled:opacity-60">
                <Check className="size-4" /> Approve
              </button>
            )}
            {item.status === 'approved' && (
              <button onClick={publishNow} disabled={!!actionLoading} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 py-2.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60">
                {actionLoading === 'publish' ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Publish now
              </button>
            )}
            {item.status !== 'published' && item.status !== 'rejected' && (
              <button onClick={() => updateStatus('rejected')} disabled={!!actionLoading} className="flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium hover:bg-red-50 hover:text-red-600">
                <X className="size-4" /> Reject
              </button>
            )}
            <button onClick={deleteItem} disabled={!!actionLoading} className="flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50">
              <Trash2 className="size-4" /> Delete
            </button>
          </div>

          {/* Details card */}
          <div className="rounded-xl border bg-card p-5 space-y-3">
            <h3 className="text-sm font-semibold">Details</h3>
            <DetailRow label="Type" value={item.contentType.replace('_', ' ')} />
            <DetailRow label="Topic" value={item.topic || 'Auto-selected'} />
            <DetailRow label="Platforms" value={(item.targetPlatforms || []).map((p) => PLATFORM_EMOJI[p] || p).join(' ')} />
            {item.antiSlopScore !== null && (
              <DetailRow label="Quality score" value={`${Math.round(item.antiSlopScore * 100)}%`} />
            )}
            <DetailRow label="Created" value={new Date(item.createdAt).toLocaleString()} />
            {item.publishedAt && (
              <DetailRow label="Published" value={new Date(item.publishedAt).toLocaleString()} />
            )}
          </div>

          {/* Engagement card (for published content) */}
          {item.status === 'published' && (
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <h3 className="text-sm font-semibold">Engagement</h3>
              {Object.keys(item.engagementData || {}).length > 0 ? (
                Object.entries(item.engagementData).map(([key, val]) => (
                  <DetailRow key={key} label={key} value={String(val)} />
                ))
              ) : (
                <p className="text-xs text-muted-foreground">
                  Engagement data will appear here once the post has been live for a few hours.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
