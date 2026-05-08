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
} from 'lucide-react';
import Image from 'next/image';
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
// CONFIG — no Zap icon anywhere
// -----------------------------------------------------------
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-zinc-100 text-zinc-600' },
  pending_review: { label: 'Pending review', color: 'bg-amber-50 text-amber-700' },
  approved: { label: 'Approved', color: 'bg-blue-50 text-blue-700' },
  scheduled: { label: 'Scheduled', color: 'bg-violet-50 text-violet-700' },
  published: { label: 'Published', color: 'bg-emerald-50 text-emerald-700' },
  rejected: { label: 'Rejected', color: 'bg-red-50 text-red-700' },
};

// No icon field — Zap is gone
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
};

const TITLE_PLATFORMS = new Set(['youtube', 'pinterest']);
const PLATFORM_SPECIFIC_SYSTEM_KEYS = ['sourceImages', 'videoDurationSeconds', 'title', 'imageTemplate', 'imageStyle', 'carouselAspectRatio', 'carouselStyle', 'carouselSlideCount', 'photoTier', 'sceneModelUsed', 'promptUsed', 'isFallback', 'ugcHook', 'ugcProblem', 'ugcSolution', 'ugcCta', 'DataStoryFormats', 'Data_story_stats', 'DataStoryStatCount', 'captionOriginal', 'videoGenerated', 'unsplashCredits'];
const MEDIA_CONTENT_TYPES = ['single_image', 'carousel', 'reel', 'ugc_ad', 'data_story'];

