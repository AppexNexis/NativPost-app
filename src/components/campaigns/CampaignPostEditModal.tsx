'use client';

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Italic,
  Plus,
  RefreshCw,
  Underline,
  VolumeX,
  X,
} from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';

import { buildCaptionSpec } from '@/components/content/caption-spec';
import { CaptionLayer } from '@/components/content/CaptionOverlay';
import { ColorField } from '@/components/editor/ColorField';
import { type AudioSelection, AudioSelectModal } from '@/components/media/AudioSelectModal';
import { MediaPickerModal } from '@/components/media/MediaPickerModal';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { getEditorKind } from '@/lib/editor/content-type-registry';
import { isAuthoredScript } from '@/lib/editor/derive-script';
// Importing EDITOR_FONTS runs the fonts.ts loadFont() side effects, which
// inject the @font-face rules globally — that is what makes the registry
// families render in this modal's own preview without next/font.
import { EDITOR_FONTS } from '@/lib/editor/fonts';
import type { ContentItem } from '@/types/v2';
import { cn } from '@/utils/Helpers';

export type CampaignPostEditModalProps = {
  campaignId: string;
  contentItem: ContentItem;
  reRollsRemaining: number;
  onCancel: () => void;
  onSaved: (updated: ContentItem) => void;
};

// Quick-pick swatches — mirror the shared TextTab so the campaign editor and
// the standalone/Blitz editor offer the identical palette.
const TEXT_COLORS = [
  '#ffffff',
  '#000000',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
];

// Per-line "highlight" backgrounds (usefastlane look), rendered via
// box-decoration-break in the preview + engine. "None" = transparent, which
// falls back to a soft shadow for legibility.
const TEXT_BG_PRESETS: { label: string; value: string }[] = [
  { label: 'Highlight', value: '#000000' },
  { label: 'White', value: '#ffffff' },
  { label: 'Subtle', value: 'rgba(0,0,0,0.5)' },
  { label: 'None', value: 'transparent' },
];

const CTA_COLORS = [
  'rgba(134, 79, 254, 0.85)',
  '#864FFE',
  '#ef4444',
  '#22c55e',
  '#3b82f6',
  '#f59e0b',
  '#ec4899',
  'rgba(0,0,0,0.7)',
];

// Migrate the legacy `background: 'white' | 'none' | 'snapchat'` enum written
// by the old campaign modal to a canonical `backgroundColor` string. Anything
// unrecognised falls back to transparent (no box).
function migrateLegacyBackground(bg: unknown): string {
  if (bg === 'white') {
    return '#ffffff';
  }
  if (bg === 'snapchat') {
    return '#FFFC00';
  }
  return 'transparent';
}

