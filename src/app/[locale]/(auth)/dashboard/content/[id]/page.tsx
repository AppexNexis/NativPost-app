'use client';

import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronRight,
  Copy,
  Edit3,
  ImageIcon,
  Layers,
  Link2,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  Video,
  X,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { MediaUploader } from '@/components/media/MediaUploader';
import { PageHeader } from '@/features/dashboard/PageHeader';

// -----------------------------------------------------------
// TYPES
// -----------------------------------------------------------
type ContentItem = {
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
};

const MODE_CONFIG: Record<string, { label: string; color: string; icon?: typeof Zap }> = {
  normal: { label: 'Normal', color: 'bg-zinc-100 text-zinc-600' },
  concise: { label: 'Concise', color: 'bg-blue-50 text-blue-700' },
  controversial: { label: 'Controversial', color: 'bg-orange-50 text-orange-700', icon: Zap },
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
};

// Platforms that use a distinct title field separate from the caption.
// Must stay in sync with TITLE_PLATFORMS in generate/route.ts and content_generator.py.
const TITLE_PLATFORMS = new Set(['youtube', 'pinterest']);

// Internal platformSpecific keys that are not platform-name captions.
const PLATFORM_SPECIFIC_SYSTEM_KEYS = ['sourceImages', 'videoDurationSeconds', 'title'];

const MEDIA_CONTENT_TYPES = ['single_image', 'carousel', 'reel'];

