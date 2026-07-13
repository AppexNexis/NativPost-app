'use client';

import {
  AlignLeft,
  ArrowLeft,
  BarChart2,
  Check,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Copy,
  Image as ImageIcon,
  Layers,
  Link2,
  Loader2,
  Megaphone,
  RefreshCw,
  Sparkles,
  Type,
  User,
  Video,
  Wand2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { Suspense, useEffect, useRef, useState } from 'react';

import { PLATFORMS } from '@/components/icons/PlatformIcons';
import type { RemixEdits } from '@/components/content-library/RemixEditor';
import { TrendingTemplateBrowser } from '@/components/content-library/TrendingTemplateBrowser';
import type { ContentTemplate, MediaSlot } from '@/types/v2';
import { getOptimizedVideoUrl, getVideoPosterUrl, isCloudinaryVideoUrl } from '@/lib/cloudinary';
import { isMultiSlideTemplate, parseTemplateSlides } from '@/lib/content/template-slides';

// -----------------------------------------------------------
// TYPES
// -----------------------------------------------------------
type Variant = {
  id: string;
  caption: string;
  hashtags: string[];
  antiSlopScore: number | null;
  qualityFlags: string[];
  variantNumber: number;
  platformSpecific: Record<string, string>;
  enrichmentApplied?: string[];
};

type ConnectedAccount = {
  id: string;
  platform: string;
  platformUsername: string | null;
  isActive: boolean;
};

type Enrichment = {
  cta_url: string;
  cta_label: string;
  reference_links: string[];
  contact_info: string;
  promo_code: string;
  event_details: string;
  custom_mentions: string[];
};

type GenerationProgress = {
  completed: number;
  total: number;
  percent: number;
};

// -----------------------------------------------------------
// CONTENT TYPES
// -----------------------------------------------------------
type ContentTypeDef = {
  id: string;
  label: string;
  description: string;
  icon: typeof AlignLeft;
  platforms: string[];
};

const CONTENT_TYPES: ContentTypeDef[] = [
  { id: 'text_only', label: 'Text', description: 'Text-only post', icon: AlignLeft, platforms: ['facebook', 'twitter', 'linkedin', 'whatsapp'] },
  { id: 'single_image', label: 'Image', description: 'Single image with caption', icon: ImageIcon, platforms: ['instagram', 'facebook', 'twitter', 'linkedin', 'tiktok', 'snapchat', 'whatsapp'] },
  { id: 'slideshow', label: 'Slideshow', description: 'Multi-slide video montage', icon: Layers, platforms: ['instagram', 'tiktok', 'facebook', 'youtube', 'whatsapp'] },
  { id: 'reel', label: 'Video', description: 'Reel, Short, or video post', icon: Video, platforms: ['instagram', 'tiktok', 'facebook', 'twitter', 'linkedin', 'youtube', 'snapchat', 'whatsapp'] },
  { id: 'ugc', label: 'UGC', description: 'User-generated content style', icon: Megaphone, platforms: ['instagram', 'tiktok', 'whatsapp'] },
  { id: 'data_story', label: 'Data Story', description: 'Animated stats & numbers', icon: BarChart2, platforms: ['linkedin', 'instagram', 'youtube', 'whatsapp'] },
  { id: 'wall_of_text', label: 'Wall of Text', description: 'Full-screen text motion', icon: Type, platforms: ['instagram', 'tiktok', 'facebook', 'whatsapp'] },
  { id: 'talking_head', label: 'Talking Head', description: 'Speaker with text overlay', icon: User, platforms: ['instagram', 'tiktok', 'youtube', 'facebook', 'whatsapp'] },
  { id: 'green_screen', label: 'Green Screen', description: 'Subject with keyed background', icon: Clapperboard, platforms: ['instagram', 'tiktok', 'youtube', 'whatsapp'] },
];

// -----------------------------------------------------------
// REMIX → MediaSlots builder
// -----------------------------------------------------------
// Templates come in two flavors:
//   1. Single-media (reel / single_image / talking_head / etc.) —
//      Editor's `background` slot is populated from `template.mediaUrl`.
//   2. Multi-slide (slideshow / carousel / data_story) — Editor's
//      `slides[]` slot is populated from `template.thumbnailUrls`.
// Slideshow/carousel/data_story templates historically stored the composite
// thumbnail in `mediaUrl` but the actual per-slide sources in `thumbnailUrls`,
// so we deliberately DO NOT fall back to `mediaUrl` for multi-slide types —
// that's what was collapsing carousels into a single background before.
function buildRemixMediaSlots(template: ContentTemplate): {
  background?: MediaSlot;
  slides?: MediaSlot[];
} {
  const slideUrls = parseTemplateSlides(template.thumbnailUrls);
  const multiSlide = isMultiSlideTemplate(template.contentType, slideUrls);

  if (multiSlide && slideUrls.length > 0) {
    return {
      slides: slideUrls.map(url => ({ url, assetType: 'image' as const })),
    };
  }

  if (template.mediaUrl) {
    const looksLikeVideo = isCloudinaryVideoUrl(template.mediaUrl)
      || /\.(mp4|mov|webm|m3u8)(\?.*)?$/i.test(template.mediaUrl);
    return {
      background: {
        url: template.mediaUrl,
        assetType: looksLikeVideo ? 'video' : 'image',
      },
    };
  }

  return {};
}

const EMPTY_ENRICHMENT: Enrichment = {
  cta_url: '',
  cta_label: '',
  reference_links: [],
  contact_info: '',
  promo_code: '',
  event_details: '',
  custom_mentions: [],
};

const PROGRESS_MESSAGES = [
  { at: 0, message: 'Reading your Brand Profile...' },
  { at: 10, message: 'Crafting your first variant...' },
  { at: 30, message: 'Running quality checks...' },
  { at: 45, message: 'Working on variant 2...' },
  { at: 65, message: 'Refining the writing...' },
  { at: 80, message: 'Finishing variant 3...' },
  { at: 95, message: 'Almost there...' },
];

// Remix template type → UI content type (no more old-type mapping)
const REMIX_TYPE_MAP: Record<string, string> = {
  slideshow: 'slideshow',
  wall_of_text: 'wall_of_text',
  talking_head: 'talking_head',
  green_screen_meme: 'green_screen',
  video_hook_demo: 'reel',
  carousel: 'slideshow',
  ugc: 'ugc',
  custom: 'reel',
};

// -----------------------------------------------------------
// HELPERS
// -----------------------------------------------------------
function scoreLabel(score: number): { text: string; color: string } {
  if (score >= 0.9) return { text: 'Excellent', color: 'bg-emerald-50 text-emerald-700' };
  if (score >= 0.8) return { text: 'Great', color: 'bg-green-50 text-green-700' };
  if (score >= 0.7) return { text: 'Good', color: 'bg-yellow-50 text-yellow-700' };
  if (score >= 0.5) return { text: 'Needs work', color: 'bg-orange-50 text-orange-700' };
  return { text: 'Poor', color: 'bg-red-50 text-red-700' };
}

function getProgressMessage(percent: number): string {
  let msg = PROGRESS_MESSAGES[0]!.message;
  for (const entry of PROGRESS_MESSAGES) {
    if (percent >= entry.at) msg = entry.message;
  }
  return msg;
}

function getTypeDef(id: string): ContentTypeDef | undefined {
  return CONTENT_TYPES.find(t => t.id === id);
}

// -----------------------------------------------------------
// PAGE
// -----------------------------------------------------------
// ── Template preview media (robust, Cloudinary-aware) ─────────
function TemplatePreviewMedia({ template }: { template: ContentTemplate }) {
  const [hasError, setHasError] = React.useState(false);
  const mediaUrl = template.mediaUrl || template.thumbnailUrl;
  const posterUrl = getVideoPosterUrl(template.thumbnailUrl, { width: 560, height: 996 });
  const isDirectVideo = /\.(mp4|mov|webm)(\?.*)?$/i.test(mediaUrl || '');
  const isCloudVid = isCloudinaryVideoUrl(mediaUrl);

  if (hasError || !mediaUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-muted/50">
        <Video className="size-8 text-muted-foreground/30" strokeWidth={1} />
        <p className="text-[11px] text-muted-foreground">Preview unavailable</p>
      </div>
    );
  }

  if (isCloudVid || isDirectVideo) {
    return (
      <video
        src={isCloudVid ? getOptimizedVideoUrl(mediaUrl) : mediaUrl}
        poster={posterUrl || undefined}
        className="size-full object-cover"
        muted
        loop
        autoPlay
        playsInline
        preload="metadata"
        onError={() => setHasError(true)}
      />
    );
  }

  return (
    <img
      src={posterUrl || mediaUrl}
      alt={template.sourceCreator || 'Template'}
      className="size-full object-cover"
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
}
export default function ContentCreatePage() { return <Suspense fallback={<div className="flex items-center justify-center py-20 text-sm text-muted-foreground">Loading...</div>}><ContentCreatePageInner /></Suspense>; } function ContentCreatePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scheduledDate = searchParams.get('scheduledDate') || '';
  const templateId = searchParams.get('templateId') || '';
  const editId = searchParams.get('edit') || '';
  const isRemix = !!templateId;

  const prefillTopic = searchParams.get('topic') || '';
  const prefillContentType = searchParams.get('contentType') || '';
  const fromMonthlyPlan = !!(prefillTopic && prefillContentType);

  const [step, setStep] = useState<'type' | 'browse' | 'configure' | 'review'>(
    fromMonthlyPlan || isRemix ? 'configure' : 'type',
  );
  // Set when the user picked a template from the in-flow browse step (as
  // opposed to a deep link from the Content Library). Lets the Back button
  // return to 'browse' instead of shooting off to /content-library.
  const pickedFromBrowseRef = useRef(false);
  const [remixEdits] = useState<RemixEdits | null>(null);
  const [contentType, setContentType] = useState(prefillContentType);
  const [topic, setTopic] = useState(prefillTopic);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress>({ completed: 0, total: 3, percent: 0 });
  const [displayPercent, setDisplayPercent] = useState(0);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [showPlatforms, setShowPlatforms] = useState(true);
  const [showStructure, setShowStructure] = useState(false);
  const [showEnrichment, setShowEnrichment] = useState(false);
  const [enrichment, setEnrichment] = useState<Enrichment>(EMPTY_ENRICHMENT);
  const [refLinkInput, setRefLinkInput] = useState('');
  const [mentionInput, setMentionInput] = useState('');

  // Template state
  const [template, setTemplate] = useState<ContentTemplate | null>(null);
  const [remixLoading, setRemixLoading] = useState(false);

  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);

  // Load connected accounts
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/social-accounts');
        if (res.ok) {
          const data = await res.json();
          setConnectedAccounts(data.accounts || []);
        }
      } catch (err) {
        console.error('Failed to load accounts:', err);
      }
    }
    load();
  }, []);

  // Load template if templateId is present
  useEffect(() => {
    if (!templateId || editId) return;
    async function loadTemplate() {
      try {
        const res = await fetch(`/api/templates/${templateId}`);
        if (res.ok) {
          const data = await res.json();
          const t = data.item as ContentTemplate;
          setTemplate(t);

          // Derive topic from structure
          const structure = t.structure || {};
          const derivedTopic = [structure.hook?.text, structure.body?.text, structure.cta?.text]
            .filter(Boolean)
            .join(' — ') || t.sourceCreator || '';
          setTopic(derivedTopic);

          // Map template content type to UI content type
          const mappedType = REMIX_TYPE_MAP[t.contentType] || 'reel';
          setContentType(mappedType);

          // Default platform from source
          const defaultPlatform = t.sourcePlatform === 'tiktok' ? 'tiktok' : 'instagram';
          setSelectedPlatforms([defaultPlatform]);

          // Pre-fill enrichment
          if (structure.cta?.text) {
            setEnrichment(prev => ({ ...prev, cta_label: structure.cta!.text }));
          }
          if (t.sourceUrl) {
            setEnrichment(prev => ({ ...prev, reference_links: [t.sourceUrl] }));
          }
        }
      } catch (err) {
        console.error('Failed to load template:', err);
      }
    }
    loadTemplate();
  }, [templateId, editId]);

  // Cleanup
  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    };
  }, []);

  // Smooth progress
  useEffect(() => {
    if (displayPercent < progress.percent) {
      progressTimerRef.current = setTimeout(() => {
        setDisplayPercent(prev => Math.min(prev + 1, progress.percent));
      }, 18);
    }
  }, [displayPercent, progress.percent]);

  const connectedPlatformIds = connectedAccounts.filter(a => a.isActive).map(a => a.platform);

  const togglePlatform = (id: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id],
    );
  };

  const hasEnrichment = () => !!(
    enrichment.cta_url || enrichment.contact_info || enrichment.promo_code
    || enrichment.event_details || enrichment.reference_links.length > 0
    || enrichment.custom_mentions.length > 0
  );

  const addRefLink = () => {
    const url = refLinkInput.trim();
    if (url && !enrichment.reference_links.includes(url)) {
      setEnrichment(prev => ({ ...prev, reference_links: [...prev.reference_links, url] }));
      setRefLinkInput('');
    }
  };

  const removeRefLink = (url: string) => {
    setEnrichment(prev => ({ ...prev, reference_links: prev.reference_links.filter(l => l !== url) }));
  };

  const addMention = () => {
    let handle = mentionInput.trim();
    if (handle && !handle.startsWith('@')) handle = `@${handle}`;
    if (handle && !enrichment.custom_mentions.includes(handle)) {
      setEnrichment(prev => ({ ...prev, custom_mentions: [...prev.custom_mentions, handle] }));
      setMentionInput('');
    }
  };

  const removeMention = (handle: string) => {
    setEnrichment(prev => ({ ...prev, custom_mentions: prev.custom_mentions.filter(m => m !== handle) }));
  };

  // -----------------------------------------------------------
  // Create edit session
  // -----------------------------------------------------------
  const createEditSession = async (payload: Record<string, unknown>) => {
    const res = await fetch('/api/content/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to create edit session');
    const data = await res.json();
    return data.edit.id as string;
  };

  // -----------------------------------------------------------
  // Continue to Editor (remix flow)
  // -----------------------------------------------------------
  const handleContinueToEditor = async () => {
    if (selectedPlatforms.length === 0) {
      setError('Select at least one platform.');
      return;
    }
    if (!templateId || !template) return;

    setIsApproving(true);
    try {
      const mediaSlots = buildRemixMediaSlots(template);
      const slideCount = mediaSlots.slides?.length ?? 0;

      // Seed slideCopy from the template's original per-slide captions so
      // the per-slide text UX in TextTab renders N pre-filled textareas.
      // Falls back to an empty array of the right length so the user still
      // sees N boxes to type into.
      let slideCopy: Array<string | { text: string; durationSeconds?: number }> | undefined;
      if (slideCount > 1) {
        const captionSource = template.slideCaptions;
        const captions: string[] = Array.isArray(captionSource)
          ? captionSource
          : captionSource && typeof captionSource === 'object'
            ? Object.values(captionSource as Record<string, string>)
            : [];
        slideCopy = Array.from({ length: slideCount }).map((_, i) => captions[i] || '');
      }

      const editId = await createEditSession({
        source: 'remix',
        templateId,
        contentType: contentType,
        targetPlatforms: selectedPlatforms,
        aspectRatio: '9:16',
        script: {
          hookText: template.structure?.hook?.text || '',
          bodyText: template.structure?.body?.text || '',
          ctaText: template.structure?.cta?.text || '',
          ...(slideCopy ? { slideCopy } : {}),
        },
        style: {
          fontFamily: 'Inter',
          fontSize: 20,
          color: '#ffffff',
          backgroundColor: 'transparent',
          align: 'center',
          backgroundDimming: 0.3,
        },
        layout: 'centered',
        mediaSlots,
        audioTrack: null,
      });
      router.push(`/dashboard/editor?edit=${editId}`);
    } catch {
      setError('Failed to create editor session.');
      setIsApproving(false);
    }
  };

  // -----------------------------------------------------------
  // Generate (both remix generate + standard AI generate)
  // -----------------------------------------------------------
  const handleGenerate = async () => {
    if (selectedPlatforms.length === 0) {
      setError('Select at least one platform.');
      return;
    }

    if (isRemix && templateId) {
      // Remix generate flow — calls remix API
      setRemixLoading(true);
      setError(null);
      setVariants([]);
      setSelectedVariant(null);
      setProgress({ completed: 0, total: 3, percent: 10 });
      setDisplayPercent(0);

      try {
        const res = await fetch(`/api/templates/${templateId}/remix`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contentType,
            targetPlatforms: selectedPlatforms,
            aspectRatio: '9:16',
            numVariants: 3,
            enrichment: hasEnrichment() ? enrichment : undefined,
            mediaOptions: { photoTier: 'unsplash' },
            remixEdits: remixEdits || undefined,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Remix failed. Please try again.');
          setRemixLoading(false);
          return;
        }

        setProgress({ completed: data.variants?.length || 0, total: 3, percent: 100 });
        setDisplayPercent(100);

        const mappedVariants: Variant[] = (data.variants || []).map((v: any) => ({
          id: v.id as string,
          caption: v.caption as string,
          hashtags: (v.hashtags as string[]) || [],
          antiSlopScore: v.antiSlopScore as number | null,
          qualityFlags: (v.qualityFlags as string[]) || [],
          variantNumber: v.variantNumber as number,
          platformSpecific: (v.platformSpecific as Record<string, string>) || {},
          enrichmentApplied: (v.enrichmentApplied as string[]) || [],
        }));

        setVariants(mappedVariants);
        setStep('review');
      } catch (err: any) {
        setError('Network error. Please check your connection.');
      } finally {
        setRemixLoading(false);
      }
      return;
    }

    // Standard SSE generation flow
    streamAbortRef.current?.abort();
    streamAbortRef.current = new AbortController();

    setIsGenerating(true);
    setError(null);
    setVariants([]);
    setSelectedVariant(null);
    setProgress({ completed: 0, total: 3, percent: 0 });
    setDisplayPercent(0);

    const numVariants = 3;
    const payload: Record<string, unknown> = {
      topic: topic || undefined,
      contentType,
      targetPlatforms: selectedPlatforms,
      numVariants,
    };
    if (hasEnrichment()) payload.enrichment = enrichment;

    try {
      const streamUrl = `/api/content/generate?body=${encodeURIComponent(JSON.stringify(payload))}`;
      const res = await fetch(streamUrl, {
        signal: streamAbortRef.current.signal,
        headers: { Accept: 'text/event-stream' },
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setError((data as any).error || 'Generation failed. Please try again.');
        setIsGenerating(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let receivedVariants: Variant[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event: any;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }

          if (event.type === 'progress') {
            setProgress({
              completed: event.completed ?? 0,
              total: event.total ?? numVariants,
              percent: event.percent ?? 0,
            });
          } else if (event.type === 'variant') {
            const v = event.variant;
            const mapped: Variant = {
              id: v.id as string,
              caption: v.caption as string,
              hashtags: (v.hashtags as string[]) || [],
              antiSlopScore: v.antiSlopScore as number | null,
              qualityFlags: (v.qualityFlags as string[]) || [],
              variantNumber: v.variantNumber as number,
              platformSpecific: (v.platformSpecific as Record<string, string>) || {},
              enrichmentApplied: (v.enrichmentApplied as string[]) || [],
            };
            receivedVariants = [...receivedVariants, mapped];
            setVariants([...receivedVariants]);
            if (receivedVariants.length === 1) setStep('review');
          } else if (event.type === 'done') {
            setProgress({ completed: event.total ?? numVariants, total: numVariants, percent: 100 });
            setDisplayPercent(100);
            setIsGenerating(false);
          } else if (event.type === 'error') {
            setError(event.detail || 'Generation failed. Please try again.');
            setIsGenerating(false);
          }
        }
      }

      if (receivedVariants.length > 0) setIsGenerating(false);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setError('Network error. Please check your connection.');
      setIsGenerating(false);
    }
  };

  // -----------------------------------------------------------
  // Approve variant → continue to editor
  // -----------------------------------------------------------
  const handleApprove = async () => {
    if (!selectedVariant) return;

    // Text-only posts can be approved directly
    if (contentType === 'text_only') {
      setIsApproving(true);
      try {
        await fetch(`/api/content/${selectedVariant}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'approved', isSelectedVariant: true }),
        });
        if (scheduledDate) {
          router.push(`/dashboard/content/${selectedVariant}?autoSchedule=${scheduledDate}`);
        } else {
          router.push('/dashboard/posts');
        }
      } catch {
        setError('Failed to approve.');
        setIsApproving(false);
      }
      return;
    }

    // All other content types go through the editor
    setIsApproving(true);
    try {
      const editId = await createEditSession({
        source: 'generate',
        contentItemId: selectedVariant,
        contentType,
        targetPlatforms: selectedPlatforms,
        aspectRatio: '9:16',
      });
      router.push(`/dashboard/editor?edit=${editId}`);
    } catch {
      setError('Failed to open editor.');
      setIsApproving(false);
    }
  };

  // -----------------------------------------------------------
  // DERIVED
  // -----------------------------------------------------------
  const typeDef = getTypeDef(contentType);
  const connectedAndActive = connectedAccounts.filter(a => a.isActive);

  // -----------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          {step !== 'type' && (
            <button
              type="button"
              onClick={() => {
                if (step === 'review') return setStep('configure');
                if (step === 'browse') return setStep('type');
                // step === 'configure'
                if (pickedFromBrowseRef.current) {
                  // User picked a template from the in-flow browser — undo the
                  // Remix and return to browse for the same content type.
                  pickedFromBrowseRef.current = false;
                  router.push('/dashboard/content/create');
                  setStep('browse');
                  return;
                }
                if (isRemix) return router.push('/dashboard/content-library');
                setStep('type');
              }}
              className="inline-flex items-center gap-1.5 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
            </button>
          )}
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              {isRemix ? 'Remix Template' : 'Create Post'}
            </h1>
            {step === 'configure' && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {isRemix
                  ? 'Customize before opening the editor'
                  : 'Configure your post and generate variants'}
              </p>
            )}
            {step === 'review' && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                Select the best variant
              </p>
            )}
          </div>
        </div>

        {step !== 'type' && connectedAndActive.length === 0 && (
          <Link
            href="/dashboard/connections"
            className="hidden shrink-0 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:inline-flex"
          >
            Connect accounts
          </Link>
        )}
      </div>

      {/* ── Scheduled date banner ─────────────────────────── */}
      {scheduledDate && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-violet-200/60 bg-violet-50/60 px-4 py-3 dark:border-violet-800/40 dark:bg-violet-950/30">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">
            <span className="size-1.5 rounded-full bg-white" />
            Scheduled
          </span>
          <p className="text-sm font-medium text-violet-900 dark:text-violet-100">
            {new Date(`${scheduledDate}T12:00:00`).toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
            })}
          </p>
        </div>
      )}

      {/* ── Content Type Selector (step 1) ──────────────── */}
      {step === 'type' && !isRemix && (
        <div>
          <label className="mb-3 block text-sm font-medium text-foreground">
            What kind of content are you creating?
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CONTENT_TYPES.map((type) => {
                    const Icon = type.icon;
                    return (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => {
                          setContentType(type.id);
                          // Text-only has no visual trending templates — skip
                          // straight to configure. Everything else browses.
                          setStep(type.id === 'text_only' ? 'configure' : 'browse');
                        }}
                        className="group flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border/50 bg-card p-4 text-center transition-all hover:border-primary/40 hover:bg-primary/5"
                      >
                        <Icon className="size-7 text-muted-foreground/30 transition-colors group-hover:text-muted-foreground" strokeWidth={1.2} />
                        <div>
                          <p className="text-sm font-semibold">{type.label}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{type.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {connectedAndActive.length === 0 && (
                  <div className="mt-6 flex flex-col gap-3 rounded-xl bg-muted/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-muted-foreground">Connect your social accounts to publish content.</p>
                    <Link href="/dashboard/connections" className="self-start rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:self-auto">
                      Connect accounts
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* ── Browse Trending Templates (step 1.5) ────────── */}
            {step === 'browse' && typeDef && (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-sm font-medium">
                      <typeDef.icon className="size-4" strokeWidth={1.5} />
                      {typeDef.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => setStep('type')}
                      className="text-xs text-muted-foreground underline hover:text-foreground"
                    >
                      Change
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep('configure')}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted"
                  >
                    Start from scratch
                  </button>
                </div>
                <div>
                  <h2 className="text-sm font-semibold">
                    Trending {typeDef.label.toLowerCase()} templates
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Pick one to remix, or start from scratch above.
                  </p>
                </div>
                <TrendingTemplateBrowser
                  contentType={contentType}
                  onRemix={(t) => {
                    pickedFromBrowseRef.current = true;
                    // Optimistic template hydration eliminates the empty
                    // frame between browse and configure. The URL fetch
                    // effect at loadTemplate() still runs and refreshes
                    // the object from /api/templates/[id] when it lands.
                    setTemplate(t);
                    // Pre-seed the fields the loadTemplate effect derives,
                    // so the configure form renders complete on the first
                    // paint instead of populating fields one-by-one.
                    const structure = t.structure || {};
                    const derivedTopic = [structure.hook?.text, structure.body?.text, structure.cta?.text]
                      .filter(Boolean)
                      .join(' ') || t.sourceCreator || '';
                    setTopic(derivedTopic);
                    setContentType(REMIX_TYPE_MAP[t.contentType] || 'reel');
                    setSelectedPlatforms([t.sourcePlatform === 'tiktok' ? 'tiktok' : 'instagram']);
                    setStep('configure');
                    router.push(`/dashboard/content/create?templateId=${t.id}`);
                  }}
                />
              </div>
            )}

            {/* Template-loading skeleton — the Remix redirect from the
                Trending Template Browser previously flashed empty state for
                ~500ms while /api/templates/[id] resolved. Show a low-jitter
                shimmer so the transition into the configure form feels smooth. */}
            {step === 'configure' && isRemix && !template && (
              <div className="grid gap-6 lg:grid-cols-5" aria-label="Loading template">
                <div className="space-y-4 lg:col-span-3">
                  <div className="h-8 w-40 animate-pulse rounded bg-muted" />
                  <div className="h-24 w-full animate-pulse rounded-lg bg-muted/70" />
                  <div className="h-24 w-full animate-pulse rounded-lg bg-muted/60" />
                  <div className="h-32 w-full animate-pulse rounded-lg bg-muted/50" />
                </div>
                <div className="space-y-3 lg:col-span-2">
                  <div className="h-40 w-full animate-pulse rounded-lg bg-muted/70" />
                  <div className="h-6 w-3/4 animate-pulse rounded bg-muted/60" />
                  <div className="h-6 w-1/2 animate-pulse rounded bg-muted/50" />
                </div>
              </div>
            )}

            {step === 'configure' && (!isRemix || template) && (
              <div className="grid gap-6 lg:grid-cols-5">
              <div className="space-y-4 lg:col-span-3">
                {/* Content type badge */}
                {typeDef && (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-sm font-medium">
                      <typeDef.icon className="size-4" strokeWidth={1.5} />
                      {typeDef.label}
                    </span>
                    {!fromMonthlyPlan && !isRemix && (
                      <button
                        type="button"
                        onClick={() => setStep('type')}
                        className="text-xs text-muted-foreground underline hover:text-foreground"
                      >
                        Change
                      </button>
                    )}
                    {isRemix && template && (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700">
                        <Wand2 className="size-3.5" />
                        {template.sourceCreator || 'Trending'}
                      </span>
                    )}
                  </div>
                )}

                {/* Topic */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    Topic
                    <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <textarea
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    placeholder="e.g. New product launch, Behind the scenes, Industry tip..."
                    rows={3}
                    className="w-full resize-none rounded-lg border bg-background px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Leave blank to auto-select from your Brand Profile.
                  </p>
                </div>

                {/* Platforms (collapsible) */}
                <div className="overflow-hidden rounded-xl border bg-card">
                  <button
                    type="button"
                    onClick={() => setShowPlatforms(p => !p)}
                    className="flex w-full items-center justify-between px-4 py-3.5 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <Megaphone className="size-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Target platforms</span>
                      {selectedPlatforms.length > 0 && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          {selectedPlatforms.length} selected
                        </span>
                      )}
                    </div>
                    {showPlatforms ? (
                      <ChevronUp className="size-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="size-4 text-muted-foreground" />
                    )}
                  </button>

                  {showPlatforms && (
                    <div className="border-t p-4">
                      {connectedPlatformIds.length === 0 ? (
                        <div className="rounded-lg bg-muted/50 px-3 py-3 text-xs text-muted-foreground">
                          No accounts connected.{' '}
                          <Link href="/dashboard/connections" className="text-primary underline">
                            Connect platforms
                          </Link>{' '}
                          to select them here.
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          {PLATFORMS.filter(p => connectedPlatformIds.includes(p.id)).map((platform) => {
                            const PIcon = platform.icon;
                            const isSelected = selectedPlatforms.includes(platform.id);
                            return (
                              <button
                                key={platform.id}
                                type="button"
                                onClick={() => togglePlatform(platform.id)}
                                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-all ${
                                  isSelected
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border hover:bg-muted'
                                }`}
                              >
                                <PIcon className={`size-4 shrink-0 ${
                                  isSelected ? 'text-primary' : 'text-muted-foreground'
                                }`} />
                                <span className={`flex-1 truncate ${isSelected ? 'font-medium' : ''}`}>{platform.name}</span>
                                {isSelected && <Check className="size-4 shrink-0 text-primary" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Enrichment (collapsible) */}
                <div className="overflow-hidden rounded-xl border bg-card">
                  <button
                    type="button"
                    onClick={() => setShowEnrichment(p => !p)}
                    className="flex w-full items-center justify-between px-4 py-3.5 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <Link2 className="size-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Post enrichment</span>
                      {hasEnrichment() && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          Active
                        </span>
                      )}
                    </div>
                    {showEnrichment ? (
                      <ChevronUp className="size-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="size-4 text-muted-foreground" />
                    )}
                  </button>

                  {showEnrichment && (
                    <div className="space-y-4 border-t p-4">
                      <p className="text-xs text-muted-foreground">
                        Add links, promo codes, contact info, and other elements to weave into your post.
                      </p>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">CTA URL</label>
                          <input
                            type="url"
                            value={enrichment.cta_url}
                            onChange={e => setEnrichment(prev => ({ ...prev, cta_url: e.target.value }))}
                            placeholder="https://example.com/sale"
                            className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">CTA label</label>
                          <input
                            type="text"
                            value={enrichment.cta_label}
                            onChange={e => setEnrichment(prev => ({ ...prev, cta_label: e.target.value }))}
                            placeholder="Shop the collection"
                            className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">Promo code</label>
                        <input
                          type="text"
                          value={enrichment.promo_code}
                          onChange={e => setEnrichment(prev => ({ ...prev, promo_code: e.target.value }))}
                          placeholder="SAVE20"
                          className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">Contact info</label>
                        <input
                          type="text"
                          value={enrichment.contact_info}
                          onChange={e => setEnrichment(prev => ({ ...prev, contact_info: e.target.value }))}
                          placeholder="email@company.com or booking link"
                          className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">Event details</label>
                        <input
                          type="text"
                          value={enrichment.event_details}
                          onChange={e => setEnrichment(prev => ({ ...prev, event_details: e.target.value }))}
                          placeholder="March 15, 2026 at 7pm — Eko Hotel, Lagos"
                          className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">Reference links</label>
                        <div className="flex gap-2">
                          <input
                            type="url"
                            value={refLinkInput}
                            onChange={e => setRefLinkInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addRefLink())}
                            placeholder="https://..."
                            className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                          <button
                            type="button"
                            onClick={addRefLink}
                            className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
                          >
                            Add
                          </button>
                        </div>
                        {enrichment.reference_links.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {enrichment.reference_links.map(link => (
                              <span key={link} className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-[11px]">
                                {link.length > 35 ? `${link.slice(0, 35)}...` : link}
                                <button type="button" onClick={() => removeRefLink(link)} className="ml-0.5 opacity-50 hover:opacity-100">
                                  &times;
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">Mentions</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={mentionInput}
                            onChange={e => setMentionInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addMention())}
                            placeholder="@handle"
                            className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                          <button
                            type="button"
                            onClick={addMention}
                            className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
                          >
                            Add
                          </button>
                        </div>
                        {enrichment.custom_mentions.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {enrichment.custom_mentions.map(handle => (
                              <span key={handle} className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-[11px]">
                                {handle}
                                <button type="button" onClick={() => removeMention(handle)} className="ml-0.5 opacity-50 hover:opacity-100">
                                  &times;
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Error */}
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                {/* Primary action */}
                <button
                  type="button"
                  onClick={isRemix ? handleContinueToEditor : handleGenerate}
                  disabled={isGenerating || remixLoading || isApproving || selectedPlatforms.length === 0}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {isGenerating || remixLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : isRemix ? (
                    <Wand2 className="size-4" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  {isGenerating
                    ? 'Generating...'
                    : remixLoading
                      ? 'Remixing...'
                      : isRemix
                        ? 'Continue to Editor'
                        : 'Generate Content'}
                </button>
              </div>

              {/* ── RIGHT: Template preview / visual panel ────── */}
              <div className="hidden lg:col-span-2 lg:block">
                <div className="sticky top-6 space-y-4">
                  {isRemix && template && (
                <>
                  <div className="rounded-xl border bg-card p-4">
                    <h3 className="mb-3 text-sm font-semibold">Template Preview</h3>
                    <div className="relative mx-auto aspect-[9/16] max-w-[280px] overflow-hidden rounded-xl bg-muted">
                      <TemplatePreviewMedia template={template} />
                    </div>
                  </div>

                  {/* Structure info (collapsible, default collapsed) */}
                  {template.structure && (
                    <div className="overflow-hidden rounded-xl border bg-card">
                      <button
                        type="button"
                        onClick={() => setShowStructure(p => !p)}
                        className="flex w-full items-center justify-between px-4 py-3.5 text-left"
                      >
                        <span className="text-sm font-medium">Content Structure</span>
                        {showStructure ? (
                          <ChevronUp className="size-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="size-4 text-muted-foreground" />
                        )}
                      </button>
                      {showStructure && (
                        <div className="space-y-2.5 border-t p-4">
                          {template.structure.hook && (
                            <div className="rounded-lg bg-muted/50 p-2.5">
                              <div className="text-[10px] font-medium uppercase tracking-wider text-purple-600 dark:text-purple-400">
                                Hook &middot; {template.structure.hook.duration}s
                              </div>
                              <p className="mt-0.5 text-sm text-foreground line-clamp-2">
                                {template.structure.hook.text}
                              </p>
                            </div>
                          )}
                          {template.structure.body && (
                            <div className="rounded-lg bg-muted/50 p-2.5">
                              <div className="text-[10px] font-medium uppercase tracking-wider text-blue-600 dark:text-blue-400">
                                Body &middot; {template.structure.body.duration}s
                              </div>
                              <p className="mt-0.5 text-sm text-foreground line-clamp-2">
                                {template.structure.body.text}
                              </p>
                            </div>
                          )}
                          {template.structure.cta && (
                            <div className="rounded-lg bg-muted/50 p-2.5">
                              <div className="text-[10px] font-medium uppercase tracking-wider text-green-600 dark:text-green-400">
                                CTA &middot; {template.structure.cta.duration}s
                              </div>
                              <p className="mt-0.5 text-sm text-foreground line-clamp-2">
                                {template.structure.cta.text}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Non-remix: show content type info */}
              {!isRemix && step === 'configure' && typeDef && (
                <div className="rounded-xl border bg-card p-4">
                  <h3 className="mb-3 text-sm font-semibold">{typeDef.label}</h3>
                  <div className="flex flex-col items-center justify-center rounded-xl bg-muted/30 py-12">
                    <typeDef.icon className="mb-3 size-12 text-muted-foreground/30" strokeWidth={1} />
                    <p className="text-sm text-muted-foreground">{typeDef.description}</p>
                    <div className="mt-4 flex items-center gap-1.5">
                      {typeDef.platforms.map(p => {
                        const platform = PLATFORMS.find(pl => pl.id === p);
                        if (!platform) return null;
                        const PIcon = platform.icon;
                        return <PIcon key={p} className="size-4 text-muted-foreground/40" />;
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── GENERATING STATE ─────────────────────────────── */}
      {(isGenerating || remixLoading) && step !== 'review' && (
        <div className="mx-auto mt-4 max-w-2xl">
          <div className="rounded-xl border bg-card p-6">
            <div className="mb-4 flex items-end justify-between">
              <p className="text-sm font-medium text-foreground">{getProgressMessage(displayPercent)}</p>
              <span className="text-2xl font-bold tabular-nums text-primary">
                {displayPercent}<span className="text-base font-medium">%</span>
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all duration-300 ease-out" style={{ width: `${displayPercent}%` }} />
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <span>{progress.completed > 0 ? `${progress.completed} of ${progress.total} variants ready` : 'Generating variants...'}</span>
              {variants.length > 0 && (
                <span className="text-primary">{variants.length > 1 ? `${variants.length} variants below` : '1 variant below — more coming'}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── REVIEW VARIANTS ──────────────────────────────── */}
      {step === 'review' && (
        <div className="mx-auto max-w-3xl space-y-4">
          {!isGenerating && !remixLoading && (
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">
                  {variants.length} variant{variants.length !== 1 ? 's' : ''} generated
                </h2>
                <p className="text-xs text-muted-foreground">Select the best one, then continue.</p>
              </div>
              <button
                type="button"
                onClick={() => { setStep('configure'); setVariants([]); }}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted"
              >
                <RefreshCw className="size-3" />
                Regenerate
              </button>
            </div>
          )}

          {variants.map(variant => (
            <button
              key={variant.id}
              type="button"
              onClick={() => setSelectedVariant(variant.id)}
              className={`w-full rounded-xl border bg-card p-5 text-left transition-all ${
                selectedVariant === variant.id
                  ? 'border-primary ring-2 ring-primary/15'
                  : 'hover:border-muted-foreground/20'
              }`}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                    {variant.variantNumber}
                  </span>
                  <span className="text-xs text-muted-foreground">Variant {variant.variantNumber}</span>
                </div>
                <div className="flex items-center gap-2">
                  {variant.antiSlopScore !== null && (() => {
                    const sl = scoreLabel(variant.antiSlopScore!);
                    return (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${sl.color}`}>
                        {Math.round(variant.antiSlopScore! * 100)}% {sl.text}
                      </span>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(variant.caption); }}
                    className="rounded p-1.5 hover:bg-muted"
                    title="Copy"
                  >
                    <Copy className="size-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{variant.caption}</p>
              {variant.hashtags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {variant.hashtags.map(tag => (
                    <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{tag}</span>
                  ))}
                </div>
              )}
              {variant.enrichmentApplied && variant.enrichmentApplied.length > 0 && (
                <div className="mt-3 flex items-center gap-1.5 border-t pt-3">
                  <Link2 className="size-3 text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground">
                    Enrichment applied: {variant.enrichmentApplied.map(e => e.replace(/_/g, ' ')).join(', ')}
                  </span>
                </div>
              )}
              {variant.qualityFlags && variant.qualityFlags.length > 0 && (
                <div className="mt-2 space-y-1 border-t pt-3">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-orange-500/70">Quality notes</span>
                  {variant.qualityFlags.slice(0, 3).map((flag, i) => (
                    <p key={i} className="text-[11px] text-muted-foreground">{flag}</p>
                  ))}
                </div>
              )}
            </button>
          ))}

          {(isGenerating || remixLoading) && variants.length < 3 && (
            Array.from({ length: 3 - variants.length }).map((_, i) => (
              <div key={`skeleton-${i}`} className="w-full animate-pulse rounded-xl border bg-card p-5">
                <div className="mb-3 flex items-center gap-2">
                  <div className="size-6 rounded-full bg-muted" />
                  <div className="h-3 w-16 rounded bg-muted" />
                </div>
                <div className="space-y-2">
                  <div className="h-3 w-full rounded bg-muted" />
                  <div className="h-3 w-5/6 rounded bg-muted" />
                  <div className="h-3 w-4/6 rounded bg-muted" />
                </div>
              </div>
            ))
          )}

          {!isGenerating && !remixLoading && selectedVariant && (
            <button
              type="button"
              onClick={handleApprove}
              disabled={isApproving}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {isApproving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              {isApproving
                ? 'Opening editor...'
                : contentType === 'text_only'
                  ? scheduledDate ? 'Approve and set schedule' : 'Approve selected variant'
                  : 'Continue to editor'
              }
            </button>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