// -----------------------------------------------------------
// HELPERS
// -----------------------------------------------------------
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
// SMALL SUB-COMPONENTS
// -----------------------------------------------------------
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
  const [videoPhotoTier, setVideoPhotoTier] = useState<'unsplash' | 'flux'>('unsplash');
  const [isGeneratingUGC, setIsGeneratingUGC] = useState(false);
  const [ugcError, setUgcError] = useState<string | null>(null);
  const [ugcPhotoTier, setUgcPhotoTier] = useState<'unsplash' | 'flux' | 'seedance'>('unsplash');
  const [isGeneratingDataStory, setIsGeneratingDataStory] = useState(false);
  const [dataStoryError, setDataStoryError] = useState<string | null>(null);
  // Image engine state
  const [imageMode, setImageMode] = useState<'template' | 'ai-scene'>('ai-scene');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageGenError, setImageGenError] = useState<string | null>(null);
  const [imageTemplate, setImageTemplate] = useState<'quote-card' | 'announcement-card' | 'stat-card'>('quote-card');
  const [imageStyle, setImageStyle] = useState<'dark' | 'light' | 'brand'>('dark');
  const [imageFormats, setImageFormats] = useState<string[]>(['square', 'vertical']);
  const [imageStatValue, setImageStatValue] = useState('');
  const [imageStatLabel, setImageStatLabel] = useState('');
  const [imageEyebrow, setImageEyebrow] = useState('');
  // AI Scene state
  const [sceneStyle, setSceneStyle] = useState<'professional' | 'minimal' | 'vibrant' | 'elegant' | 'bold' | 'cinematic'>('professional');
  const [sceneOverlay, setSceneOverlay] = useState<'standard' | 'minimal' | 'none'>('standard');
  const [scenePromptOverride, setScenePromptOverride] = useState('');
  const [sceneResult, setSceneResult] = useState<{ promptUsed?: string; modelUsed?: string; fallback?: boolean } | null>(null);
  // Carousel engine state
  const [isGeneratingCarousel, setIsGeneratingCarousel] = useState(false);
  const [carouselError, setCarouselError] = useState<string | null>(null);
  const [carouselStyle, setCarouselStyle] = useState<'dark' | 'light' | 'brand'>('dark');
  const [carouselAspectRatio, setCarouselAspectRatio] = useState<'1:1' | '9:16'>('1:1');
  // Data story stats editor
  const [statLabel, setStatLabel] = useState('');
  const [statValue, setStatValue] = useState('');
  const [statUnit, setStatUnit] = useState('');
  const [statPrefix, setStatPrefix] = useState('');
  const [copyDone, setCopyDone] = useState(false);
  const [showQualityFlags, setShowQualityFlags] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
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
        setItem((await res.json()).item);
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
        setItem((await res.json()).item); setIsEditing(false);
      }
    } finally {
      setActionLoading(null);
    }
  };

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
        setItem((await res.json()).item); setIsEditingTitle(false);
      }
    } finally {
      setActionLoading(null);
    }
  };

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
        setItem((await res.json()).item); setEditingAdaptation(null);
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
          setItem((await refreshRes.json()).item);
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
        setItem((await res.json()).item); setShowScheduler(false);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const generateVideo = async () => {
    if (!item) return;
    setIsGeneratingVideo(true);
    setVideoGenError(null);
    try {
      const res = await fetch(`/api/content/${item.id}/generate-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Re-derive here to avoid using uploadedSlideImages before its definition.
          photoTier: videoPhotoTier === 'flux'
            ? 'flux'
            : (item.graphicUrls || []).length === 0 ? 'unsplash' : 'none',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.vertical && data.square) {
        const refreshRes = await fetch(`/api/content/${item.id}`);
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          if (refreshData?.item?.id) setItem(refreshData.item);
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

  const generateUGCAd = async () => {
    if (!item) return;
    setIsGeneratingUGC(true);
    setUgcError(null);
    try {
      const res = await fetch(`/api/content/${item.id}/generate-ugc-ad`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoTier: ugcPhotoTier }),
      });
      if (!res.ok) {
        const data = await res.json();
        setUgcError(data.error || 'UGC ad generation failed. Please try again.');
        return;
      }
      const data = await res.json();
      setItem(prev => prev ? {
        ...prev,
        graphicUrls: [data.vertical].filter(Boolean),
        platformSpecific: {
          ...prev.platformSpecific,
          videoDurationSeconds: data.durationSeconds,
          photoTier: data.photoTier,
          unsplashCredits: data.credits,
        },
      } : prev);
    } catch (err) {
      console.error('[UGCAd] error:', err);
      setUgcError('Network error. Please try again.');
    } finally {
      setIsGeneratingUGC(false);
    }
  };

  const generateDataStory = async () => {
    if (!item) {
      return;
    }
    setIsGeneratingDataStory(true);
    setDataStoryError(null);
    try {
      const res = await fetch(`/api/content/${item.id}/generate-data-story`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        setDataStoryError(data.error || 'Data story generation failed. Please try again.');
        return;
      }
      const data = await res.json();
      setItem(prev => prev ? {
        ...prev,
        graphicUrls: [data.vertical, data.square, data.landscape].filter(Boolean) as string[],
        platformSpecific: { ...prev.platformSpecific, videoDurationSeconds: data.durationSeconds },
      } : prev);
    } catch (err) {
      console.error('[DataStory] error:', err);
      setDataStoryError('Network error. Please try again.');
    } finally {
      setIsGeneratingDataStory(false);
    }
  };

  const addStatToItem = async () => {
    if (!item || !statLabel || !statValue) {
      return;
    }
    const newStat = {
      label: statLabel,
      value: Number(statValue),
      ...(statUnit ? { unit: statUnit } : {}),
      ...(statPrefix ? { prefix: statPrefix } : {}),
    };
    const ps = (item.platformSpecific as Record<string, unknown>) || {};
    const existing = (ps.data_story_stats as object[]) || [];
    const updated = [...existing, newStat];
    await fetch(`/api/content/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platformSpecific: { data_story_stats: updated } }),
    });
    setItem(prev => prev ? {
      ...prev,
      platformSpecific: { ...prev.platformSpecific, data_story_stats: updated },
    } : prev);
    setStatLabel(''); setStatValue(''); setStatUnit(''); setStatPrefix('');
  };

  const removeStatFromItem = async (index: number) => {
    if (!item) {
      return;
    }
    const ps = (item.platformSpecific as Record<string, unknown>) || {};
    const existing = (ps.data_story_stats as object[]) || [];
    const updated = existing.filter((_, i) => i !== index);
    await fetch(`/api/content/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platformSpecific: { data_story_stats: updated } }),
    });
    setItem(prev => prev ? {
      ...prev,
      platformSpecific: { ...prev.platformSpecific, data_story_stats: updated },
    } : prev);
  };

  const generateImage = async () => {
    if (!item) {
      return;
    }
    setIsGeneratingImage(true);
    setImageGenError(null);
    try {
      const body: Record<string, unknown> = {
        template: imageTemplate,
        style: imageStyle,
        formats: imageFormats,
        eyebrow: imageEyebrow || undefined,
      };
      if (imageTemplate === 'stat-card') {
        if (!imageStatValue || !imageStatLabel) {
          setImageGenError('Stat value and label are required for stat card.');
          return;
        }
        body.statValue = imageStatValue;
        body.statLabel = imageStatLabel;
      }
      const res = await fetch(`/api/content/${item.id}/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const refreshRes = await fetch(`/api/content/${item.id}`);
        if (refreshRes.ok) {
          setItem((await refreshRes.json()).item);
        }
      } else {
        setImageGenError(data.error || 'Image generation failed. Please try again.');
      }
    } catch (err) {
      console.error('[Image] generate error:', err);
      setImageGenError('Network error. Please try again.');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const generateScene = async () => {
    if (!item) return;
    setIsGeneratingImage(true);
    setImageGenError(null);
    setSceneResult(null);
    try {
      const res = await fetch(`/api/content/${item.id}/generate-scene`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formats: imageFormats,
          imageStyle: sceneStyle,
          modelTier: 'pro',
          overlayStyle: sceneOverlay,
          ...(scenePromptOverride.trim() ? { scenePrompt: scenePromptOverride.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSceneResult({ promptUsed: data.promptUsed, modelUsed: data.modelUsed, fallback: data.fallback });
        const refreshRes = await fetch(`/api/content/${item.id}`);
        if (refreshRes.ok) {
          setItem((await refreshRes.json()).item);
        }
      } else {
        setImageGenError(data.error || 'Scene generation failed. Please try again.');
      }
    } catch (err) {
      console.error('[Scene] generate error:', err);
      setImageGenError('Network error. Please try again.');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const generateCarousel = async () => {
    if (!item) {
      return;
    }
    setIsGeneratingCarousel(true);
    setCarouselError(null);
    try {
      const res = await fetch(`/api/content/${item.id}/generate-carousel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style: carouselStyle, aspectRatio: carouselAspectRatio }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const refreshRes = await fetch(`/api/content/${item.id}`);
        if (refreshRes.ok) {
          setItem((await refreshRes.json()).item);
        }
      } else {
        setCarouselError(data.error || 'Carousel generation failed. Please try again.');
      }
    } catch (err) {
      console.error('[Carousel] generate error:', err);
      setCarouselError('Network error. Please try again.');
    } finally {
      setIsGeneratingCarousel(false);
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
        <Link href="/dashboard/posts" className="mt-2 block text-sm text-primary underline">
          Back to posts
        </Link>
      </div>
    );
  }

  // Derived state
  const statusConfig = STATUS_CONFIG[item.status] || { label: item.status, color: 'bg-muted' };
  const modeConfig = MODE_CONFIG[item.contentMode || 'normal'] ?? { label: 'Normal', color: 'bg-zinc-100 text-zinc-600' };
  const needsMedia = MEDIA_CONTENT_TYPES.includes(item.contentType);
  const isReel = item.contentType === 'reel';
  const isUGCAd = item.contentType === 'ugc_ad';
  const isDataStory = item.contentType === 'data_story';
  const isCarousel = item.contentType === 'carousel';
  const isSingleImage = item.contentType === 'single_image';
  const hasMedia = item.graphicUrls && item.graphicUrls.length > 0;
  const sourceImages = (item.platformSpecific?.sourceImages as string[]) || [];
  const hasGeneratedVideo = isReel && hasMedia && (
    sourceImages.length > 0
    || item.platformSpecific?.videoGenerated === true
    || (item.platformSpecific?.photoTier as string) === 'unsplash'
    || (item.platformSpecific?.photoTier as string) === 'flux'
    || item.graphicUrls.some(url => isVideoFileUrl(url))
  );
  const hasVideoExtension = isReel && hasMedia && item.graphicUrls.some(url => isVideoFileUrl(url));
  const isLikelyLegacyVideo = isReel && !hasGeneratedVideo && item.graphicUrls.length === 1 && !isVideoFileUrl(item.graphicUrls[0]!);
  const hasUploadedVideo = !hasGeneratedVideo && (hasVideoExtension || isLikelyLegacyVideo);
  const uploadedSlideImages = isReel && !hasGeneratedVideo && !hasUploadedVideo ? item.graphicUrls : [];
  const hasVideo = isReel && (hasGeneratedVideo || hasUploadedVideo);
  const hasImages = (isSingleImage || isCarousel) && hasMedia;
  // UGC Ad and Data Story store generated videos in graphicUrls — enable publish once any media exists
  const hasUGCOrDataStoryVideo = (isUGCAd || isDataStory) && hasMedia;
  const canPublish = item.status === 'approved' && (!needsMedia || hasVideo || hasImages || hasUGCOrDataStoryVideo);
  const platformsWithTitle = (item.targetPlatforms || []).filter(p => TITLE_PLATFORMS.has(p));
  const showTitleField = platformsWithTitle.length > 0;
  const currentTitle = (item.platformSpecific?.title as string) || '';

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
  const hasEnrichment = !!(enrichment.cta_url || enrichment.promo_code || enrichment.contact_info
    || enrichment.event_details || (enrichment.reference_links?.length ?? 0) > 0
    || (enrichment.custom_mentions?.length ?? 0) > 0);

  // Primary action label for mobile sticky bar
  const primaryAction = item.status === 'pending_review' || item.status === 'draft'
    ? 'approve'
    : item.status === 'approved'
      ? 'publish'
      : item.status === 'scheduled'
        ? 'publish'
        : null;

  // -----------------------------------------------------------
  // ACTIONS PANEL — rendered both in sidebar (desktop) and
  // as a sticky bottom bar on mobile
  // -----------------------------------------------------------
  // // eslint-disable-next-line react/no-unstable-nested-components
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

      {/* Reject / Delete — only in full panel, not compact mobile bar */}
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
              {isReel
                ? 'Add images and generate a video, or upload a video directly.'
                : 'Add an image before publishing.'}
            </p>
          )}
        </>
      )}
    </div>
  );

  return (
    <>
      <PageHeader
        title="Content detail"
        actions={(
          <Link
            href="/dashboard/posts"
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted sm:px-4 sm:py-2.5"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Back to posts</span>
            <span className="sm:hidden">Back</span>
          </Link>
        )}
      />

      {/* ── Mobile sticky action bar ─────────────────────────
          Shown only when there's a primary action available.
          Sits above the bottom nav on mobile.
          Hidden on lg+ where the sidebar is visible. ────── */}
      {primaryAction && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 py-3 backdrop-blur-sm lg:hidden">
          <div className="flex items-center gap-2">
            {primaryAction === 'approve' && (
              <button
                type="button"
                onClick={() => updateStatus('approved')}
                disabled={!!actionLoading}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {actionLoading === item.status
                  ? <Loader2 className="size-4 animate-spin" />
                  : <Check className="size-4" />}
                Approve
              </button>
            )}
            {(primaryAction === 'publish') && (
              <>
                <button
                  type="button"
                  onClick={publishNow}
                  disabled={!!actionLoading || !canPublish}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-foreground py-3 text-sm font-medium text-background disabled:opacity-50"
                >
                  {actionLoading === 'publish'
                    ? <Loader2 className="size-4 animate-spin" />
                    : <Send className="size-4" />}
                  Publish now
                </button>
                <button
                  type="button"
                  onClick={() => setShowScheduler(p => !p)}
                  disabled={!!actionLoading}
                  className="flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  <Calendar className="size-4" />
                </button>
              </>
            )}
            {item.status !== 'published' && item.status !== 'rejected' && (
              <button
                type="button"
                onClick={() => updateStatus('rejected')}
                disabled={!!actionLoading}
                className="flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          {/* Inline scheduler on mobile */}
          {showScheduler && (
            <div className="mt-3 space-y-2 border-t pt-3">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={scheduleDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setScheduleDate(e.target.value)}
                  className="rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={e => setScheduleTime(e.target.value)}
                  className="rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={schedulePost}
                  disabled={!scheduleDate || !scheduleTime || actionLoading === 'schedule'}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
                >
                  {actionLoading === 'schedule'
                    ? <Loader2 className="size-3 animate-spin" />
                    : <Check className="size-3" />}
                  Confirm schedule
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
        </div>
      )}

      {/* Add bottom padding on mobile so content isn't hidden behind sticky bar */}
      <div className={`grid gap-6 lg:grid-cols-3 ${primaryAction ? 'pb-24 lg:pb-0' : ''}`}>

        {/* ── Main content ─────────────────────────────────── */}
        <div className="space-y-4 lg:col-span-2">

          {/* Caption */}
          <div className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusConfig.color}`}>
                  {statusConfig.label}
                </span>
                {item.contentMode && item.contentMode !== 'normal' && (
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${modeConfig.color}`}>
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

          {/* Title field (YouTube / Pinterest only) */}
          {showTitleField && (
            <div className="rounded-xl border bg-card p-4 sm:p-5">
              <div className="mb-3 flex items-start justify-between gap-3 border-b pb-3">
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
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
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

          {/* Enrichment summary */}
          {hasEnrichment && (
            <div className="rounded-xl border bg-card p-4 sm:p-5">
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
                {enrichment.cta_url && <EnrichmentRow label="CTA" value={`${enrichment.cta_label || 'Link'} → ${enrichment.cta_url}`} />}
                {enrichment.promo_code && <EnrichmentRow label="Promo code" value={enrichment.promo_code} />}
                {enrichment.contact_info && <EnrichmentRow label="Contact" value={enrichment.contact_info} />}
                {enrichment.event_details && <EnrichmentRow label="Event" value={enrichment.event_details} />}
                {enrichment.reference_links && enrichment.reference_links.length > 0 && <EnrichmentRow label="Links" value={enrichment.reference_links.join(', ')} />}
                {enrichment.custom_mentions && enrichment.custom_mentions.length > 0 && <EnrichmentRow label="Mentions" value={enrichment.custom_mentions.join(' ')} />}
              </div>
            </div>
          )}

          {/* Reel / Video */}
          {isReel && (
            <div className="rounded-xl border bg-card p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-2 border-b pb-4">
                <Video className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Video post</h3>
              </div>

              {!hasUploadedVideo && !hasGeneratedVideo && (
                <div className="mb-5">
                  {/* Photo source selector */}
                  <div className="mb-4">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Photo source</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setVideoPhotoTier('unsplash')}
                        className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${videoPhotoTier === 'unsplash' ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}
                      >
                        <p className={`text-xs font-semibold ${videoPhotoTier === 'unsplash' ? 'text-primary' : ''}`}>Unsplash</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">Free editorial photos</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setVideoPhotoTier('flux')}
                        className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${videoPhotoTier === 'flux' ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}
                      >
                        <p className={`text-xs font-semibold ${videoPhotoTier === 'flux' ? 'text-primary' : ''}`}>AI Scene</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">FLUX Pro — brand-aligned</p>
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={generateVideo}
                    disabled={isGeneratingVideo}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                  >
                    {isGeneratingVideo
                      ? (<><Loader2 className="size-4 animate-spin" />Generating video (~30–60s)...</>)
                      : (<><Sparkles className="size-4" />Generate branded video</>)}
                  </button>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Renders 9:16 for Reels/TikTok and 1:1 for LinkedIn. Takes 30–60 seconds.
                  </p>
                  {videoGenError && <p className="mt-2 text-xs text-red-500">{videoGenError}</p>}

                  {uploadedSlideImages.length > 0 && (
                    <div className="mt-4">
                      <p className="mb-2 text-xs font-medium text-muted-foreground">Or use your uploaded images</p>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {uploadedSlideImages.slice(0, 5).map((url, i) => (
                          <div key={i} className="size-14 shrink-0 overflow-hidden rounded-md border">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="" className="size-full object-cover" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {hasGeneratedVideo && (
                <div className="mb-5">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">2</span>
                    <p className="text-xs font-medium text-muted-foreground">Generated branded video</p>
                  </div>
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
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-60"
                  >
                    {isGeneratingVideo ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                    Regenerate video
                  </button>
                  {videoGenError && <p className="mt-1 text-xs text-red-500">{videoGenError}</p>}
                  {/* Unsplash attribution — required by Unsplash API guidelines */}
                  {(() => {
                    const rawCredits = (item.platformSpecific?.unsplashCredits as Array<string | { name: string; link: string }>) || [];
                    const tier = item.platformSpecific?.photoTier as string;
                    if (tier !== 'unsplash' || rawCredits.length === 0) return null;
                    const credits = rawCredits.map(c =>
                      typeof c === 'string'
                        ? { name: c, link: `https://unsplash.com/?utm_source=nativpost&utm_medium=referral` }
                        : c,
                    );
                    return (
                      <div className="mt-3 rounded-lg border bg-muted/30 px-3 py-2.5">
                        <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Credits</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {credits.map((c, i) => (
                            <a
                              key={i}
                              href={c.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-foreground underline hover:text-primary"
                            >
                              {c.name}
                            </a>
                          ))}
                          <a
                            href="https://unsplash.com/?utm_source=nativpost&utm_medium=referral"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-muted-foreground underline hover:text-foreground"
                          >
                            via Unsplash
                          </a>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {hasUploadedVideo && (
                <div className="mb-5">
                  <p className="mb-3 text-xs font-medium text-muted-foreground">Uploaded video</p>
                  <div className="overflow-hidden rounded-lg border bg-black">
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video src={toVideoSrc(item.graphicUrls[0]!)} className="w-full" controls preload="metadata" playsInline style={{ maxHeight: 400 }} />
                  </div>
                </div>
              )}

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

          {/* Image / Carousel */}
          {/* ── UGC Ad video generation ── */}
          {isUGCAd && (
            <div className="rounded-xl border bg-card p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-2 border-b pb-4">
                <Video className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">UGC Ad video</h3>
              </div>

              {item.graphicUrls && item.graphicUrls.length > 0 && (
                <div className="mb-4">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video
                    src={toVideoSrc(item.graphicUrls[0]!)}
                    controls
                    playsInline
                    className="w-full max-w-[240px] rounded-lg"
                  />
                </div>
              )}

              {/* Visual source selector */}
              <div className="mb-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Visual source</p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { tier: 'unsplash', label: 'Unsplash', sub: 'Free editorial photos' },
                    { tier: 'flux',     label: 'AI Scene',  sub: 'FLUX Pro per section' },
                    { tier: 'seedance', label: 'AI Video',  sub: 'Live clips per section' },
                  ] as const).map(({ tier, label, sub }) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => setUgcPhotoTier(tier)}
                      className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${ugcPhotoTier === tier ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}
                    >
                      <p className={`text-xs font-semibold ${ugcPhotoTier === tier ? 'text-primary' : ''}`}>{label}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
                    </button>
                  ))}
                </div>
                {ugcPhotoTier === 'seedance' && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Generates a 5s video clip per section using Seedance 2.0. Requires fal.ai credits (~$0.40/ad). Falls back to Unsplash if unavailable.
                  </p>
                )}
                {ugcPhotoTier === 'flux' && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Generates an AI photo scene per section using FLUX Pro. Requires fal.ai credits (~$0.20/ad). Falls back to Unsplash if unavailable.
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={generateUGCAd}
                disabled={isGeneratingUGC}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {isGeneratingUGC
                  ? (<><Loader2 className="size-4 animate-spin" />Generating UGC Ad...</>)
                  : (<><Sparkles className="size-4" />Generate UGC Ad</>)}
              </button>
              {ugcError && <p className="mt-2 text-xs text-red-500">{ugcError}</p>}
              {(() => {
                const rawCredits = (item.platformSpecific?.unsplashCredits as Array<string | { name: string; link: string }>) || [];
                const tier = item.platformSpecific?.photoTier as string;
                const usedSeedance = tier === 'seedance';
                if (usedSeedance) {
                  return (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Generated with Seedance 2.0 video clips per section.
                    </p>
                  );
                }
                if (tier !== 'unsplash' || rawCredits.length === 0) return null;
                const credits = rawCredits.map(c =>
                  typeof c === 'string'
                    ? { name: c, link: `https://unsplash.com/?utm_source=nativpost&utm_medium=referral` }
                    : c,
                );
                return (
                  <div className="mt-3 rounded-lg border bg-muted/30 px-3 py-2.5">
                    <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Credits</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {credits.map((c, i) => (
                        <a
                          key={i}
                          href={c.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-foreground underline hover:text-primary"
                        >
                          {c.name}
                        </a>
                      ))}
                      <a
                        href="https://unsplash.com/?utm_source=nativpost&utm_medium=referral"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-muted-foreground underline hover:text-foreground"
                      >
                        via Unsplash
                      </a>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── Data Story video generation ── */}
          {isDataStory && (
            <div className="rounded-xl border bg-card p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-2 border-b pb-4">
                <Video className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Data Story video</h3>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                Add stats below, then generate an animated video where each number counts up to its value.
              </p>

              {/* Stats list */}
              {((item.platformSpecific as Record<string, unknown>)?.data_story_stats as Array<{ label: string; value: number; unit?: string; prefix?: string }> | undefined)?.map((stat, i) => (
                <div key={i} className="mb-2 flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                  <span className="font-medium">
                    {stat.prefix || ''}
                    {stat.value.toLocaleString()}
                    {stat.unit || ''}
                  </span>
                  <span className="ml-2 flex-1 text-muted-foreground">{stat.label}</span>
                  <button type="button" onClick={() => removeStatFromItem(i)} className="ml-2 text-xs opacity-40 hover:opacity-100">×</button>
                </div>
              ))}

              {/* Add stat form */}
              <div className="mt-3 space-y-2 rounded-lg border p-3">
                <p className="text-xs font-medium text-muted-foreground">Add a stat</p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={statLabel}
                    onChange={e => setStatLabel(e.target.value)}
                    placeholder="Label (e.g. Happy customers)"
                    className="col-span-2 rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  />
                  <input
                    type="text"
                    value={statPrefix}
                    onChange={e => setStatPrefix(e.target.value)}
                    placeholder='Prefix (e.g. "$")'
                    className="rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  />
                  <input
                    type="number"
                    value={statValue}
                    onChange={e => setStatValue(e.target.value)}
                    placeholder="Value (e.g. 10000)"
                    className="rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  />
                  <input
                    type="text"
                    value={statUnit}
                    onChange={e => setStatUnit(e.target.value)}
                    placeholder='Unit (e.g. "%" or "K")'
                    className="rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={addStatToItem}
                    disabled={!statLabel || !statValue}
                    className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                  >
                    Add stat
                  </button>
                </div>
              </div>

              {item.graphicUrls && item.graphicUrls.length > 0 && (
                <div className="mt-4 flex gap-2 overflow-x-auto">
                  {item.graphicUrls.filter(isVideoFileUrl).map((url, i) => {
                    return (
                      /* eslint-disable-next-line jsx-a11y/media-has-caption */
                      <video key={i} src={toVideoSrc(url)} controls playsInline className="h-32 rounded-lg" />
                    );
                  })}
                </div>
              )}

              <button
                type="button"
                onClick={generateDataStory}
                disabled={isGeneratingDataStory || !((item.platformSpecific as Record<string, unknown>)?.data_story_stats as unknown[] | undefined)?.length}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {isGeneratingDataStory
                  ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        {' '}
                        Generating Data Story...
                      </>
                    )
                  : (
                      <>
                        <Sparkles className="size-4" />
                        {' '}
                        Generate Data Story
                      </>
                    )}
              </button>
              {dataStoryError && <p className="mt-2 text-xs text-red-500">{dataStoryError}</p>}
            </div>
          )}

          {/* ── Single Image generation ── */}
          {isSingleImage && (
            <div className="rounded-xl border bg-card p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-2 border-b pb-4">
                <ImageIcon className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Post image</h3>
                {needsMedia && !hasMedia && (
                  <span className="ml-auto rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                    Required to publish
                  </span>
                )}
              </div>

              {/* Generated image preview */}
              {hasMedia && (
                <div className="mb-5">
                  <p className="mb-3 text-xs font-medium text-muted-foreground">Generated images</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {item.graphicUrls.map((url, i) => (
                      <div key={i} className="overflow-hidden rounded-lg border">
                        <div className="border-b px-3 py-2">
                          <p className="text-[11px] font-medium text-muted-foreground">
                            {i === 0 ? '1:1 — Square (Instagram, LinkedIn)' : '9:16 — Vertical (Stories, Reels)'}
                          </p>
                        </div>
                        <Image src={url} alt={`Generated graphic ${i + 1}`} width={540} height={540} className="w-full object-cover" unoptimized />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Image Generator */}
              <div className="mb-5 rounded-lg border bg-muted/30 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  <p className="text-xs font-semibold">Generate image</p>
                </div>

                {/* Mode toggle */}
                <div className="mb-4 grid grid-cols-2 gap-1.5 rounded-lg bg-muted p-1">
                  {(['ai-scene', 'template'] as const).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => { setImageMode(mode); setImageGenError(null); setSceneResult(null); }}
                      className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${imageMode === mode ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {mode === 'ai-scene' ? 'AI Scene' : 'Branded Template'}
                    </button>
                  ))}
                </div>

                {imageMode === 'ai-scene' && (
                  <div>
                    {/* Visual style */}
                    <div className="mb-3">
                      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Visual style</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(['professional', 'minimal', 'vibrant', 'elegant', 'bold', 'cinematic'] as const).map(s => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setSceneStyle(s)}
                            className={`rounded-lg border px-2.5 py-2 text-[11px] font-medium capitalize transition-colors ${sceneStyle === s ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted'}`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Brand overlay */}
                    <div className="mb-3">
                      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Brand overlay</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {([['standard', 'Logo + name'], ['minimal', 'Logo only'], ['none', 'None']] as const).map(([val, label]) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setSceneOverlay(val)}
                            className={`rounded-lg border px-2.5 py-2 text-[11px] font-medium transition-colors ${sceneOverlay === val ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted'}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Formats */}
                    <div className="mb-3">
                      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Formats</p>
                      <div className="flex gap-2">
                        {(['square', 'vertical'] as const).map(f => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => setImageFormats(prev =>
                              prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f],
                            )}
                            className={`rounded-lg border px-3 py-1.5 text-[11px] font-medium capitalize transition-colors ${imageFormats.includes(f) ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted'}`}
                          >
                            {f === 'square' ? '1:1 Square' : '9:16 Vertical'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Optional prompt override */}
                    <div className="mb-4">
                      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Scene description (optional)</p>
                      <input
                        type="text"
                        value={scenePromptOverride}
                        onChange={e => setScenePromptOverride(e.target.value)}
                        placeholder="Leave blank to auto-generate from your post..."
                        className="w-full rounded-lg border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    {/* Scene result info */}
                    {sceneResult && (
                      <div className="mb-3 rounded-lg bg-muted/50 p-3">
                        {sceneResult.fallback && (
                          <p className="mb-1 text-[11px] text-amber-600 font-medium">Template fallback used. Top up fal.ai credits to enable AI scene generation.</p>
                        )}
                        {sceneResult.modelUsed && !sceneResult.fallback && (
                          <p className="mb-1 text-[11px] text-green-600 font-medium">Generated with FLUX {sceneResult.modelUsed}</p>
                        )}
                        {sceneResult.promptUsed && (
                          <p className="text-[11px] text-muted-foreground line-clamp-2">{sceneResult.promptUsed}</p>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={generateScene}
                      disabled={isGeneratingImage || imageFormats.length === 0}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {isGeneratingImage
                        ? (<><Loader2 className="size-4 animate-spin" /> Generating...</>)
                        : (<><Sparkles className="size-4" />{hasMedia ? 'Regenerate scene' : 'Generate scene'}</>)}
                    </button>
                  </div>
                )}

                {imageMode === 'template' && (
                  <div>
                    {/* Template selector */}
                    <div className="mb-3">
                      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Template</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(['quote-card', 'announcement-card', 'stat-card'] as const).map(t => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setImageTemplate(t)}
                            className={`rounded-lg border px-2.5 py-2 text-[11px] font-medium transition-colors ${imageTemplate === t ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted'}`}
                          >
                            {t === 'quote-card' ? 'Quote' : t === 'announcement-card' ? 'Announcement' : 'Stat'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Style selector */}
                    <div className="mb-3">
                      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Style</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(['dark', 'light', 'brand'] as const).map(s => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setImageStyle(s)}
                            className={`rounded-lg border px-2.5 py-2 text-[11px] font-medium capitalize transition-colors ${imageStyle === s ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted'}`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Formats */}
                    <div className="mb-3">
                      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Formats</p>
                      <div className="flex gap-2">
                        {(['square', 'vertical'] as const).map(f => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => setImageFormats(prev =>
                              prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f],
                            )}
                            className={`rounded-lg border px-3 py-1.5 text-[11px] font-medium capitalize transition-colors ${imageFormats.includes(f) ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted'}`}
                          >
                            {f === 'square' ? '1:1 Square' : '9:16 Vertical'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Stat card fields */}
                    {imageTemplate === 'stat-card' && (
                      <div className="mb-3 space-y-2">
                        <input
                          type="text"
                          value={imageStatValue}
                          onChange={e => setImageStatValue(e.target.value)}
                          placeholder="Stat value, e.g. 47%"
                          className="w-full rounded-lg border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <input
                          type="text"
                          value={imageStatLabel}
                          onChange={e => setImageStatLabel(e.target.value)}
                          placeholder="Stat label, e.g. improvement in engagement"
                          className="w-full rounded-lg border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    )}

                    {/* Optional eyebrow */}
                    <div className="mb-4">
                      <input
                        type="text"
                        value={imageEyebrow}
                        onChange={e => setImageEyebrow(e.target.value)}
                        placeholder="Eyebrow label (optional) e.g. THIS WEEK"
                        className="w-full rounded-lg border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={generateImage}
                      disabled={isGeneratingImage || imageFormats.length === 0}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {isGeneratingImage
                        ? (<><Loader2 className="size-4 animate-spin" /> Generating...</>)
                        : (<><Sparkles className="size-4" />{hasMedia ? 'Regenerate image' : 'Generate image'}</>)}
                    </button>
                  </div>
                )}

                {imageGenError && <p className="mt-2 text-xs text-red-500">{imageGenError}</p>}
              </div>

              {/* Manual upload fallback */}
              <div>
                <p className="mb-3 text-xs font-medium text-muted-foreground">Upload your own</p>
                <MediaUploader
                  contentItemId={item.id}
                  existingUrls={item.graphicUrls || []}
                  onUpdate={urls => setItem(prev => prev ? { ...prev, graphicUrls: urls } : prev)}
                  mediaType="image"
                  maxFiles={1}
                />
              </div>
            </div>
          )}

          {/* ── Carousel generation ── */}
          {isCarousel && (
            <div className="rounded-xl border bg-card p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-2 border-b pb-4">
                <Layers className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Carousel slides</h3>
                {needsMedia && !hasMedia && (
                  <span className="ml-auto rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                    Required to publish
                  </span>
                )}
              </div>

              {/* Generated slides preview */}
              {hasMedia && (
                <div className="mb-5">
                  <p className="mb-3 text-xs font-medium text-muted-foreground">
                    {item.graphicUrls.length}
                    {' '}
                    slide
                    {item.graphicUrls.length !== 1 ? 's' : ''}
                    {' '}
                    generated
                  </p>
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {item.graphicUrls.map((url, i) => (
                      <div key={i} className="shrink-0 overflow-hidden rounded-lg border" style={{ width: 120 }}>
                        <div className="border-b px-2 py-1">
                          <p className="text-[10px] text-muted-foreground">
                            Slide
                            {i + 1}
                          </p>
                        </div>
                        <Image src={url} alt={`Carousel slide ${i + 1}`} width={120} height={120} className="w-full object-cover" unoptimized />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Carousel generator */}
              <div className="mb-5 rounded-lg border bg-muted/30 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  <p className="text-xs font-semibold">Generate carousel from caption</p>
                </div>
                <p className="mb-4 text-[11px] text-muted-foreground">
                  Each paragraph in your caption becomes a slide. The first becomes the cover, the last gets a CTA slide appended automatically.
                </p>

                {/* Style */}
                <div className="mb-3">
                  <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Style</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['dark', 'light', 'brand'] as const).map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setCarouselStyle(s)}
                        className={`rounded-lg border px-2.5 py-2 text-[11px] font-medium capitalize transition-colors ${carouselStyle === s ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted'}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Aspect ratio */}
                <div className="mb-4">
                  <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Format</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['1:1', '9:16'] as const).map(ar => (
                      <button
                        key={ar}
                        type="button"
                        onClick={() => setCarouselAspectRatio(ar)}
                        className={`rounded-lg border px-3 py-2 text-[11px] font-medium transition-colors ${carouselAspectRatio === ar ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted'}`}
                      >
                        {ar === '1:1' ? '1:1 — LinkedIn, Facebook' : '9:16 — Instagram, TikTok'}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={generateCarousel}
                  disabled={isGeneratingCarousel}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {isGeneratingCarousel
                    ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Generating slides (~5–10s)...
                        </>
                      )
                    : (
                        <>
                          <Sparkles className="size-4" />
                          {hasMedia ? 'Regenerate carousel' : 'Generate carousel'}
                        </>
                      )}
                </button>
                {carouselError && <p className="mt-2 text-xs text-red-500">{carouselError}</p>}
              </div>

              {/* Manual upload fallback */}
              <div>
                <p className="mb-3 text-xs font-medium text-muted-foreground">Or upload slides manually</p>
                <MediaUploader
                  contentItemId={item.id}
                  existingUrls={item.graphicUrls || []}
                  onUpdate={urls => setItem(prev => prev ? { ...prev, graphicUrls: urls } : prev)}
                  mediaType="image"
                />
              </div>
            </div>
          )}

          {/* Platform adaptations */}
          {Object.keys(item.platformSpecific || {}).length > 0
          && Object.entries(item.platformSpecific).some(([k]) => !PLATFORM_SPECIFIC_SYSTEM_KEYS.includes(k))
          && (
            <div className="rounded-xl border bg-card p-4 sm:p-5">
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
                                setEditingAdaptation(platform); setEditAdaptationText(String(text));
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
                                {actionLoading === loadingKey ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                                Save
                              </button>
                              <button type="button" onClick={() => setEditingAdaptation(null)} className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted">
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
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 sm:p-5">
              <h3 className="mb-1 text-sm font-semibold text-red-700">Rejection feedback</h3>
              <p className="text-sm text-red-600">{item.rejectionFeedback}</p>
            </div>
          )}
        </div>

        {/* ── Sidebar — hidden on mobile, visible lg+ ────────── */}
        <div className="hidden lg:block">
          <div className="sticky top-6 space-y-4" style={{ maxHeight: 'calc(100vh - 6rem)' }}>

          {/* Actions */}
          <ActionsPanel />

          {/* Quality Score */}
          {item.antiSlopScore !== null && (
            <div className="rounded-xl border bg-card p-5">
              <h3 className="mb-3 border-b pb-3 text-sm font-semibold">Content quality</h3>
              <div className="mb-3 flex items-center gap-3">
                <div className="relative size-12">
                  <svg className="size-12 -rotate-90" viewBox="0 0 36 36">
                    <path d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/30" />
                    <path
                      d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeDasharray={`${item.antiSlopScore * 100}, 100`}
                      className={item.antiSlopScore >= 0.8 ? 'text-emerald-500' : item.antiSlopScore >= 0.7 ? 'text-yellow-500' : item.antiSlopScore >= 0.5 ? 'text-orange-500' : 'text-red-500'}
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
                  <p className="text-[11px] text-muted-foreground">Quality score</p>
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
                        <p key={i} className="text-[11px] leading-snug text-muted-foreground">{flag}</p>
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
              {item.contentMode && <DetailRow label="Mode" value={item.contentMode} />}
              <DetailRow label="Platforms" value={(item.targetPlatforms || []).map(p => PLATFORM_LABELS[p] || p).join(', ')} />
              {isReel && (item.platformSpecific?.videoDurationSeconds as number) > 0 && (
                <DetailRow label="Video duration" value={`${item.platformSpecific.videoDurationSeconds}s`} />
              )}
              <DetailRow label="Created" value={new Date(item.createdAt).toLocaleString()} />
              {item.scheduledFor && <DetailRow label="Scheduled" value={new Date(item.scheduledFor).toLocaleString()} />}
              {item.publishedAt && <DetailRow label="Published" value={new Date(item.publishedAt).toLocaleString()} />}
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
      </div>

      {/* ── Mobile-only: Details + Quality below main content ─── */}
      <div className={`mt-4 space-y-4 lg:hidden ${primaryAction ? 'pb-24' : ''}`}>
        {item.antiSlopScore !== null && (
          <div className="rounded-xl border bg-card p-4">
            <h3 className="mb-3 border-b pb-3 text-sm font-semibold">Content quality</h3>
            <div className="flex items-center gap-3">
              <div className="relative size-10">
                <svg className="size-10 -rotate-90" viewBox="0 0 36 36">
                  <path d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/30" />
                  <path
                    d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeDasharray={`${item.antiSlopScore * 100}, 100`}
                    className={item.antiSlopScore >= 0.8 ? 'text-emerald-500' : item.antiSlopScore >= 0.7 ? 'text-yellow-500' : 'text-orange-500'}
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">
                  {Math.round(item.antiSlopScore * 100)}
                </span>
              </div>
              <div>
                <p className={`text-sm font-semibold ${scoreLabel(item.antiSlopScore).color.split(' ')[1]}`}>
                  {scoreLabel(item.antiSlopScore).text}
                </p>
                <p className="text-[11px] text-muted-foreground">Quality score</p>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-xl border bg-card p-4">
          <h3 className="mb-3 border-b pb-3 text-sm font-semibold">Details</h3>
          <div className="space-y-2.5">
            <DetailRow label="Type" value={item.contentType.replace(/_/g, ' ')} />
            {item.contentMode && <DetailRow label="Mode" value={item.contentMode} />}
            <DetailRow label="Platforms" value={(item.targetPlatforms || []).map(p => PLATFORM_LABELS[p] || p).join(', ')} />
            <DetailRow label="Created" value={new Date(item.createdAt).toLocaleDateString()} />
            {item.scheduledFor && (
              <DetailRow label="Scheduled" value={new Date(item.scheduledFor).toLocaleString()} />
            )}
            {item.publishedAt && (
              <DetailRow label="Published" value={new Date(item.publishedAt).toLocaleString()} />
            )}
          </div>
        </div>

        {/* Reject / Delete on mobile — at the very bottom */}
        {(item.status !== 'published' || true) && (
          <div className="flex gap-2">
            {item.status !== 'published' && item.status !== 'rejected' && (
              <button
                type="button"
                onClick={() => updateStatus('rejected')}
                disabled={!!actionLoading}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                <X className="size-4" />
                Reject
              </button>
            )}
            <button
              type="button"
              onClick={deleteItem}
              disabled={!!actionLoading}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="size-4" />
              Delete
            </button>
          </div>
        )}
      </div>
    </>
  );
}
