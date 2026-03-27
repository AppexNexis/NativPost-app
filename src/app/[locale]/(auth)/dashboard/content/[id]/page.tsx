'use client';

import {
  ArrowLeft,
  Calendar,
  Check,
  Copy,
  Edit3,
  ImageIcon,
  Layers,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-600' },
  pending_review: { label: 'Pending review', color: 'bg-yellow-50 text-yellow-700' },
  approved: { label: 'Approved', color: 'bg-blue-50 text-blue-700' },
  scheduled: { label: 'Scheduled', color: 'bg-purple-50 text-purple-700' },
  published: { label: 'Published', color: 'bg-green-50 text-green-700' },
  rejected: { label: 'Rejected', color: 'bg-red-50 text-red-700' },
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  twitter: 'X / Twitter',
  facebook: 'Facebook',
  tiktok: 'TikTok',
};

const MEDIA_CONTENT_TYPES = ['single_image', 'carousel', 'reel'];

// -----------------------------------------------------------
// PAGE
// -----------------------------------------------------------
export default function ContentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
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

  useEffect(() => {
    async function load() {
      const { id } = await params;
      try {
        const res = await fetch(`/api/content/${id}`);
        if (res.ok) {
          const data = await res.json();
          setItem(data.item);
          setEditCaption(data.item.caption);
          if (data.item.scheduledFor) {
            const d = new Date(data.item.scheduledFor);
            setScheduleDate(
              d.toISOString().split('T')[0] ?? '',
            );
            setScheduleTime(
              d.toISOString().split('T')[1]?.slice(0, 5) ?? '',
            );
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
      const res = await fetch(`/api/content/${item.id}/generate-video`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        // Refresh item to get new graphicUrls
        const refreshRes = await fetch(`/api/content/${item.id}`);
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          setItem(refreshData.item);
        }
      } else {
        setVideoGenError(data.error || 'Video generation failed');
      }
    } catch {
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
  const needsMedia = MEDIA_CONTENT_TYPES.includes(item.contentType);
  const isReel = item.contentType === 'reel';
  const isCarousel = item.contentType === 'carousel';
  const isSingleImage = item.contentType === 'single_image';
  const hasMedia = item.graphicUrls && item.graphicUrls.length > 0;

  // For reel: need at least one image OR a generated video
  const hasVideo = isReel && hasMedia;
  // For image/carousel: need images
  const hasImages = (isSingleImage || isCarousel) && hasMedia;
  const canPublish = item.status === 'approved' && (!needsMedia || hasVideo || hasImages);

  // Detect if graphicUrls contains generated videos (MP4 URLs)
  const hasGeneratedVideo = isReel && hasMedia
    && item.graphicUrls.some(url => url.includes('.mp4') || url.includes('video'));

  // Source images for reel (stored in platformSpecific.sourceImages after video gen)
  const sourceImages = (item.platformSpecific?.sourceImages as string[]) || [];

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
        {/* ── Main content ── */}
        <div className="space-y-4 lg:col-span-2">

          {/* Caption card */}
          <div className="rounded-xl border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusConfig.color}`}>
                {statusConfig.label}
              </span>
              <div className="flex items-center gap-2">
                {!isEditing && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                  >
                    <Edit3 className="size-3" />
                    {' '}
                    Edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(item.caption)}
                  className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  <Copy className="size-3" />
                  {' '}
                  Copy
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
                    className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                  >
                    {actionLoading === 'save' ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                    Save changes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setEditCaption(item.caption);
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
              <div className="mt-4 flex flex-wrap gap-1">
                {item.hashtags.map(tag => (
                  <span key={tag} className="text-xs text-primary">{tag}</span>
                ))}
              </div>
            )}
          </div>

          {/* ── REEL / VIDEO section ── */}
          {isReel && (
            <div className="rounded-xl border bg-card p-5">
              <div className="mb-4 flex items-center gap-2">
                <Video className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Video post</h3>
              </div>

              {/* Step 1: Upload source images */}
              <div className="mb-4">
                <p className="mb-3 text-xs font-medium text-muted-foreground">
                  Step 1 — Upload 3-5 images for the slideshow
                </p>
                <MediaUploader
                  contentItemId={item.id}
                  existingUrls={hasGeneratedVideo ? sourceImages : item.graphicUrls}
                  onUpdate={urls => setItem(prev => prev ? { ...prev, graphicUrls: urls } : prev)}
                  mediaType="image"
                  maxFiles={5}
                />
              </div>

              {/* Step 2: Generate video */}
              {(hasGeneratedVideo ? sourceImages.length : item.graphicUrls.length) > 0 && (
                <div className="border-t pt-4">
                  <p className="mb-3 text-xs font-medium text-muted-foreground">
                    Step 2 — Generate branded video
                  </p>

                  {hasGeneratedVideo ? (
                    /* Show generated videos */
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        {/* Vertical 9:16 */}
                        {item.graphicUrls[0] && (
                          <div className="rounded-lg border bg-muted/30 p-3">
                            <p className="mb-2 text-[11px] font-semibold text-muted-foreground">
                              9:16 — Instagram Reels, TikTok
                            </p>
                            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                            <video
                              src={item.graphicUrls[0]}
                              className="w-full rounded-lg"
                              controls
                              preload="metadata"
                              style={{ maxHeight: 280 }}
                            />
                          </div>
                        )}
                        {/* Square 1:1 */}
                        {item.graphicUrls[1] && (
                          <div className="rounded-lg border bg-muted/30 p-3">
                            <p className="mb-2 text-[11px] font-semibold text-muted-foreground">
                              1:1 — LinkedIn, Facebook
                            </p>
                            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                            <video
                              src={item.graphicUrls[1]}
                              className="w-full rounded-lg"
                              controls
                              preload="metadata"
                            />
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={generateVideo}
                        disabled={isGeneratingVideo}
                        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-60"
                      >
                        {isGeneratingVideo ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Sparkles className="size-3" />
                        )}
                        Regenerate video
                      </button>
                    </div>
                  ) : (
                    /* Generate button */
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
                            Generating video (~30-60s)...
                          </>
                        ) : (
                          <>
                            <Sparkles className="size-4" />
                            Generate branded video
                          </>
                        )}
                      </button>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Renders two versions: 9:16 for Reels/TikTok and 1:1 for LinkedIn/Facebook.
                        Takes about 30-60 seconds.
                      </p>
                    </div>
                  )}

                  {videoGenError && (
                    <p className="mt-2 text-xs text-red-500">{videoGenError}</p>
                  )}
                </div>
              )}

              {/* Or: upload your own video */}
              <div className="mt-4 border-t pt-4">
                <p className="mb-3 text-xs font-medium text-muted-foreground">
                  Or upload your own video
                </p>
                <MediaUploader
                  contentItemId={item.id}
                  existingUrls={
                    hasGeneratedVideo
                      ? []
                      : item.graphicUrls.filter(u => u.includes('.mp4') || u.includes('video'))
                  }
                  onUpdate={urls => setItem(prev => prev ? { ...prev, graphicUrls: urls } : prev)}
                  mediaType="video"
                  maxFiles={1}
                />
              </div>
            </div>
          )}

          {/* ── IMAGE section (single_image / carousel) ── */}
          {(isSingleImage || isCarousel) && (
            <div className="rounded-xl border bg-card p-5">
              <div className="mb-4 flex items-center gap-2">
                {isCarousel ? (
                  <Layers className="size-4 text-muted-foreground" />
                ) : (
                  <ImageIcon className="size-4 text-muted-foreground" />
                )}
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

          {/* Platform adaptations */}
          {Object.keys(item.platformSpecific || {}).length > 0
          && Object.entries(item.platformSpecific).some(
            ([k]) => !['sourceImages', 'videoDurationSeconds'].includes(k),
          ) && (
            <div className="rounded-xl border bg-card p-5">
              <h3 className="mb-3 text-sm font-semibold">Platform adaptations</h3>
              <div className="space-y-3">
                {Object.entries(item.platformSpecific)
                  .filter(([k]) => !['sourceImages', 'videoDurationSeconds'].includes(k))
                  .map(([platform, text]) => (
                    <div key={platform} className="rounded-lg bg-muted/50 p-3">
                      <div className="mb-1">
                        <span className="text-xs font-semibold capitalize">
                          {PLATFORM_LABELS[platform] || platform}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{String(text)}</p>
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

        {/* ── Sidebar ── */}
        <div className="space-y-4">
          <div className="space-y-3 rounded-xl border bg-card p-5">
            <h3 className="text-sm font-semibold">Actions</h3>

            {(item.status === 'pending_review' || item.status === 'draft') && (
              <button
                type="button"
                onClick={() => updateStatus('approved')}
                disabled={!!actionLoading}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                <Check className="size-4" />
                {' '}
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
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 py-2.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
                >
                  {actionLoading === 'publish' ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  Publish now
                </button>

                <button
                  type="button"
                  onClick={() => setShowScheduler(p => !p)}
                  disabled={!!actionLoading || (needsMedia && !hasMedia)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  <Calendar className="size-4" />
                  {item.scheduledFor
                    ? 'Reschedule'
                    : 'Schedule'}
                </button>
              </>
            )}

            {item.status === 'scheduled' && (
              <>
                <div className="rounded-lg bg-purple-50 px-3 py-2.5 text-center">
                  <p className="text-xs text-purple-700">
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
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium hover:bg-muted"
                >
                  <Calendar className="size-4" />
                  {' '}
                  Reschedule
                </button>
                <button
                  type="button"
                  onClick={publishNow}
                  disabled={!!actionLoading}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 py-2.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
                >
                  {actionLoading === 'publish' ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  Publish now
                </button>
              </>
            )}

            {showScheduler && (
              <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-medium">Pick a date and time</p>
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
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                  >
                    {actionLoading === 'schedule' ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
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
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium hover:bg-red-50 hover:text-red-600"
              >
                <X className="size-4" />
                {' '}
                Reject
              </button>
            )}

            <button
              type="button"
              onClick={deleteItem}
              disabled={!!actionLoading}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50"
            >
              <Trash2 className="size-4" />
              {' '}
              Delete
            </button>

            {needsMedia && !hasMedia && item.status === 'approved' && (
              <p className="text-center text-[11px] text-amber-600">
                {isReel ? 'Add images and generate a video before publishing.' : 'Add an image before publishing.'}
              </p>
            )}
          </div>

          {/* Details */}
          <div className="space-y-3 rounded-xl border bg-card p-5">
            <h3 className="text-sm font-semibold">Details</h3>
            <DetailRow label="Type" value={item.contentType.replace(/_/g, ' ')} />
            <DetailRow label="Topic" value={item.topic || 'Auto-selected'} />
            <DetailRow
              label="Platforms"
              value={(item.targetPlatforms || []).map(p => PLATFORM_LABELS[p] || p).join(', ')}
            />
            {item.antiSlopScore !== null && (
              <DetailRow label="Quality score" value={`${Math.round(item.antiSlopScore * 100)}%`} />
            )}
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

          {/* Engagement */}
          {item.status === 'published' && (
            <div className="space-y-3 rounded-xl border bg-card p-5">
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
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium capitalize">{value}</span>
    </div>
  );
}
