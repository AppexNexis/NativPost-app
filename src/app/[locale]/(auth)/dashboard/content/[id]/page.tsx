'use client';

import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronRight,
  Copy,
  Edit3,
  ImageIcon,
  // Layers,
  Link2,
  Loader2,
  RefreshCw,
  Send,
  // Sparkles,
  Trash2,
  Video,
  Wand2,
  X,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { PageHeader } from '@/features/dashboard/PageHeader';

// -----------------------------------------------------------
// TYPES
// -----------------------------------------------------------
interface V2ContentItem {
  id: string;
  caption: string;
  hashtags: string[];
  contentType: string;
  topic: string | null;
  status: string;
  targetPlatforms: string[];
  platformSpecific: Record<string, unknown>;
  antiSlopScore: number | null;
  qualityFlags: string[];
  contentMode: string | null;
  enrichmentData: Record<string, unknown>;
  enrichmentApplied: string[];
  scheduledFor: string | null;
  publishedAt: string | null;
  rejectionFeedback: string | null;
  engagementData: Record<string, unknown>;
  graphicUrls: string[];
  createdAt: string;
  updatedAt: string;
  // v2 fields
  aspectRatio?: string | null;
  durationSeconds?: number | null;
  aiModelUsed?: string | null;
  generationParams?: Record<string, unknown> | null;
  campaignId?: string | null;
  templateId?: string | null;
  influencerId?: string | null;
  angleId?: string | null;
}

type Campaign = {
  id: string;
  name: string;
  reRollsRemaining: number;
};

type ContentTemplate = {
  id: string;
  thumbnailUrl: string;
  sourceCreator: string | null;
  contentType: string;
};

type AIInfluencer = {
  id: string;
  name: string;
  baseImageUrl: string | null;
};

type ContentAngle = {
  id: string;
  name: string;
  color: string | null;
};

// -----------------------------------------------------------
// CONFIG
// -----------------------------------------------------------
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-zinc-100 text-zinc-600' },
  pending_review: { label: 'Pending review', color: 'bg-amber-50 text-amber-700' },
  approved: { label: 'Approved', color: 'bg-blue-50 text-blue-700' },
  scheduled: { label: 'Scheduled', color: 'bg-violet-50 text-violet-700' },
  published: { label: 'Published', color: 'bg-emerald-50 text-emerald-700' },
  rejected: { label: 'Rejected', color: 'bg-red-50 text-red-700' },
  archived: { label: 'Archived', color: 'bg-gray-100 text-gray-500' },
};

const MODE_CONFIG: Record<string, { label: string; color: string }> = {
  normal: { label: 'Normal', color: 'bg-zinc-100 text-zinc-600' },
  concise: { label: 'Concise', color: 'bg-blue-50 text-blue-700' },
  controversial: { label: 'Controversial', color: 'bg-orange-50 text-orange-700' },
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  linkedin_page: 'LinkedIn Page',
  twitter: 'X / Twitter',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  threads: 'Threads',
  pinterest: 'Pinterest',
  snapchat: 'Snapchat',
  whatsapp: 'WhatsApp',
};

const MEDIA_CONTENT_TYPES = [
  'single_image', 'slideshow', 'reel', 'ugc',
  'data_story', 'wall_of_text', 'talking_head', 'green_screen', 'video_hook',
  'carousel', 'ugc_ad',
];
const VIDEO_CONTENT_TYPES = ['slideshow', 'reel', 'ugc', 'data_story', 'wall_of_text', 'talking_head', 'green_screen', 'video_hook', 'ugc_ad'];

const ASPECT_RATIO_LABELS: Record<string, string> = {
  '9:16': '9:16 — Vertical (Stories, Reels)',
  '1:1': '1:1 — Square (Feed)',
  '16:9': '16:9 — Landscape (YouTube, LinkedIn)',
  '4:3': '4:3 — Standard',
  '3:4': '3:4 — Portrait',
  '2:3': '2:3 — Tall',
  '3:2': '3:2 — Wide',
  '21:9': '21:9 — Cinematic',
};