// A compact icon/label segmented toggle group — mirrors TextTab's helper so the
// two editors look identical (no new radix dependency).
function SegmentedGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label?: string; icon?: React.ReactNode; title?: string }[];
  value: T | undefined;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-border">
      {options.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          title={opt.title}
          onClick={() => onChange(opt.value)}
          className={cn(
            'flex flex-1 items-center justify-center gap-1 py-2 text-xs font-medium transition-colors',
            i > 0 && 'border-l border-border',
            value === opt.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

type SlideEntry = { url: string; caption?: string };

function resolveSlides(enrichment: Record<string, unknown>): SlideEntry[] {
  const mediaSlots = (enrichment.sourceMediaSlots ?? {}) as Record<string, unknown>;
  const script = (enrichment.editorScript ?? {}) as Record<string, unknown>;
  // Per-slide text lives in editorScript.slideCopy (built by buildEditorScript).
  // Older items may not have it — fall back to slideCaptions on the template
  // snapshot, then to the raw slide object's caption, then to a split of the
  // post caption. Guarantees each slide gets a caption slot so the "Slide N
  // text" input on the right panel always has something to bind to.
  const slideCopy = Array.isArray(script.slideCopy) ? (script.slideCopy as string[]) : [];
  const snapshot = (enrichment.templateSnapshot ?? {}) as Record<string, unknown>;
  const snapSlideCaptions = Array.isArray(snapshot.slideCaptions) ? (snapshot.slideCaptions as string[]) : [];

  const rawSlides = mediaSlots.slides;
  if (Array.isArray(rawSlides) && rawSlides.length > 0) {
    return rawSlides
      .filter((s): s is Record<string, unknown> => s && typeof s === 'object')
      .map((s, i) => ({
        url: String(s.url ?? ''),
        caption:
          slideCopy[i]
          ?? snapSlideCaptions[i]
          ?? (s.caption ? String(s.caption) : ''),
      }))
      .filter(s => !!s.url);
  }
  return [];
}

const EDITOR_VIDEO_RE = /\.(mp4|webm|mov|m4v)(\?|$)/i;

// Returns the best static image thumbnail for a video-type post (may be empty).
function resolveVideoThumb(enrichment: Record<string, unknown>, graphicUrls?: string[]): string {
  const mediaSlots = (enrichment.sourceMediaSlots ?? {}) as Record<string, unknown>;
  const bg = (mediaSlots.background ?? {}) as Record<string, unknown>;
  const snapshot = (enrichment.templateSnapshot ?? {}) as Record<string, unknown>;
  if (bg.thumbnailUrl && !EDITOR_VIDEO_RE.test(String(bg.thumbnailUrl))) {
    return String(bg.thumbnailUrl);
  }
  if (snapshot.thumbnailUrl && !EDITOR_VIDEO_RE.test(String(snapshot.thumbnailUrl))) {
    return String(snapshot.thumbnailUrl);
  }
  const tus = snapshot.thumbnailUrls;
  if (Array.isArray(tus) && tus.length > 0 && typeof tus[0] === 'string') {
    return tus[0];
  }
  if (tus && typeof tus === 'object' && !Array.isArray(tus)) {
    const first = Object.values(tus as Record<string, unknown>)[0];
    if (typeof first === 'string' && !EDITOR_VIDEO_RE.test(first)) {
      return first;
    }
  }
  const gUrl = Array.isArray(graphicUrls) ? (graphicUrls[0] ?? '') : '';
  if (gUrl && !EDITOR_VIDEO_RE.test(gUrl)) {
    return gUrl;
  }
  return '';
}

// Returns the actual video file URL so we can render <video> in the preview.
function resolveVideoUrl(enrichment: Record<string, unknown>, graphicUrls?: string[]): string {
  const mediaSlots = (enrichment.sourceMediaSlots ?? {}) as Record<string, unknown>;
  const bg = (mediaSlots.background ?? {}) as Record<string, unknown>;
  if (bg.url && (bg.assetType === 'video' || EDITOR_VIDEO_RE.test(String(bg.url)))) {
    return String(bg.url);
  }
  const hookVid = (mediaSlots.hookVideo ?? {}) as Record<string, unknown>;
  if (hookVid.url) {
    return String(hookVid.url);
  }
  const snapshot = (enrichment.templateSnapshot ?? {}) as Record<string, unknown>;
  if (snapshot.sourceUrl) {
    return String(snapshot.sourceUrl);
  }
  if (snapshot.mediaUrl && EDITOR_VIDEO_RE.test(String(snapshot.mediaUrl))) {
    return String(snapshot.mediaUrl);
  }
  const gUrl = Array.isArray(graphicUrls) ? (graphicUrls[0] ?? '') : '';
  if (gUrl && EDITOR_VIDEO_RE.test(gUrl)) {
    return gUrl;
  }
  return '';
}

export function CampaignPostEditModal({
  campaignId,
  contentItem,
  reRollsRemaining,
  onCancel,
  onSaved,
}: CampaignPostEditModalProps) {
  const [item, setItem] = useState<ContentItem>(contentItem);
  const enrichment = (item.enrichmentData ?? {}) as Record<string, unknown>;
  const script = (enrichment.editorScript ?? {}) as Record<string, unknown>;
  // Style is canonically stored at enrichmentData.editorStyle (what the render,
  // publish, and preview pipelines all read). editorScript.textStyle is the
  // modal's own mirror. Fall back to editorStyle so a post styled elsewhere
  // still loads with its real values.
  const textStyle = (script.textStyle
    ?? enrichment.editorStyle
    ?? {}) as Record<string, unknown>;

  const isSlideshow = item.contentType === 'slideshow';
  const kind = getEditorKind(item.contentType);
  const isVideo = kind === 'video';

  // ── Slides state (slideshow mode) ─────────────────────────────────────────
  const [slides, setSlides] = useState<SlideEntry[]>(() => resolveSlides(enrichment));
  const [slideIndex, setSlideIndex] = useState(0);
  const [showSlideSwap, setShowSlideSwap] = useState<number | null>(null);
  const [showAddSlide, setShowAddSlide] = useState(false);

  // ── Video asset state ──────────────────────────────────────────────────────
  const [videoThumb, setVideoThumb] = useState(() => resolveVideoThumb(enrichment, item.graphicUrls as string[]));
  const [videoUrl, setVideoUrl] = useState(() => resolveVideoUrl(enrichment, item.graphicUrls as string[]));
  const initialAudio = ((enrichment.editorScript as Record<string, unknown> | undefined)?.audioTrack ?? null) as
    | { name?: string; url?: string; publicId?: string }
    | null;
  const [audioTrack, setAudioTrack] = useState<{ name: string; url: string; publicId?: string } | null>(
    initialAudio && initialAudio.url ? { name: initialAudio.name ?? 'Audio track', url: initialAudio.url, publicId: initialAudio.publicId } : null,
  );
  const audioLabel = audioTrack?.name ?? 'No audio selected';
  const [showVideoSwap, setShowVideoSwap] = useState(false);
  const [showAudioSwap, setShowAudioSwap] = useState(false);

  // ── Picker close race guard ───────────────────────────────────────────────
  // Radix fires onOpenChange(false) on the outer fullscreen Dialog AFTER the
  // picker Dialog's onClose has already reset state to null/false. A ref
  // (not state) survives that render cycle, so the outer Dialog's dismiss
  // handler can still see "a picker was just open" and not close the editor.
  const pickerWasOpen = useRef(false);
  const pickerCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markPickerOpen = useCallback(() => {
    if (pickerCloseTimer.current) {
      clearTimeout(pickerCloseTimer.current);
    }
    pickerWasOpen.current = true;
  }, []);
  const markPickerClosed = useCallback(() => {
    pickerCloseTimer.current = setTimeout(() => {
      pickerWasOpen.current = false;
    }, 300);
  }, []);

  // ── Left panel ────────────────────────────────────────────────────────────
  const [mentionBusiness, setMentionBusiness] = useState(() => {
    const mf = String(enrichment.mentionFrequency ?? '');
    return mf === 'always' || mf === 'often';
  });
  const [prompt, setPrompt] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  // ── Right panel — text style (canonical TextStyle schema, matching the
  //    shared editor so campaign posts render WYSIWYG through the same
  //    pipeline). Legacy fields (fontWeight number, strokeWidth/strokeColor,
  //    background enum) are migrated on read and no longer written. ──────────
  const [fontFamily, setFontFamily] = useState(() => {
    const stored = String(textStyle.fontFamily ?? '');
    return EDITOR_FONTS.includes(stored) ? stored : 'Inter';
  });
  const [fontSize, setFontSize] = useState(Number(textStyle.fontSize ?? 30));
  const [textColor, setTextColor] = useState(String(textStyle.color ?? '#FFFFFF'));
  const [align, setAlign] = useState<'left' | 'center' | 'right'>(
    (textStyle.align as 'left' | 'center' | 'right') ?? 'center',
  );
  const [weight, setWeight] = useState<'normal' | 'bold'>(() => {
    if (textStyle.weight === 'bold' || textStyle.weight === 'normal') {
      return textStyle.weight;
    }
    // Migrate the legacy numeric fontWeight.
    return Number(textStyle.fontWeight ?? 400) >= 600 ? 'bold' : 'normal';
  });
  const [italic, setItalic] = useState(Boolean(textStyle.italic ?? false));
  const [underline, setUnderline] = useState(Boolean(textStyle.underline ?? false));
  const [backgroundColor, setBackgroundColor] = useState<string>(
    typeof textStyle.backgroundColor === 'string'
      ? textStyle.backgroundColor
      : migrateLegacyBackground(textStyle.background),
  );
  const [backgroundDimming, setBackgroundDimming] = useState(Number(textStyle.backgroundDimming ?? 0));
  const [ctaBackgroundColor, setCtaBackgroundColor] = useState(String(textStyle.ctaBackgroundColor ?? '#864FFE'));
  const [noAnimation, setNoAnimation] = useState(Boolean(textStyle.noAnimation ?? false));
  // Per-element visibility (mirrors the shared TextTab toggles). Absent === visible.
  const [showHook, setShowHook] = useState(textStyle.showHook !== false);
  const [showBody, setShowBody] = useState(textStyle.showBody !== false);
  const [showCta, setShowCta] = useState(textStyle.showCta !== false);

  // ── Saving ────────────────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false);

  // ── Derived ───────────────────────────────────────────────────────────────
  // For slideshows: show the current slide's own caption as overlay text.
  // For video types: show hookText or bodyText from the editor script, each
  // gated on its visibility toggle (hide = no overlay, copy still publishes).
  // Mirrors caption-spec.getOverlayTextParts: an authored script is
  // authoritative even when every field is empty/hidden — only non-authored
  // (legacy caption) posts fall back to `item.caption`, so the live preview
  // cannot draw text the rendered video won't show.
  const overlayText = isSlideshow
    ? (slides[slideIndex]?.caption ?? String(script.hookText ?? item.caption ?? ''))
    : String(
        (showHook && script.hookText)
          ? script.hookText
          : (showBody && script.bodyText)
            ? script.bodyText
            : (isAuthoredScript(script) ? '' : (item.caption ?? '')),
      );

  // (anyPickerOpen state guard removed — using pickerWasOpen ref instead to
  //  avoid the race where state resets before Radix fires the outer dialog event)

  // Live preview geometry, resolved from the controls above rather than from
  // the saved item, so dragging a slider updates the preview through the same
  // resolver the published post will use. `layout` isn't editable here, so it
  // comes from the item.
  const livePreviewSpec = useMemo(
    () => buildCaptionSpec({
      contentType: item.contentType ?? '',
      layout: (enrichment.editorLayout as string) || 'centered',
      style: {
        align,
        backgroundColor,
        color: textColor,
        fontFamily,
        fontSize,
        weight,
        italic,
        underline,
        backgroundDimming,
        showHook,
        showBody,
        showCta,
      },
      text: overlayText,
    }),
    [
      item.contentType,
      enrichment.editorLayout,
      align,
      backgroundColor,
      textColor,
      fontFamily,
      fontSize,
      weight,
      italic,
      underline,
      backgroundDimming,
      showHook,
      showBody,
      showCta,
      overlayText,
    ],
  );

  const handleRegenerate = useCallback(async () => {
    if (isRegenerating || reRollsRemaining <= 0) {
      return;
    }
    setIsRegenerating(true);
    setRegenError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/re-roll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentItemId: item.id,
          keepText: false,
          topicOverride: prompt || null,
          mentionBusiness,
        }),
      });
      const data = (await res.json()) as { contentItem?: ContentItem; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? 'Regeneration failed');
      }
      if (data.contentItem) {
        setItem(data.contentItem);
        const newEnrichment = (data.contentItem.enrichmentData ?? {}) as Record<string, unknown>;
        setSlides(resolveSlides(newEnrichment));
        setSlideIndex(0);
        setPrompt('');
      }
    } catch (err: unknown) {
      setRegenError(err instanceof Error ? err.message : 'Regeneration failed');
    } finally {
      setIsRegenerating(false);
    }
  }, [isRegenerating, reRollsRemaining, campaignId, item.id, prompt, mentionBusiness]);

  const handleSave = useCallback(async () => {
    if (isSaving) {
      return;
    }
    setIsSaving(true);
    try {
      const updatedSlots = isSlideshow
        ? {
            ...(enrichment.sourceMediaSlots as Record<string, unknown> ?? {}),
            slides: slides.map(s => ({ url: s.url })),
          }
        : enrichment.sourceMediaSlots;

      // Canonical TextStyle payload. Written to BOTH editorScript.textStyle
      // (the modal's mirror) and top-level editorStyle — the key the render,
      // publish, and preview pipelines actually read (reconstruct-render-input,
      // publish/route, ContentPreview). Without editorStyle the post renders
      // with default styling and none of these edits reach the published post.
      const textStylePayload = {
        fontFamily,
        fontSize,
        color: textColor,
        align,
        weight,
        italic,
        underline,
        backgroundColor,
        backgroundDimming,
        ctaBackgroundColor,
        noAnimation,
        // Per-element visibility — hides the overlay on preview/render only;
        // the copy stays in `script` and still publishes as post content.
        showHook,
        showBody,
        showCta,
      };

      const updatedScript = isSlideshow
        ? {
            ...(script as Record<string, unknown>),
            // Persist per-slide captions so they survive reload
            slideCopy: slides.map(s => s.caption ?? ''),
            hookText: slides[0]?.caption ?? script.hookText,
            textStyle: textStylePayload,
          }
        : {
            ...(script as Record<string, unknown>),
            // Persist selected audio track so it survives reload and picks
            // up in the render pipeline (Remotion <Audio/> reads from
            // enrichmentData.editorScript.audioTrack).
            audioTrack: audioTrack ?? null,
            textStyle: textStylePayload,
          };

      const updatedEnrichment = {
        ...enrichment,
        mentionFrequency: mentionBusiness ? 'often' : 'never',
        sourceMediaSlots: updatedSlots,
        editorScript: updatedScript,
        editorStyle: textStylePayload,
      };
      const res = await fetch(`/api/content/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption: item.caption, enrichmentData: updatedEnrichment }),
      });
      const data = (await res.json()) as { item?: ContentItem };
      onSaved(data.item ?? item);
    } catch {
      onSaved(item);
    } finally {
      setIsSaving(false);
    }
  }, [
    isSaving,
    item,
    onSaved,
    enrichment,
    script,
    isSlideshow,
    slides,
    mentionBusiness,
    fontFamily,
    fontSize,
    textColor,
    align,
    weight,
    italic,
    underline,
    backgroundColor,
    backgroundDimming,
    ctaBackgroundColor,
    noAnimation,
    audioTrack,
  ]);

  // ── Slide nav helpers ─────────────────────────────────────────────────────
  const goPrev = () => setSlideIndex(i => Math.max(0, i - 1));
  const goNext = () => setSlideIndex(i => Math.min(slides.length - 1, i + 1));

  const currentSlideUrl = slides[slideIndex]?.url ?? '';

  return (
    <>
      <Dialog
        open
        onOpenChange={(o) => {
          if (!o && !pickerWasOpen.current) {
            onCancel();
          }
        }}
      >
        <DialogContent
          className="max-w-screen flex h-screen max-h-screen w-screen flex-col gap-0 rounded-none p-0 [&>button]:hidden"
          onPointerDownOutside={e => e.preventDefault()}
          onInteractOutside={e => e.preventDefault()}
        >
          <DialogTitle className="sr-only">Edit content</DialogTitle>

          {/* ── Top bar ── */}
          <header className="flex shrink-0 items-center justify-between border-b bg-card px-5 py-3">
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSaving} className="gap-1.5">
              <X className="size-4" />
              Cancel
            </Button>
            <span className="text-sm font-semibold">
              Edit content
              {item.contentType && (
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-micro font-normal capitalize text-muted-foreground">
                  {item.contentType.replace(/_/g, ' ')}
                </span>
              )}
            </span>
            <Button size="sm" onClick={handleSave} disabled={isSaving} className="gap-1.5">
              {isSaving ? <RefreshCw className="size-3.5 animate-spin" /> : null}
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </header>

          {/* ── Three-column body ── */}
          {/*
            * Three columns only from lg up. The two side panels are `w-80`
            * and `w-64` — 576px of fixed width before the preview gets a
            * pixel — so as an unconditional row this modal could not fit any
            * phone or small tablet: the right-hand text controls sat entirely
            * off screen with no way to reach them. Below lg the columns stack
            * and the whole body scrolls as one.
            */}
          <div className="flex flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">

            {/* ─ LEFT ─────────────────────────────────────────────────────── */}
            {/* Sidebar is a flex-col so the slides list can flex-grow and
                scroll internally while the bottom sections (Mention,
                Prompt, Regenerate Text) stay pinned + always visible.
                Previously the whole sidebar was one ScrollArea — a 4-5
                slide slideshow pushed the Regenerate button below the
                viewport with no scroll cue, making it look like the
                section didn't fit. */}
            <aside className="flex w-full shrink-0 flex-col border-b bg-card lg:h-full lg:w-80 lg:border-b-0 lg:border-r">
              {/* ASSETS — slideshow mode shows slide thumbnails */}
              {isSlideshow ? (
                <section className="flex min-h-0 flex-1 flex-col p-5 pb-3">
                  <p className="mb-3 shrink-0 text-micro font-semibold uppercase tracking-wider text-muted-foreground">
                    Slides (
                    {slides.length}
                    )
                  </p>
                  {/* Fixed height while stacked — `flex-1` has no basis to
                      resolve against in an auto-height column, so the slides
                      list would collapse to zero on mobile. */}
                  <ScrollArea className="h-56 pr-1 lg:h-auto lg:min-h-0 lg:flex-1">
                    <div className="space-y-2">
                      {slides.map((slide, idx) => (
                        <div
                          key={idx}
                          className={`flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 transition-colors ${
                            idx === slideIndex ? 'border-primary bg-primary/5' : 'bg-background hover:bg-muted/50'
                          }`}
                          onClick={() => setSlideIndex(idx)}
                        >
                          <div className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                            {slide.url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={slide.url} alt={`Slide ${idx + 1}`} className="size-full object-cover" />
                            ) : (
                              <div className="flex h-full items-center justify-center">
                                <ImageIcon className="size-4 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1 overflow-hidden">
                            <p className="truncate text-xs font-medium">
                              Slide
                              {idx + 1}
                            </p>
                            {slide.caption && (
                              <p className="truncate text-micro text-muted-foreground">{slide.caption}</p>
                            )}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 shrink-0 text-xs"
                            onClick={(e) => {
                              e.stopPropagation(); markPickerOpen(); setShowSlideSwap(idx);
                            }}
                          >
                            Swap
                          </Button>
                        </div>
                      ))}

                      {/* Add slide */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-2 text-xs"
                        onClick={() => {
                          markPickerOpen(); setShowAddSlide(true);
                        }}
                      >
                        <Plus className="size-3.5" />
                        Add slide
                      </Button>
                    </div>
                  </ScrollArea>
                </section>
              ) : (
                /* VIDEO mode: show video + audio swap. Fixed height section
                   — Assets list is only 2 rows so no need to flex-grow. */
                <section className="shrink-0 p-5 pb-3">
                  <p className="mb-3 text-micro font-semibold uppercase tracking-wider text-muted-foreground">
                    Assets
                  </p>
                  <div className="space-y-2">
                    {/* Video */}
                    <div className="flex items-center gap-3 rounded-xl border bg-background p-2.5">
                      {videoThumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={videoThumb} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <div className="size-10 shrink-0 rounded-lg bg-muted" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium">Video</p>
                        <p className="truncate text-micro text-muted-foreground">Background video</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 text-xs"
                        onClick={() => {
                          markPickerOpen(); setShowVideoSwap(true);
                        }}
                      >
                        Swap
                      </Button>
                    </div>

                    {/* Audio */}
                    <div className="flex items-center gap-3 rounded-xl border bg-background p-2.5">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <VolumeX className="size-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium">Audio</p>
                        <p className="truncate text-micro text-muted-foreground">{audioLabel}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 shrink-0 text-xs"
                        onClick={() => {
                          markPickerOpen(); setShowAudioSwap(true);
                        }}
                      >
                        Swap
                      </Button>
                    </div>
                  </div>
                </section>
              )}

              {/* Pinned bottom section — Mention / Prompt / Regenerate
                  always visible regardless of how tall the slides list
                  above grew. shrink-0 so nothing here collapses. */}
              <div className="flex shrink-0 flex-col gap-4 border-t bg-card p-5">
                {/* MENTION YOUR BUSINESS */}
                <section className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Mention your business?
                    </Label>
                  </div>
                  <Switch checked={mentionBusiness} onCheckedChange={setMentionBusiness} />
                </section>

                <Separator />

                {/* PROMPT */}
                <section>
                  <Label className="mb-2 block text-micro font-semibold uppercase tracking-wider text-muted-foreground">
                    Prompt
                  </Label>
                  <Textarea
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    placeholder="Optional instructions for regeneration…"
                    rows={3}
                    className="resize-none text-xs"
                  />
                </section>

                {regenError && <p className="text-xs text-destructive">{regenError}</p>}

                <Button
                  variant="outline"
                  className="w-full gap-2 text-xs"
                  onClick={handleRegenerate}
                  disabled={isRegenerating || reRollsRemaining <= 0}
                >
                  <RefreshCw className={`size-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                  {isRegenerating ? 'Regenerating…' : 'Regenerate Text'}
                </Button>

                {reRollsRemaining <= 0 && (
                  <p className="text-center text-micro text-muted-foreground">No re-rolls remaining</p>
                )}
              </div>
            </aside>

            {/* ─ CENTER — preview ─────────────────────────────────────────── */}
            <main className="flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden bg-muted/30 p-4 lg:p-6">
              {/* Phone mockup — shorter while stacked so the panels above and
                  below it stay reachable without a long scroll. */}
              <div
                className="relative max-h-[55vh] overflow-hidden rounded-2xl shadow-2xl lg:max-h-[78vh]"
                style={{ aspectRatio: '9/16', width: 'auto' }}
              >
                {isSlideshow ? (
                  /* Slideshow carousel */
                  currentSlideUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={currentSlideUrl} alt={`Slide ${slideIndex + 1}`} className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-2 bg-neutral-900">
                      <ImageIcon className="size-10 text-neutral-600" />
                      <p className="text-xs text-neutral-400">No image</p>
                    </div>
                  )
                ) : (
                  /* Video preview — use <video> if we have a video URL, otherwise fall back to thumbnail image */
                  videoUrl ? (

                    <video
                      src={videoUrl}
                      poster={videoThumb || undefined}
                      className="size-full object-cover"
                      autoPlay
                      muted
                      loop
                      playsInline
                    />
                  ) : videoThumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={videoThumb} alt="Preview" className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center bg-neutral-900">
                      <p className="text-xs text-neutral-400">No preview</p>
                    </div>
                  )
                )}

                {/* Caption overlay — the SAME renderer the posts grid, campaign
                    review, blitz and content-detail previews use, driven by
                    this editor's live control state instead of a saved post.
                    It owns the dim scrim too, so there is no separate one here.

                    This used to be a bespoke block: fontSize * 0.85 (against a
                    canonical * 0.5), line-height 1.375 vs 1.5, padding
                    0.1em/0.3em vs 0.16em/0.42em, a fixed 4px radius, no box
                    shadow, weight 400/700 vs 600/800, and always centred
                    regardless of layout. Editing a caption showed you something
                    the published post would never look like. */}
                <CaptionLayer spec={livePreviewSpec} />

                {/* Slide counter badge */}
                {isSlideshow && slides.length > 0 && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
                    {slides.map((_, i) => (
                      <div
                        key={i}
                        className={`h-1.5 rounded-full transition-all ${
                          i === slideIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/50'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Carousel arrows (slideshow only) */}
              {isSlideshow && slides.length > 1 && (
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={goPrev}
                    disabled={slideIndex === 0}
                  >
                    <ChevronLeft className="size-4" />
                    Prev
                  </Button>
                  <span className="text-meta text-muted-foreground">
                    {slideIndex + 1}
                    {' '}
                    /
                    {slides.length}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={goNext}
                    disabled={slideIndex === slides.length - 1}
                  >
                    Next
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              )}
            </main>

            {/* ─ RIGHT — text controls ────────────────────────────────────── */}
            <ScrollArea className="w-full shrink-0 border-t bg-card lg:h-full lg:w-64 lg:border-l lg:border-t-0">
              <div className="space-y-1 p-4 pb-16">

                {/* TEXT accordion header */}
                <div className="flex items-center gap-2 p-1">
                  <span className="text-sm font-semibold text-muted-foreground">T</span>
                  <span className="text-sm font-semibold">Text</span>
                </div>

                <div className="space-y-4 pt-1">
                  {isSlideshow ? (
                    /* Slideshow: per-slide caption is primary. Post caption is secondary. */
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] text-muted-foreground">
                          Slide
                          {' '}
                          {slideIndex + 1}
                          {' '}
                          text
                        </Label>
                        <Textarea
                          value={slides[slideIndex]?.caption ?? ''}
                          onChange={(e) => {
                            const updated = slides.map((s, i) =>
                              i === slideIndex ? { ...s, caption: e.target.value } : s,
                            );
                            setSlides(updated);
                          }}
                          rows={3}
                          className="resize-none text-xs"
                          placeholder="Text shown on this slide…"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] text-muted-foreground">Post caption (social media)</Label>
                        <Textarea
                          value={item.caption ?? ''}
                          onChange={e => setItem(p => ({ ...p, caption: e.target.value }))}
                          rows={2}
                          className="resize-none text-xs"
                          placeholder="Caption shown on the platform post…"
                        />
                      </div>
                    </>
                  ) : (
                    /* Video types: single overall caption */
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-muted-foreground">Caption</Label>
                      <Textarea
                        value={item.caption ?? ''}
                        onChange={e => setItem(p => ({ ...p, caption: e.target.value }))}
                        rows={3}
                        className="resize-none text-xs"
                      />
                    </div>
                  )}

                  {/* Font — each item rendered in its own typeface (WYSIWYG
                      registry keys shared with the standalone/Blitz editor) */}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] text-muted-foreground">Font</Label>
                    <Select value={fontFamily} onValueChange={setFontFamily}>
                      <SelectTrigger className="h-8 text-xs" style={{ fontFamily }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EDITOR_FONTS.map(name => (
                          <SelectItem key={name} value={name} className="text-xs" style={{ fontFamily: name }}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Size */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] text-muted-foreground">Size</Label>
                      <span className="text-[10px] font-medium">
                        {fontSize}
                        px
                      </span>
                    </div>
                    <Slider
                      min={16}
                      max={120}
                      step={1}
                      value={[fontSize]}
                      onValueChange={([v]) => setFontSize(v!)}
                    />
                  </div>

                  {/* Text color */}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] text-muted-foreground">Color</Label>
                    <ColorField
                      value={textColor}
                      onChange={setTextColor}
                      swatches={TEXT_COLORS}
                      fallbackHex="#ffffff"
                    />
                  </div>

                  {/* Alignment + B / I / U */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-muted-foreground">Align</Label>
                      <SegmentedGroup
                        value={align}
                        onChange={setAlign}
                        options={[
                          { value: 'left', icon: <AlignLeft className="size-3.5" />, title: 'Left' },
                          { value: 'center', icon: <AlignCenter className="size-3.5" />, title: 'Center' },
                          { value: 'right', icon: <AlignRight className="size-3.5" />, title: 'Right' },
                        ]}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-muted-foreground">Format</Label>
                      <div className="flex overflow-hidden rounded-lg border border-border">
                        <button
                          type="button"
                          title="Bold"
                          onClick={() => setWeight(weight === 'bold' ? 'normal' : 'bold')}
                          className={cn(
                            'flex flex-1 items-center justify-center py-2 transition-colors',
                            weight === 'bold'
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                          )}
                        >
                          <Bold className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Italic"
                          onClick={() => setItalic(!italic)}
                          className={cn(
                            'flex flex-1 items-center justify-center border-l border-border py-2 transition-colors',
                            italic
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                          )}
                        >
                          <Italic className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Underline"
                          onClick={() => setUnderline(!underline)}
                          className={cn(
                            'flex flex-1 items-center justify-center border-l border-border py-2 transition-colors',
                            underline
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                          )}
                        >
                          <Underline className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Text background (per-line highlight) */}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] text-muted-foreground">Text background</Label>
                    <div className="space-y-2">
                      <SegmentedGroup
                        value={backgroundColor}
                        onChange={setBackgroundColor}
                        options={TEXT_BG_PRESETS.map(p => ({ value: p.value, label: p.label }))}
                      />
                      <ColorField
                        value={backgroundColor}
                        onChange={setBackgroundColor}
                        fallbackHex="#000000"
                      />
                    </div>
                  </div>

                  {/* Background dim */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] text-muted-foreground">Background dim</Label>
                      <span className="text-[10px] font-medium">
                        {Math.round(backgroundDimming * 100)}
                        %
                      </span>
                    </div>
                    <Slider
                      min={0}
                      max={80}
                      step={1}
                      value={[Math.round(backgroundDimming * 100)]}
                      onValueChange={([v]) => setBackgroundDimming((v ?? 0) / 100)}
                    />
                  </div>

                  {/* CTA button color */}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] text-muted-foreground">CTA button color</Label>
                    <ColorField
                      value={ctaBackgroundColor}
                      onChange={setCtaBackgroundColor}
                      swatches={CTA_COLORS}
                      fallbackHex="#864FFE"
                    />
                  </div>

                  {/* Text visibility — video only (matches the shared TextTab
                      section). Hiding a field takes it off the PREVIEW and the
                      RENDERED video; the copy stays in `script` and still
                      publishes as post content. */}
                  {isVideo && (
                    <div className="space-y-2 rounded-lg border border-border p-3">
                      <div>
                        <span className="text-xs font-medium text-foreground">Text visibility</span>
                        <p className="text-[10px] text-muted-foreground">Hide from video only — copy still posts</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-foreground">Hook</span>
                        <Switch
                          checked={showHook}
                          onCheckedChange={setShowHook}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-foreground">Body</span>
                        <Switch
                          checked={showBody}
                          onCheckedChange={setShowBody}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-foreground">CTA</span>
                        <Switch
                          checked={showCta}
                          onCheckedChange={setShowCta}
                        />
                      </div>
                    </div>
                  )}

                  {/* Animation — video only (matches the shared TextTab gate) */}
                  {isVideo && (
                    <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                      <div>
                        <span className="text-xs font-medium text-foreground">Animation</span>
                        <p className="text-[10px] text-muted-foreground">Sequential text fade-in</p>
                      </div>
                      <Switch
                        checked={!noAnimation}
                        onCheckedChange={checked => setNoAnimation(!checked)}
                      />
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* Slide swap picker (image only) */}
      {showSlideSwap !== null && (
        <MediaPickerModal
          open
          onClose={() => {
            markPickerClosed(); setShowSlideSwap(null);
          }}
          onSelect={(url) => {
            const idx = showSlideSwap;
            setSlides(prev => prev.map((s, i) => (i === idx ? { ...s, url } : s)));
            if (slideIndex !== idx) {
              setSlideIndex(idx);
            }
            markPickerClosed();
            setShowSlideSwap(null);
          }}
          title={`Replace Slide ${showSlideSwap + 1}`}
          mediaType="image"
        />
      )}

      {/* Add slide picker (image only) */}
      <MediaPickerModal
        open={showAddSlide}
        onClose={() => {
          markPickerClosed(); setShowAddSlide(false);
        }}
        onSelect={(url) => {
          setSlides((prev) => {
            const next = [...prev, { url }];
            setSlideIndex(next.length - 1);
            return next;
          });
          markPickerClosed();
          setShowAddSlide(false);
        }}
        title="Add Slide"
        mediaType="image"
      />

      {/* Video swap picker */}
      <MediaPickerModal
        open={showVideoSwap}
        onClose={() => {
          markPickerClosed(); setShowVideoSwap(false);
        }}
        onSelect={(url) => {
          // If selected URL is a video file, use as videoUrl; otherwise use as thumb
          if (EDITOR_VIDEO_RE.test(url)) {
            setVideoUrl(url);
          } else {
            setVideoThumb(url);
          }
          markPickerClosed();
          setShowVideoSwap(false);
        }}
        title="Select Video"
        mediaType="video"
      />

      {/* Audio swap picker — dedicated audio library modal (matches the
          Audio tab in the standalone video editor). Formerly this opened
          MediaPickerModal with mediaType="all", which surfaced images. */}
      {showAudioSwap && (
        <AudioSelectModal
          onSelect={(track: AudioSelection) => {
            setAudioTrack({ name: track.name, url: track.url, publicId: track.publicId });
            markPickerClosed();
            setShowAudioSwap(false);
          }}
          onClose={() => {
            markPickerClosed(); setShowAudioSwap(false);
          }}
        />
      )}
    </>
  );
}