// Returns true only if the URL is definitively a video file.
// Bare Uploadcare CDN URLs (no extension) are NOT treated as videos —
// those are images uploaded by the user for slideshow generation.
function isVideoFileUrl(url: string): boolean {
  return /\.(?:mp4|mov|webm|avi|mkv)(?:[/?#]|$)/i.test(url);
}

function toVideoSrc(url: string): string {
  if (/\.(?:mp4|mov|webm)(?:[/?#]|$)/i.test(url)) {
    return url;
  }
  const base = url.endsWith('/') ? url : `${url}/`;
  return `${base}video.mp4`;
}

function scoreLabel(score: number): { text: string; color: string } {
  if (score >= 0.9) {
    return { text: 'Excellent', color: 'bg-emerald-50 text-emerald-700' };
  }
  if (score >= 0.8) {
    return { text: 'Great', color: 'bg-green-50 text-green-700' };
  }
  if (score >= 0.7) {
    return { text: 'Good', color: 'bg-yellow-50 text-yellow-700' };
  }
  if (score >= 0.5) {
    return { text: 'Needs work', color: 'bg-orange-50 text-orange-700' };
  }
  return { text: 'Poor', color: 'bg-red-50 text-red-700' };
}

// -----------------------------------------------------------
// PAGE
// -----------------------------------------------------------
export default function ContentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [item, setItem] = useState<ContentItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editCaption, setEditCaption] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showScheduler, setShowScheduler] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoGenError, setVideoGenError] = useState<string | null>(null);
  const [copyDone, setCopyDone] = useState(false);
  const [showQualityFlags, setShowQualityFlags] = useState(false);

  // Title editing (YouTube / Pinterest only)
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');

  // Per-platform adaptation editing
  const [editingAdaptation, setEditingAdaptation] = useState<string | null>(null);
  const [editAdaptationText, setEditAdaptationText] = useState('');

  useEffect(() => {
    async function load() {
      const { id } = await params;
      try {
        const res = await fetch(`/api/content/${id}`);
        if (res.ok) {
          const data = await res.json();
          setItem(data.item);
          setEditCaption(data.item.caption);
          setEditTitle((data.item.platformSpecific?.title as string) || '');
          if (data.item.scheduledFor) {
            const d = new Date(data.item.scheduledFor);
            setScheduleDate(d.toISOString().split('T')[0] ?? '');
            setScheduleTime(d.toISOString().split('T')[1]?.slice(0, 5) ?? '');
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

  useEffect(() => {
    const autoSchedule = searchParams.get('autoSchedule');
    if (autoSchedule && !isLoading) {
      setScheduleDate(autoSchedule);
      setScheduleTime('09:00');
      setShowScheduler(true);
    }
  }, [searchParams, isLoading]);

  const updateStatus = async (status: string) => {
    if (!item) {
      return;
    }
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
    if (!item) {
      return;
    }
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

  // Saves platformSpecific.title — server merges, won't overwrite other keys
  const saveTitle = async () => {
    if (!item) {
      return;
    }
    setActionLoading('save-title');
    try {
      const res = await fetch(`/api/content/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platformSpecific: { title: editTitle.trim() } }),
      });
      if (res.ok) {
        const data = await res.json();
        setItem(data.item);
        setIsEditingTitle(false);
      }
    } finally {
      setActionLoading(null);
    }
  };

  // Saves a single platform's adapted caption — server merges, won't overwrite other keys
  const saveAdaptation = async (platform: string) => {
    if (!item) {
      return;
    }
    setActionLoading(`adaptation-${platform}`);
    try {
      const res = await fetch(`/api/content/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platformSpecific: { [platform]: editAdaptationText } }),
      });
      if (res.ok) {
        const data = await res.json();
        setItem(data.item);
        setEditingAdaptation(null);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const copyCaption = () => {
    if (!item) {
      return;
    }
    navigator.clipboard.writeText(item.caption);
    setCopyDone(true);
    setTimeout(() => setCopyDone(false), 1500);
  };

  const publishNow = async () => {
    if (!item) {
      return;
    }
    setActionLoading('publish');
    try {
      const res = await fetch(`/api/content/${item.id}/publish`, { method: 'POST' });
      if (res.ok) {
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

  const schedulePost = async () => {
    if (!item || !scheduleDate || !scheduleTime) {
      return;
    }
    setActionLoading('schedule');
    try {
      const scheduledFor = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
      const res = await fetch(`/api/content/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'scheduled', scheduledFor }),
      });
      if (res.ok) {
        const data = await res.json();
        setItem(data.item);
        setShowScheduler(false);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const generateVideo = async () => {
    if (!item) {
      return;
    }
    setIsGeneratingVideo(true);
    setVideoGenError(null);
    try {
      const res = await fetch(`/api/content/${item.id}/generate-video`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.vertical && data.square) {
          const refreshRes = await fetch(`/api/content/${item.id}`);
          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            if (refreshData?.item?.id) {
              setItem(refreshData.item);
            }
          }
        } else {
          setVideoGenError('Video generated but URLs were invalid. Please try again.');
        }
      } else {
        setVideoGenError(data.error || 'Video generation failed. Please try again.');
      }
    } catch (err) {
      console.error('[Video] generateVideo error:', err);
      setVideoGenError('Network error. Please try again.');
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  const deleteItem = async () => {
    if (!item) {
      return;
    }
    // eslint-disable-next-line no-alert
    if (!window.confirm('Delete this content? This cannot be undone.')) {
      return;
    }
    setActionLoading('delete');
    try {
      await fetch(`/api/content/${item.id}`, { method: 'DELETE' });
      router.push('/dashboard/posts');
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
        <Link href="/dashboard/posts" className="mt-2 text-sm text-primary underline">
          Back to posts
        </Link>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[item.status] || { label: item.status, color: 'bg-muted' };
  const modeConfig = MODE_CONFIG[item.contentMode || 'normal'] ?? { label: 'Normal', color: 'bg-zinc-100 text-zinc-600' };
  const needsMedia = MEDIA_CONTENT_TYPES.includes(item.contentType);
  const isReel = item.contentType === 'reel';
  const isCarousel = item.contentType === 'carousel';
  const isSingleImage = item.contentType === 'single_image';
  const hasMedia = item.graphicUrls && item.graphicUrls.length > 0;

  const sourceImages = (item.platformSpecific?.sourceImages as string[]) || [];

  // hasGeneratedVideo: video was generated from source images.
  const hasGeneratedVideo = isReel && sourceImages.length > 0 && hasMedia;

  // hasUploadedVideo: user directly uploaded a video file (not images).
  const hasVideoExtension = isReel && hasMedia && item.graphicUrls.some(url => isVideoFileUrl(url));
  const isLikelyLegacyVideo = isReel && !hasGeneratedVideo && item.graphicUrls.length === 1
    && !isVideoFileUrl(item.graphicUrls[0]!);
  const hasUploadedVideo = !hasGeneratedVideo && (hasVideoExtension || isLikelyLegacyVideo);

  const uploadedSlideImages = isReel && !hasGeneratedVideo && !hasUploadedVideo
    ? item.graphicUrls
    : [];

  const hasVideo = isReel && (hasGeneratedVideo || hasUploadedVideo);
  const hasImages = (isSingleImage || isCarousel) && hasMedia;
  const canPublish = item.status === 'approved' && (!needsMedia || hasVideo || hasImages);

  // Title field — only shown when targeting YouTube or Pinterest
  const platformsWithTitle = (item.targetPlatforms || []).filter(p => TITLE_PLATFORMS.has(p));
  const showTitleField = platformsWithTitle.length > 0;
  const currentTitle = (item.platformSpecific?.title as string) || '';

  // Enrichment display
  type EnrichmentShape = {
    cta_url?: string;
    cta_label?: string;
    reference_links?: string[];
    contact_info?: string;
    promo_code?: string;
    event_details?: string;
    custom_mentions?: string[];
  };
  const enrichment = (item.enrichmentData || {}) as EnrichmentShape;
  const hasEnrichment = !!(
    enrichment.cta_url
    || enrichment.promo_code
    || enrichment.contact_info
    || enrichment.event_details
    || (enrichment.reference_links && enrichment.reference_links.length > 0)
    || (enrichment.custom_mentions && enrichment.custom_mentions.length > 0)
  );

  return (
    <>
      <PageHeader
        title="Content detail"
        actions={(
          <Link
            href="/dashboard/posts"
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            <ArrowLeft className="size-4" />
            Back
          </Link>
        )}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ── Main content ─────────────────────────────────── */}
        <div className="space-y-4 lg:col-span-2">

          {/* Caption */}
          <div className="rounded-xl border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusConfig.color}`}>
                  {statusConfig.label}
                </span>
                {item.contentMode && item.contentMode !== 'normal' && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${modeConfig.color}`}>
                    {modeConfig.icon && <Zap className="size-3" />}
                    {modeConfig.label}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!isEditing && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                  >
                    <Edit3 className="size-3" />
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={copyCaption}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                >
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
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={actionLoading === 'save'}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                  >
                    {actionLoading === 'save'
                      ? <Loader2 className="size-3 animate-spin" />
                      : <Check className="size-3" />}
                    Save changes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false); setEditCaption(item.caption);
                    }}
                    className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
                  >
                    Cancel
                  </button>
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

          {/* ── Title field (YouTube / Pinterest only) ────────── */}
          {showTitleField && (
            <div className="rounded-xl border bg-card p-5">
              <div className="mb-3 flex items-center justify-between border-b pb-3">
                <div>
                  <h3 className="text-sm font-semibold">Post title</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Headline on
                    {' '}
                    {platformsWithTitle.map(p => PLATFORM_LABELS[p] || p).join(' and ')}
                    . Max 100 characters.
                  </p>
                </div>
                {!isEditingTitle && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingTitle(true); setEditTitle(currentTitle);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                  >
                    <Edit3 className="size-3" />
                    {currentTitle ? 'Edit' : 'Add title'}
                  </button>
                )}
              </div>

              {isEditingTitle ? (
                <div>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value.slice(0, 100))}
                    maxLength={100}
                    placeholder="Write a clear, descriptive title..."
                    className="w-full rounded-lg border bg-background px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {editTitle.length}
                      /100
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={saveTitle}
                        disabled={actionLoading === 'save-title'}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                      >
                        {actionLoading === 'save-title'
                          ? <Loader2 className="size-3 animate-spin" />
                          : <Check className="size-3" />}
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingTitle(false)}
                        className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm">
                  {currentTitle || (
                    <span className="italic text-muted-foreground">
                      No title set. The first 100 characters of the caption will be used as fallback.
                    </span>
                  )}
                </p>
              )}
            </div>
          )}

          {/* ── Enrichment Summary ────────────────────────────── */}
          {hasEnrichment && (
            <div className="rounded-xl border bg-card p-5">
              <div className="mb-3 flex items-center gap-2 border-b pb-3">
                <Link2 className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Post enrichment</h3>
                {item.enrichmentApplied && item.enrichmentApplied.length > 0 && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                    {item.enrichmentApplied.length}
                    {' '}
                    applied
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {enrichment.cta_url && (
                  <EnrichmentRow label="CTA" value={`${enrichment.cta_label || 'Link'} → ${enrichment.cta_url}`} />
                )}
                {enrichment.promo_code && (
                  <EnrichmentRow label="Promo code" value={enrichment.promo_code} />
                )}
                {enrichment.contact_info && (
                  <EnrichmentRow label="Contact" value={enrichment.contact_info} />
                )}
                {enrichment.event_details && (
                  <EnrichmentRow label="Event" value={enrichment.event_details} />
                )}
                {enrichment.reference_links && enrichment.reference_links.length > 0 && (
                  <EnrichmentRow label="Links" value={enrichment.reference_links.join(', ')} />
                )}
                {enrichment.custom_mentions && enrichment.custom_mentions.length > 0 && (
                  <EnrichmentRow label="Mentions" value={enrichment.custom_mentions.join(' ')} />
                )}
              </div>
            </div>
          )}

          {/* ── Reel / Video ─────────────────────────────────── */}
          {isReel && (
            <div className="rounded-xl border bg-card p-5">
              <div className="mb-4 flex items-center gap-2 border-b pb-4">
                <Video className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Video post</h3>
              </div>

              {/* Step 1: Image uploader for slideshow generation.
                  Hidden once the user has an uploaded video file or a generated video. */}
              {!hasUploadedVideo && !hasGeneratedVideo && (
                <div className="mb-5">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">1</span>
                    <p className="text-xs font-medium text-muted-foreground">Upload 3–5 images for the slideshow</p>
                  </div>
                  <MediaUploader
                    contentItemId={item.id}
                    existingUrls={uploadedSlideImages}
                    onUpdate={urls => setItem(prev => prev ? { ...prev, graphicUrls: urls } : prev)}
                    mediaType="image"
                    maxFiles={5}
                  />
                </div>
              )}

              {/* Step 2: Generate video button — shown when images are uploaded but no video yet */}
              {!hasUploadedVideo && !hasGeneratedVideo && uploadedSlideImages.length > 0 && (
                <div className="border-t pt-5">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">2</span>
                    <p className="text-xs font-medium text-muted-foreground">Generate branded video</p>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={generateVideo}
                      disabled={isGeneratingVideo}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                    >
                      {isGeneratingVideo ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Generating video (~30–60s)...
                        </>
                      ) : (
                        <>
                          <Sparkles className="size-4" />
                          Generate branded video
                        </>
                      )}
                    </button>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Renders two versions: 9:16 for Reels/TikTok and 1:1 for LinkedIn/Facebook. Takes about 30–60 seconds.
                    </p>
                  </div>
                  {videoGenError && (
                    <p className="mt-2 text-xs text-red-500">{videoGenError}</p>
                  )}
                </div>
              )}

              {/* Generated video players */}
              {hasGeneratedVideo && (
                <div className="mb-5">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">2</span>
                    <p className="text-xs font-medium text-muted-foreground">Generated branded video</p>
                  </div>
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {item.graphicUrls[0] && (
                        <div className="overflow-hidden rounded-lg border bg-black">
                          <div className="border-b px-3 py-2">
                            <p className="text-[11px] font-medium text-muted-foreground">9:16 — Instagram Reels, TikTok</p>
                          </div>
                          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                          <video src={toVideoSrc(item.graphicUrls[0])} className="w-full" controls preload="metadata" playsInline style={{ maxHeight: 300 }} />
                        </div>
                      )}
                      {item.graphicUrls[1] && (
                        <div className="overflow-hidden rounded-lg border bg-black">
                          <div className="border-b px-3 py-2">
                            <p className="text-[11px] font-medium text-muted-foreground">1:1 — LinkedIn, Facebook</p>
                          </div>
                          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                          <video src={toVideoSrc(item.graphicUrls[1])} className="w-full" controls preload="metadata" playsInline />
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={generateVideo}
                      disabled={isGeneratingVideo}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-60"
                    >
                      {isGeneratingVideo
                        ? <Loader2 className="size-3 animate-spin" />
                        : <Sparkles className="size-3" />}
                      Regenerate video
                    </button>
                    {videoGenError && (
                      <p className="mt-1 text-xs text-red-500">{videoGenError}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Directly uploaded video player */}
              {hasUploadedVideo && (
                <div className="mb-5">
                  <p className="mb-3 text-xs font-medium text-muted-foreground">Uploaded video</p>
                  <div className="overflow-hidden rounded-lg border bg-black">
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video
                      src={toVideoSrc(item.graphicUrls[0]!)}
                      className="w-full"
                      controls
                      preload="metadata"
                      playsInline
                      style={{ maxHeight: 400 }}
                    />
                  </div>
                </div>
              )}

              {/* Upload your own video — always shown at bottom of reel section */}
              <div className={!hasUploadedVideo && !hasGeneratedVideo && uploadedSlideImages.length === 0 ? '' : 'mt-5 border-t pt-5'}>
                <p className="mb-3 text-xs font-medium text-muted-foreground">
                  {hasUploadedVideo ? 'Replace video' : 'Or upload your own video'}
                </p>
                <MediaUploader
                  contentItemId={item.id}
                  existingUrls={[]}
                  onUpdate={(urls) => {
                    if (urls.length > 0) {
                      setItem(prev => prev ? { ...prev, graphicUrls: urls } : prev);
                    }
                  }}
                  mediaType="video"
                  maxFiles={1}
                />
              </div>
            </div>
          )}

          {/* ── Image / Carousel ─────────────────────────────── */}
          {(isSingleImage || isCarousel) && (
            <div className="rounded-xl border bg-card p-5">
              <div className="mb-4 flex items-center gap-2 border-b pb-4">
                {isCarousel
                  ? <Layers className="size-4 text-muted-foreground" />
                  : <ImageIcon className="size-4 text-muted-foreground" />}
                <h3 className="text-sm font-semibold">
                  {isCarousel ? 'Carousel images' : 'Post image'}
                </h3>
                {needsMedia && !hasMedia && (
                  <span className="ml-auto rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                    Image required to publish
                  </span>
                )}
              </div>
              <MediaUploader
                contentItemId={item.id}
                existingUrls={item.graphicUrls || []}
                onUpdate={urls => setItem(prev => prev ? { ...prev, graphicUrls: urls } : prev)}
                mediaType="image"
                maxFiles={isSingleImage ? 1 : undefined}
              />
            </div>
          )}

          {/* ── Platform adaptations (editable) ──────────────── */}
          {Object.keys(item.platformSpecific || {}).length > 0
          && Object.entries(item.platformSpecific).some(
            ([k]) => !PLATFORM_SPECIFIC_SYSTEM_KEYS.includes(k),
          ) && (
            <div className="rounded-xl border bg-card p-5">
              <h3 className="mb-4 border-b pb-3 text-sm font-semibold">Platform adaptations</h3>
              <div className="space-y-3">
                {Object.entries(item.platformSpecific)
                  .filter(([k]) => !PLATFORM_SPECIFIC_SYSTEM_KEYS.includes(k))
                  .map(([platform, text]) => {
                    const isEditingThis = editingAdaptation === platform;
                    const loadingKey = `adaptation-${platform}`;
                    return (
                      <div key={platform} className="rounded-lg border bg-muted/30 p-3">
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="text-xs font-semibold capitalize">
                            {PLATFORM_LABELS[platform] || platform}
                          </span>
                          {!isEditingThis && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingAdaptation(platform);
                                setEditAdaptationText(String(text));
                              }}
                              className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium transition-colors hover:bg-muted"
                            >
                              <Edit3 className="size-3" />
                              Edit
                            </button>
                          )}
                        </div>
                        {isEditingThis ? (
                          <div>
                            <textarea
                              value={editAdaptationText}
                              onChange={e => setEditAdaptationText(e.target.value)}
                              rows={5}
                              className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm leading-relaxed focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                            <div className="mt-2 flex gap-2">
                              <button
                                type="button"
                                onClick={() => saveAdaptation(platform)}
                                disabled={actionLoading === loadingKey}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                              >
                                {actionLoading === loadingKey
                                  ? <Loader2 className="size-3 animate-spin" />
                                  : <Check className="size-3" />}
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingAdaptation(null)}
                                className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm leading-relaxed text-muted-foreground">{String(text)}</p>
                        )}
                      </div>
                    );
                  })}
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

        {/* ── Sidebar ──────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Actions */}
          <div className="space-y-2.5 rounded-xl border bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold">Actions</h3>

            {(item.status === 'pending_review' || item.status === 'draft') && (
              <button
                type="button"
                onClick={() => updateStatus('approved')}
                disabled={!!actionLoading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {actionLoading === item.status
                  ? <Loader2 className="size-4 animate-spin" />
                  : <Check className="size-4" />}
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
                  {actionLoading === 'publish'
                    ? <Loader2 className="size-4 animate-spin" />
                    : <Send className="size-4" />}
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
                    Scheduled for
                    {' '}
                    <span className="font-semibold">
                      {new Date(item.scheduledFor!).toLocaleString()}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowScheduler(p => !p)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
                >
                  <Calendar className="size-4" />
                  Reschedule
                </button>
                <button
                  type="button"
                  onClick={publishNow}
                  disabled={!!actionLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-3 py-2.5 text-sm font-medium text-background transition-colors hover:opacity-90 disabled:opacity-50"
                >
                  {actionLoading === 'publish'
                    ? <Loader2 className="size-4 animate-spin" />
                    : <Send className="size-4" />}
                  Publish now
                </button>
              </>
            )}

            {/* Scheduler inline panel */}
            {showScheduler && (
              <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-medium">Date and time</p>
                <input
                  type="date"
                  value={scheduleDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setScheduleDate(e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={e => setScheduleTime(e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={schedulePost}
                    disabled={!scheduleDate || !scheduleTime || actionLoading === 'schedule'}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                  >
                    {actionLoading === 'schedule'
                      ? <Loader2 className="size-3 animate-spin" />
                      : <Check className="size-3" />}
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowScheduler(false)}
                    className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

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
                {isReel ? 'Add images and generate a video, or upload a video directly.' : 'Add an image before publishing.'}
              </p>
            )}
          </div>

          {/* Quality Score */}
          {item.antiSlopScore !== null && (
            <div className="rounded-xl border bg-card p-5">
              <h3 className="mb-3 border-b pb-3 text-sm font-semibold">Content quality</h3>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="relative size-12">
                    <svg className="size-12 -rotate-90" viewBox="0 0 36 36">
                      <path
                        d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        className="text-muted/30"
                      />
                      <path
                        d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeDasharray={`${item.antiSlopScore * 100}, 100`}
                        className={
                          item.antiSlopScore >= 0.8 ? 'text-emerald-500'
                            : item.antiSlopScore >= 0.7 ? 'text-yellow-500'
                              : item.antiSlopScore >= 0.5 ? 'text-orange-500'
                                : 'text-red-500'
                        }
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">
                      {Math.round(item.antiSlopScore * 100)}
                    </span>
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${scoreLabel(item.antiSlopScore).color.split(' ')[1]}`}>
                      {scoreLabel(item.antiSlopScore).text}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Anti-slop score</p>
                  </div>
                </div>
              </div>

              {item.qualityFlags.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowQualityFlags(p => !p)}
                    className="mb-2 text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    {showQualityFlags ? 'Hide' : 'Show'}
                    {' '}
                    {item.qualityFlags.length}
                    {' '}
                    quality
                    {' '}
                    {item.qualityFlags.length === 1 ? 'note' : 'notes'}
                  </button>
                  {showQualityFlags && (
                    <div className="space-y-1.5">
                      {item.qualityFlags.map((flag, i) => (
                        <p key={i} className="text-[11px] leading-snug text-muted-foreground">
                          {flag}
                        </p>
                      ))}
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
              {item.contentMode && (
                <DetailRow label="Mode" value={item.contentMode} />
              )}
              <DetailRow
                label="Platforms"
                value={(item.targetPlatforms || []).map(p => PLATFORM_LABELS[p] || p).join(', ')}
              />
              {isReel && (item.platformSpecific?.videoDurationSeconds as number) > 0 && (
                <DetailRow
                  label="Video duration"
                  value={`${item.platformSpecific.videoDurationSeconds}s`}
                />
              )}
              <DetailRow label="Created" value={new Date(item.createdAt).toLocaleString()} />
              {item.scheduledFor && (
                <DetailRow label="Scheduled" value={new Date(item.scheduledFor).toLocaleString()} />
              )}
              {item.publishedAt && (
                <DetailRow label="Published" value={new Date(item.publishedAt).toLocaleString()} />
              )}
            </div>

            {item.scheduledFor && (
              <div className="mt-4 border-t pt-3">
                <Link
                  href={`/dashboard/calendar?selected=${item.scheduledFor.split('T')[0]}`}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Calendar className="size-3.5" />
                  View on calendar
                  <ChevronRight className="size-3" />
                </Link>
              </div>
            )}
          </div>

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