// -----------------------------------------------------------
// HELPERS
// -----------------------------------------------------------
function isVideoFileUrl(url: string): boolean {
  return /\.(?:mp4|mov|webm|avi|mkv)(?:[/?#]|$)/i.test(url);
}

function toVideoSrc(url: string): string {
  if (/\.(?:mp4|mov|webm)(?:[/?#]|$)/i.test(url)) return url;
  const base = url.endsWith('/') ? url : `${url}/`;
  return `${base}video.mp4`;
}

function scoreLabel(score: number): { text: string; color: string; ring: string } {
  if (score >= 0.9) return { text: 'Excellent', color: 'bg-emerald-50 text-emerald-700', ring: 'text-emerald-500' };
  if (score >= 0.8) return { text: 'Great', color: 'bg-green-50 text-green-700', ring: 'text-green-500' };
  if (score >= 0.7) return { text: 'Good', color: 'bg-yellow-50 text-yellow-700', ring: 'text-yellow-500' };
  if (score >= 0.5) return { text: 'Needs work', color: 'bg-orange-50 text-orange-700', ring: 'text-orange-500' };
  return { text: 'Poor', color: 'bg-red-50 text-red-700', ring: 'text-red-500' };
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

// -----------------------------------------------------------
// PAGE
// -----------------------------------------------------------
export default function ContentIdPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [item, setItem] = useState<V2ContentItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editCaption, setEditCaption] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showScheduler, setShowScheduler] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [copyDone, setCopyDone] = useState(false);
  const [showQualityFlags, setShowQualityFlags] = useState(false);
  const [showGenerationParams, setShowGenerationParams] = useState(false);

  // v2 related state
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [template, setTemplate] = useState<ContentTemplate | null>(null);
  const [influencer, setInfluencer] = useState<AIInfluencer | null>(null);
  const [angle, setAngle] = useState<ContentAngle | null>(null);
  const [isReRolling, setIsReRolling] = useState(false);
  const [reRollError, setReRollError] = useState<string | null>(null);
  const [isRemixing, setIsRemixing] = useState(false);

  // Load content item
  useEffect(() => {
    async function load() {
      const { id } = await params;
      try {
        const res = await fetch(`/api/content/${id}`);
        if (res.ok) {
          const data = await res.json();
          const loadedItem = data.item as V2ContentItem;
          setItem(loadedItem);
          setEditCaption(loadedItem.caption);

          if (loadedItem.scheduledFor) {
            const d = new Date(loadedItem.scheduledFor);
            setScheduleDate(d.toISOString().split('T')[0] ?? '');
            setScheduleTime(d.toISOString().split('T')[1]?.slice(0, 5) ?? '');
          }

          // Load v2 related data
          if (loadedItem.campaignId) {
            fetch(`/api/campaigns/${loadedItem.campaignId}`)
              .then(r => r.ok ? r.json() : null)
              .then(d => d && setCampaign(d.item))
              .catch(() => {});
          }
          if (loadedItem.templateId) {
            fetch(`/api/templates/${loadedItem.templateId}`)
              .then(r => r.ok ? r.json() : null)
              .then(d => d && setTemplate(d.item))
              .catch(() => {});
          }
          if (loadedItem.influencerId) {
            fetch(`/api/ai-influencers/${loadedItem.influencerId}`)
              .then(r => r.ok ? r.json() : null)
              .then(d => d && setInfluencer(d.item))
              .catch(() => {});
          }
          if (loadedItem.angleId) {
            fetch(`/api/content-angles/${loadedItem.angleId}`)
              .then(r => r.ok ? r.json() : null)
              .then(d => d && setAngle(d.item))
              .catch(() => {});
          }
        }
      } catch (err) {
        console.error('Failed to load content:', err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [params]);

  // Auto-schedule from query param
  useEffect(() => {
    const autoSchedule = searchParams.get('autoSchedule');
    if (autoSchedule && !isLoading) {
      setScheduleDate(autoSchedule);
      setScheduleTime('09:00');
      setShowScheduler(true);
    }
  }, [searchParams, isLoading]);

  // Actions
  const updateStatus = async (status: string) => {
    if (!item) return;
    setActionLoading(status);
    try {
      const res = await fetch(`/api/content/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) setItem((await res.json()).item);
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
        const updated = await res.json();
        setItem(updated.item);
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
        const refreshRes = await fetch(`/api/content/${item.id}`);
        if (refreshRes.ok) setItem((await refreshRes.json()).item);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const schedulePost = async () => {
    if (!item || !scheduleDate || !scheduleTime) return;
    setActionLoading('schedule');
    try {
      const scheduledFor = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
      const res = await fetch(`/api/content/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'scheduled', scheduledFor }),
      });
      if (res.ok) {
        setItem((await res.json()).item);
        setShowScheduler(false);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const deleteItem = async () => {
    if (!item) return;
    if (!window.confirm('Delete this content? This cannot be undone.')) return;
    setActionLoading('delete');
    try {
      await fetch(`/api/content/${item.id}`, { method: 'DELETE' });
      router.push('/dashboard/posts');
    } finally {
      setActionLoading(null);
    }
  };

  const copyCaption = () => {
    if (!item) return;
    navigator.clipboard.writeText(item.caption);
    setCopyDone(true);
    setTimeout(() => setCopyDone(false), 1500);
  };

  const handleReRoll = async () => {
    if (!item || !item.campaignId || !campaign) return;
    if (campaign.reRollsRemaining <= 0) {
      setReRollError('No re-rolls remaining for this campaign.');
      return;
    }
    setIsReRolling(true);
    setReRollError(null);
    try {
      // Decrement re-rolls
      const campaignRes = await fetch(`/api/campaigns/${campaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reRollsRemaining: campaign.reRollsRemaining - 1 }),
      });
      if (campaignRes.ok) {
        const campaignData = await campaignRes.json();
        setCampaign(campaignData.item);
      }

      // Regenerate content for this item
      const res = await fetch(`/api/content/${item.id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setReRollError(data.error || 'Re-roll failed. Please try again.');
      } else {
        // Refresh item
        const refreshRes = await fetch(`/api/content/${item.id}`);
        if (refreshRes.ok) setItem((await refreshRes.json()).item);
      }
    } catch {
      setReRollError('Network error. Please try again.');
    } finally {
      setIsReRolling(false);
    }
  };

  const handleRemix = async () => {
    if (!item?.templateId) return;
    setIsRemixing(true);
    try {
      router.push(`/dashboard/content/create?templateId=${item.templateId}`);
    } finally {
      setIsRemixing(false);
    }
  };

  // Loading / not found
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
        <Link href="/dashboard/posts" className="mt-2 block text-sm text-primary underline">Back to posts</Link>
      </div>
    );
  }

  // Derived state
  const statusConfig = STATUS_CONFIG[item.status] || { label: item.status, color: 'bg-muted' };
  const modeConfig = item.contentMode ? (MODE_CONFIG[item.contentMode] || { label: item.contentMode, color: 'bg-zinc-100 text-zinc-600' }) : null;
  const needsMedia = MEDIA_CONTENT_TYPES.includes(item.contentType);
  const isCarousel = item.contentType === 'carousel';
  // const isSingleImage = item.contentType === 'single_image';
  const hasMedia = item.graphicUrls && item.graphicUrls.length > 0;
  const isVideo = hasMedia && item.graphicUrls.some(url => isVideoFileUrl(url));
  const canPublish = item.status === 'approved' && (!needsMedia || hasMedia);
  const primaryAction = item.status === 'pending_review' || item.status === 'draft' ? 'approve'
    : item.status === 'approved' ? 'publish'
    : item.status === 'scheduled' ? 'publish'
    : null;

  type EnrichmentShape = {
    cta_url?: string; cta_label?: string; reference_links?: string[];
    contact_info?: string; promo_code?: string; event_details?: string;
    custom_mentions?: string[];
  };
  const enrichment = (item.enrichmentData || {}) as EnrichmentShape;
  const hasEnrichment = !!(
    enrichment.cta_url || enrichment.promo_code || enrichment.contact_info
    || enrichment.event_details || (enrichment.reference_links?.length ?? 0) > 0
    || (enrichment.custom_mentions?.length ?? 0) > 0
  );

  // -----------------------------------------------------------
  // Sub-components
  // -----------------------------------------------------------
  function AntiSlopBadge({ score, compact = false }: { score: number; compact?: boolean }) {
    const sl = scoreLabel(score);
    if (compact) {
      return (
        <div className="flex items-center gap-2">
          <div className={`relative ${compact ? 'size-10' : 'size-12'}`}>
            <svg className={`${compact ? 'size-10' : 'size-12'} -rotate-90`} viewBox="0 0 36 36">
              <path d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/30" />
              <path d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray={`${score * 100}, 100`} className={sl.ring} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">{Math.round(score * 100)}</span>
          </div>
          <div>
            <p className={`text-sm font-semibold ${sl.color.split(' ')[1]}`}>{sl.text}</p>
            <p className="text-[11px] text-muted-foreground">Quality score</p>
          </div>
        </div>
      );
    }
    return (
      <div className="mb-3 flex items-center gap-3">
        <div className="relative size-12">
          <svg className="size-12 -rotate-90" viewBox="0 0 36 36">
            <path d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/30" />
            <path d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray={`${score * 100}, 100`} className={sl.ring} />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">{Math.round(score * 100)}</span>
        </div>
        <div>
          <p className={`text-sm font-semibold ${sl.color.split(' ')[1]}`}>{sl.text}</p>
          <p className="text-[11px] text-muted-foreground">Quality score</p>
        </div>
      </div>
    );
  }

  function DetailRow({ label, value }: { label: string; value: string }) {
    return (
      <div className="flex items-start justify-between gap-3">
        <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
        <span className="text-right text-sm font-medium capitalize">{value}</span>
      </div>
    );
  }

  function EnrichmentRow({ label, value }: { label: string; value: string }) {
    return (
      <div className="flex items-start gap-3">
        <span className="shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
        <span className="break-all text-xs text-foreground">{value}</span>
      </div>
    );
  }

  // Actions Panel
  const ActionsPanel = ({ compact = false }: { compact?: boolean }) => (
    <div className={`space-y-2.5 ${compact ? '' : 'rounded-xl border bg-card p-5'}`}>
      {!compact && <h3 className="mb-3 text-sm font-semibold">Actions</h3>}

      {(item.status === 'pending_review' || item.status === 'draft') && (
        <button
          type="button"
          onClick={() => updateStatus('approved')}
          disabled={!!actionLoading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {actionLoading === item.status ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Approve
        </button>
      )}

      {item.status === 'approved' && (
        <>
          <button
            type="button"
            onClick={publishNow}
            disabled={!!actionLoading || !canPublish}
            title={needsMedia && !hasMedia ? 'Add media before publishing' : undefined}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-3 py-2.5 text-sm font-medium text-background transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {actionLoading === 'publish' ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Publish now
          </button>
          <button
            type="button"
            onClick={() => setShowScheduler(p => !p)}
            disabled={!!actionLoading || (needsMedia && !hasMedia)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Calendar className="size-4" />
            {item.scheduledFor ? 'Reschedule' : 'Schedule'}
          </button>
        </>
      )}

      {item.status === 'scheduled' && (
        <>
          <div className="rounded-lg border bg-violet-50 px-3 py-2.5">
            <p className="text-center text-xs text-violet-700">
              Scheduled for <span className="font-semibold">{new Date(item.scheduledFor!).toLocaleString()}</span>
            </p>
          </div>
          <button type="button" onClick={() => setShowScheduler(p => !p)} className="flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted">
            <Calendar className="size-4" />
            Reschedule
          </button>
          <button
            type="button"
            onClick={publishNow}
            disabled={!!actionLoading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-3 py-2.5 text-sm font-medium text-background transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {actionLoading === 'publish' ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Publish now
          </button>
        </>
      )}

      {showScheduler && (
        <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
          <p className="text-xs font-medium">Date and time</p>
          <input type="date" value={scheduleDate} min={new Date().toISOString().split('T')[0]} onChange={e => setScheduleDate(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
          <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={schedulePost}
              disabled={!scheduleDate || !scheduleTime || actionLoading === 'schedule'}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {actionLoading === 'schedule' ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
              Confirm
            </button>
            <button type="button" onClick={() => setShowScheduler(false)} className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted">Cancel</button>
          </div>
        </div>
      )}

      {/* Re-roll button for campaign content */}
      {item.campaignId && campaign && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-amber-800">Campaign re-roll</span>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
              {campaign.reRollsRemaining} left
            </span>
          </div>
          <button
            type="button"
            onClick={handleReRoll}
            disabled={isReRolling || campaign.reRollsRemaining <= 0}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
          >
            {isReRolling ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Re-roll variant
          </button>
          {reRollError && <p className="mt-1.5 text-[11px] text-red-600">{reRollError}</p>}
        </div>
      )}

      {/* Remix button */}
      {item.templateId && (
        <button
          type="button"
          onClick={handleRemix}
          disabled={isRemixing}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2.5 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-100 disabled:opacity-50"
        >
          <Wand2 className="size-4" />
          Remix from template
        </button>
      )}

      {!compact && (
        <>
          {item.status !== 'published' && item.status !== 'rejected' && (
            <button
              type="button"
              onClick={() => updateStatus('rejected')}
              disabled={!!actionLoading}
              className="flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <X className="size-4" />
              Reject
            </button>
          )}
          <button
            type="button"
            onClick={deleteItem}
            disabled={!!actionLoading}
            className="flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-50"
          >
            <Trash2 className="size-4" />
            Delete
          </button>
          {needsMedia && !hasMedia && item.status === 'approved' && (
            <p className="text-center text-[11px] text-amber-600">
              {VIDEO_CONTENT_TYPES.includes(item.contentType) ? 'Add a video before publishing.' : 'Add an image before publishing.'}
            </p>
          )}
        </>
      )}
    </div>
  );

  // -----------------------------------------------------------
  // Render
  // -----------------------------------------------------------
  return (
    <>
      <PageHeader
        title="Content detail"
        actions={(
          <Link href="/dashboard/posts" className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted sm:px-4 sm:py-2.5">
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Back to posts</span>
            <span className="sm:hidden">Back</span>
          </Link>
        )}
      />

      {/* Mobile sticky bar */}
      {primaryAction && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 py-3 backdrop-blur-sm lg:hidden">
          <div className="flex items-center gap-2">
            {primaryAction === 'approve' && (
              <button type="button" onClick={() => updateStatus('approved')} disabled={!!actionLoading} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-medium text-primary-foreground disabled:opacity-60">
                {actionLoading === item.status ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Approve
              </button>
            )}
            {primaryAction === 'publish' && (
              <>
                <button type="button" onClick={publishNow} disabled={!!actionLoading || !canPublish} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-foreground py-3 text-sm font-medium text-background disabled:opacity-50">
                  {actionLoading === 'publish' ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  Publish now
                </button>
                <button type="button" onClick={() => setShowScheduler(p => !p)} disabled={!!actionLoading} className="flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium hover:bg-muted disabled:opacity-50">
                  <Calendar className="size-4" />
                </button>
              </>
            )}
            {item.status !== 'published' && item.status !== 'rejected' && (
              <button type="button" onClick={() => updateStatus('rejected')} disabled={!!actionLoading} className="flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium text-red-500 hover:bg-red-50 disabled:opacity-50">
                <X className="size-4" />
              </button>
            )}
          </div>
          {showScheduler && (
            <div className="mt-3 space-y-2 border-t pt-3">
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={scheduleDate} min={new Date().toISOString().split('T')[0]} onChange={e => setScheduleDate(e.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none" />
                <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={schedulePost} disabled={!scheduleDate || !scheduleTime || actionLoading === 'schedule'} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60">
                  {actionLoading === 'schedule' ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                  Confirm schedule
                </button>
                <button type="button" onClick={() => setShowScheduler(false)} className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className={`grid gap-6 lg:grid-cols-3 ${primaryAction ? 'pb-24 lg:pb-0' : ''}`}>
        {/* Main content */}
        <div className="space-y-4 lg:col-span-2">

          {/* Status badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusConfig.color}`}>{statusConfig.label}</span>
            {modeConfig && (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${modeConfig.color}`}>{modeConfig.label}</span>
            )}
            {/* v2 badges */}
            {item.aspectRatio && (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {item.aspectRatio}
              </span>
            )}
            {item.durationSeconds && item.durationSeconds > 0 && (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                <Video className="mr-1 inline size-3" />
                {formatDuration(item.durationSeconds)}
              </span>
            )}
            {item.aiModelUsed && (
              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                {item.aiModelUsed}
              </span>
            )}
            {campaign && (
              <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                Campaign: {campaign.name}
              </span>
            )}
            {template && (
              <Link href={`/dashboard/content-library?template=${template.id}`} className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700 hover:bg-purple-100">
                <Wand2 className="size-3" />
                Template
              </Link>
            )}
            {influencer && (
              <span className="inline-flex items-center gap-1 rounded-full bg-pink-50 px-2.5 py-0.5 text-xs font-medium text-pink-700">
                {influencer.baseImageUrl && (
                  <Image src={influencer.baseImageUrl} alt="" width={12} height={12} className="rounded-full" unoptimized />
                )}
                {influencer.name}
              </span>
            )}
            {angle && (
              <span className="rounded-full px-2.5 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: angle.color || '#6B7280' }}>
                {angle.name}
              </span>
            )}
          </div>

          {/* Caption */}
          <div className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusConfig.color}`}>{statusConfig.label}</span>
              </div>
              <div className="flex items-center gap-2">
                {!isEditing && (
                  <button type="button" onClick={() => setIsEditing(true)} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted">
                    <Edit3 className="size-3" />
                    Edit
                  </button>
                )}
                <button type="button" onClick={copyCaption} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted">
                  {copyDone ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                  {copyDone ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            {isEditing ? (
              <div>
                <textarea
                  value={editCaption}
                  onChange={e => setEditCaption(e.target.value)}
                  rows={8}
                  className="w-full resize-none rounded-lg border bg-background px-3.5 py-2.5 text-sm leading-relaxed focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={saveEdit} disabled={actionLoading === 'save'} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                    {actionLoading === 'save' ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                    Save changes
                  </button>
                  <button type="button" onClick={() => { setIsEditing(false); setEditCaption(item.caption); }} className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted">Cancel</button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{item.caption}</p>
            )}

            {item.hashtags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5 border-t pt-4">
                {item.hashtags.map(tag => (
                  <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{tag}</span>
                ))}
              </div>
            )}
          </div>

          {/* Enrichment */}
          {hasEnrichment && (
            <div className="rounded-xl border bg-card p-4 sm:p-5">
              <div className="mb-3 flex items-center gap-2 border-b pb-3">
                <Link2 className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Post enrichment</h3>
                {item.enrichmentApplied && item.enrichmentApplied.length > 0 && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">{item.enrichmentApplied.length} applied</span>
                )}
              </div>
              <div className="space-y-2">
                {enrichment.cta_url && <EnrichmentRow label="CTA" value={`${enrichment.cta_label || 'Link'} → ${enrichment.cta_url}`} />}
                {enrichment.promo_code && <EnrichmentRow label="Promo code" value={enrichment.promo_code} />}
                {enrichment.contact_info && <EnrichmentRow label="Contact" value={enrichment.contact_info} />}
                {enrichment.event_details && <EnrichmentRow label="Event" value={enrichment.event_details} />}
                {enrichment.reference_links && enrichment.reference_links.length > 0 && <EnrichmentRow label="Links" value={enrichment.reference_links.join(', ')} />}
                {enrichment.custom_mentions && enrichment.custom_mentions.length > 0 && <EnrichmentRow label="Mentions" value={enrichment.custom_mentions.join(' ')} />}
              </div>
            </div>
          )}

          {/* Media Preview — v2 improvements */}
          {needsMedia && (
            <div className="rounded-xl border bg-card p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-2 border-b pb-4">
                {VIDEO_CONTENT_TYPES.includes(item.contentType) ? <Video className="size-4 text-muted-foreground" /> : <ImageIcon className="size-4 text-muted-foreground" />}
                <h3 className="text-sm font-semibold">
                  {VIDEO_CONTENT_TYPES.includes(item.contentType) ? 'Video' : isCarousel ? 'Carousel' : 'Image'}
                </h3>
                {item.aspectRatio && (
                  <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {ASPECT_RATIO_LABELS[item.aspectRatio] || item.aspectRatio}
                  </span>
                )}
                {needsMedia && !hasMedia && (
                  <span className="ml-auto rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">Required to publish</span>
                )}
              </div>

              {/* Media display with 9:16 vertical card */}
              {hasMedia ? (
                <div className="space-y-4">
                  {isVideo || VIDEO_CONTENT_TYPES.includes(item.contentType) ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {item.graphicUrls.map((url, i) => {
                        const isVid = isVideoFileUrl(url);
                        const isVertical = item.aspectRatio === '9:16' || item.aspectRatio === '3:4' || item.aspectRatio === '2:3';
                        return (
                          <div key={i} className={`overflow-hidden rounded-lg border bg-black ${isVertical ? 'mx-auto max-w-[240px]' : ''}`}>
                            <div className="border-b px-3 py-2">
                              <p className="text-[11px] font-medium text-muted-foreground">
                                {item.aspectRatio ? ASPECT_RATIO_LABELS[item.aspectRatio] : isVid ? 'Video' : 'Image'} {item.graphicUrls.length > 1 ? `#${i + 1}` : ''}
                              </p>
                            </div>
                            {isVid ? (
                              <video
                                src={toVideoSrc(url)}
                                className="w-full"
                                controls
                                preload="metadata"
                                playsInline
                                style={{ maxHeight: isVertical ? 420 : 300, aspectRatio: item.aspectRatio?.replace(':', '/') || '9/16' }}
                              />
                            ) : (
                              <Image src={url} alt={`Media ${i + 1}`} width={isVertical ? 240 : 540} height={isVertical ? 420 : 300} className="w-full object-cover" unoptimized />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {item.graphicUrls.map((url, i) => (
                        <div key={i} className="overflow-hidden rounded-lg border">
                          <div className="border-b px-2 py-1"><p className="text-[10px] text-muted-foreground">{isCarousel ? `Slide ${i + 1}` : `Image ${i + 1}`}</p></div>
                          <Image src={url} alt={`Media ${i + 1}`} width={300} height={300} className="w-full object-cover" unoptimized />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/20 py-12 text-center">
                  <Video className="mb-2 size-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No media generated yet.</p>
                  <p className="text-xs text-muted-foreground/60">Generate or upload media to publish.</p>
                </div>
              )}
            </div>
          )}

          {/* Rejection feedback */}
          {item.rejectionFeedback && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 sm:p-5">
              <h3 className="mb-1 text-sm font-semibold text-red-700">Rejection feedback</h3>
              <p className="text-sm text-red-600">{item.rejectionFeedback}</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="hidden lg:block">
          <div className="sticky top-6 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 5rem)' }}>
            <ActionsPanel />

            {/* Anti-Slop Score */}
            {item.antiSlopScore !== null && item.antiSlopScore !== undefined && (
              <div className="rounded-xl border bg-card p-5">
                <h3 className="mb-3 border-b pb-3 text-sm font-semibold">Content quality</h3>
                <AntiSlopBadge score={item.antiSlopScore} />
                {item.qualityFlags.length > 0 && (
                  <div>
                    <button type="button" onClick={() => setShowQualityFlags(p => !p)} className="mb-2 text-xs text-muted-foreground underline hover:text-foreground">
                      {showQualityFlags ? 'Hide' : 'Show'} {item.qualityFlags.length} quality {item.qualityFlags.length === 1 ? 'note' : 'notes'}
                    </button>
                    {showQualityFlags && (
                      <div className="space-y-1.5">
                        {item.qualityFlags.map((flag, i) => <p key={i} className="text-[11px] leading-snug text-muted-foreground">{flag}</p>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Details */}
            <div className="rounded-xl border bg-card p-5">
              <h3 className="mb-4 border-b pb-3 text-sm font-semibold">Details</h3>
              <div className="space-y-3">
                <DetailRow label="Type" value={item.contentType.replace(/_/g, ' ')} />
                <DetailRow label="Topic" value={item.topic || 'Auto-selected'} />
                {item.contentMode && <DetailRow label="Mode" value={item.contentMode} />}
                <DetailRow label="Platforms" value={(item.targetPlatforms || []).map(p => PLATFORM_LABELS[p] || p).join(', ')} />
                {item.aspectRatio && <DetailRow label="Aspect ratio" value={item.aspectRatio} />}
                {(item.durationSeconds && item.durationSeconds > 0) && (
                  <DetailRow label="Duration" value={formatDuration(item.durationSeconds)} />
                )}
                {item.aiModelUsed && <DetailRow label="AI model" value={item.aiModelUsed} />}
                <DetailRow label="Created" value={new Date(item.createdAt).toLocaleString()} />
                {item.scheduledFor && <DetailRow label="Scheduled" value={new Date(item.scheduledFor).toLocaleString()} />}
                {item.publishedAt && <DetailRow label="Published" value={new Date(item.publishedAt).toLocaleString()} />}
              </div>
              {item.scheduledFor && (
                <div className="mt-4 border-t pt-3">
                  <Link href={`/dashboard/calendar?selected=${item.scheduledFor.split('T')[0]}`} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                    <Calendar className="size-3.5" />
                    View on calendar
                    <ChevronRight className="size-3" />
                  </Link>
                </div>
              )}
            </div>

            {/* Generation Params */}
            {item.generationParams && Object.keys(item.generationParams).length > 0 && (
              <div className="rounded-xl border bg-card p-5">
                <h3 className="mb-3 border-b pb-3 text-sm font-semibold">Generation params</h3>
                <button
                  type="button"
                  onClick={() => setShowGenerationParams(p => !p)}
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                >
                  {showGenerationParams ? 'Hide' : 'Show'} generation payload
                </button>
                {showGenerationParams && (
                  <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-muted/50 p-3 text-[10px] text-muted-foreground">
                    {JSON.stringify(item.generationParams, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {/* Engagement */}
            {item.status === 'published' && (
              <div className="rounded-xl border bg-card p-5">
                <h3 className="mb-4 border-b pb-3 text-sm font-semibold">Engagement</h3>
                {Object.keys(item.engagementData || {}).length > 0 ? (
                  <div className="space-y-3">
                    {Object.entries(item.engagementData).map(([key, val]) => (
                      <DetailRow key={key} label={key} value={String(val)} />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Engagement data will appear here once the post has been live for a few hours.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile sidebar content */}
      <div className={`mt-4 space-y-4 lg:hidden ${primaryAction ? 'pb-24' : ''}`}>
        {item.antiSlopScore !== null && item.antiSlopScore !== undefined && (
          <div className="rounded-xl border bg-card p-4">
            <h3 className="mb-3 border-b pb-3 text-sm font-semibold">Content quality</h3>
            <AntiSlopBadge score={item.antiSlopScore} compact />
          </div>
        )}

        <div className="rounded-xl border bg-card p-4">
          <h3 className="mb-3 border-b pb-3 text-sm font-semibold">Details</h3>
          <div className="space-y-2.5">
            <DetailRow label="Type" value={item.contentType.replace(/_/g, ' ')} />
            {item.contentMode && <DetailRow label="Mode" value={item.contentMode} />}
            <DetailRow label="Platforms" value={(item.targetPlatforms || []).map(p => PLATFORM_LABELS[p] || p).join(', ')} />
            {item.aspectRatio && <DetailRow label="Aspect ratio" value={item.aspectRatio} />}
            {(item.durationSeconds && item.durationSeconds > 0) && <DetailRow label="Duration" value={formatDuration(item.durationSeconds)} />}
            {item.aiModelUsed && <DetailRow label="AI model" value={item.aiModelUsed} />}
            <DetailRow label="Created" value={new Date(item.createdAt).toLocaleDateString()} />
            {item.scheduledFor && <DetailRow label="Scheduled" value={new Date(item.scheduledFor).toLocaleString()} />}
            {item.publishedAt && <DetailRow label="Published" value={new Date(item.publishedAt).toLocaleString()} />}
          </div>
        </div>

        <div className="flex gap-2">
          {item.status !== 'published' && item.status !== 'rejected' && (
            <button type="button" onClick={() => updateStatus('rejected')} disabled={!!actionLoading} className="flex flex-1 items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
              <X className="size-4" />
              Reject
            </button>
          )}
          <button type="button" onClick={deleteItem} disabled={!!actionLoading} className="flex flex-1 items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 disabled:opacity-50">
            <Trash2 className="size-4" />
            Delete
          </button>
        </div>
      </div>
    </>
  );
}
