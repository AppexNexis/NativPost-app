'use client';

import { useCallback, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Plus,
  RefreshCw,
  VolumeX,
  X,
} from 'lucide-react';

import type { ContentItem } from '@/types/v2';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { MediaPickerModal } from '@/components/media/MediaPickerModal';

export type CampaignPostEditModalProps = {
  campaignId: string;
  contentItem: ContentItem;
  reRollsRemaining: number;
  onCancel: () => void;
  onSaved: (updated: ContentItem) => void;
};

const FONTS = [
  { label: 'System UI', value: 'ui-sans-serif, system-ui, sans-serif' },
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Courier', value: 'Courier New, monospace' },
];

const WEIGHTS: { label: string; value: number }[] = [
  { label: 'Light', value: 300 },
  { label: 'Regular', value: 400 },
  { label: 'Medium', value: 500 },
  { label: 'Semi-bold', value: 600 },
  { label: 'Bold', value: 700 },
];

type SlideEntry = { url: string; caption?: string };

function resolveSlides(enrichment: Record<string, unknown>): SlideEntry[] {
  const mediaSlots = (enrichment.sourceMediaSlots ?? {}) as Record<string, unknown>;
  const rawSlides = mediaSlots.slides;
  if (Array.isArray(rawSlides) && rawSlides.length > 0) {
    return rawSlides
      .filter((s): s is Record<string, unknown> => s && typeof s === 'object')
      .map((s) => ({ url: String(s.url ?? ''), caption: s.caption ? String(s.caption) : undefined }))
      .filter((s) => !!s.url);
  }
  return [];
}

function resolveVideoThumb(enrichment: Record<string, unknown>, graphicUrls?: string[]): string {
  const mediaSlots = (enrichment.sourceMediaSlots ?? {}) as Record<string, unknown>;
  const bg = (mediaSlots.background ?? {}) as Record<string, unknown>;
  const snapshot = (enrichment.templateSnapshot ?? {}) as Record<string, unknown>;
  // Prefer thumbnail over raw video url for preview
  const thumb =
    String(bg.thumbnailUrl ?? '') ||
    String(snapshot.thumbnailUrl ?? '') ||
    (Array.isArray(graphicUrls) ? String(graphicUrls[0] ?? '') : '');
  return thumb;
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
  const textStyle = (script.textStyle ?? {}) as Record<string, unknown>;

  const isSlideshow = item.contentType === 'slideshow';

  // ── Slides state (slideshow mode) ─────────────────────────────────────────
  const [slides, setSlides] = useState<SlideEntry[]>(() => resolveSlides(enrichment));
  const [slideIndex, setSlideIndex] = useState(0);
  const [showSlideSwap, setShowSlideSwap] = useState<number | null>(null);
  const [showAddSlide, setShowAddSlide] = useState(false);

  // ── Video asset state ──────────────────────────────────────────────────────
  const [videoThumb, setVideoThumb] = useState(() => resolveVideoThumb(enrichment, item.graphicUrls as string[]));
  const [audioLabel, setAudioLabel] = useState<string>('Audio track');
  const [showVideoSwap, setShowVideoSwap] = useState(false);
  const [showAudioSwap, setShowAudioSwap] = useState(false);

  // ── Left panel ────────────────────────────────────────────────────────────
  const [mentionBusiness, setMentionBusiness] = useState(() => {
    const mf = String(enrichment.mentionFrequency ?? '');
    return mf === 'always' || mf === 'often';
  });
  const [prompt, setPrompt] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  // ── Right panel — text style ──────────────────────────────────────────────
  const [fontFamily, setFontFamily] = useState(String(textStyle.fontFamily ?? FONTS[0]!.value));
  const [fontWeight, setFontWeight] = useState(Number(textStyle.fontWeight ?? 500));
  const [fontSize, setFontSize] = useState(Number(textStyle.fontSize ?? 16));
  const [textColor, setTextColor] = useState(String(textStyle.color ?? '#FFFFFF'));
  const [strokeWidth, setStrokeWidth] = useState(Number(textStyle.strokeWidth ?? 3));
  const [strokeColor, setStrokeColor] = useState(String(textStyle.strokeColor ?? '#000000'));
  const [background, setBackground] = useState<'white' | 'none' | 'snapchat'>(
    (textStyle.background as 'white' | 'none' | 'snapchat') ?? 'none',
  );

  // ── Saving ────────────────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false);

  // ── Derived ───────────────────────────────────────────────────────────────
  const overlayText = String(script.hookText ?? script.bodyText ?? item.caption ?? '');
  const STROKE_DIRS: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const tShadow =
    strokeWidth > 0
      ? STROKE_DIRS.map(([dx, dy]) => `${strokeColor} ${dx * strokeWidth}px ${dy * strokeWidth}px 0`).join(', ')
      : 'none';
  const bgStyle: React.CSSProperties =
    background === 'white'
      ? { backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 4, padding: '4px 8px' }
      : background === 'snapchat'
        ? { backgroundColor: '#FFFC00', borderRadius: 4, padding: '4px 8px' }
        : {};

  const handleRegenerate = useCallback(async () => {
    if (isRegenerating || reRollsRemaining <= 0) return;
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
      if (!res.ok) throw new Error(data.error ?? 'Regeneration failed');
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
    if (isSaving) return;
    setIsSaving(true);
    try {
      const updatedSlots = isSlideshow
        ? {
            ...(enrichment.sourceMediaSlots as Record<string, unknown> ?? {}),
            slides: slides.map((s) => ({ url: s.url, caption: s.caption })),
          }
        : enrichment.sourceMediaSlots;

      const updatedEnrichment = {
        ...enrichment,
        mentionFrequency: mentionBusiness ? 'often' : 'never',
        sourceMediaSlots: updatedSlots,
        editorScript: {
          ...(script as Record<string, unknown>),
          textStyle: { fontFamily, fontWeight, fontSize, color: textColor, strokeWidth, strokeColor, background },
        },
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
    isSaving, item, onSaved, enrichment, script, isSlideshow, slides,
    mentionBusiness, fontFamily, fontWeight, fontSize, textColor, strokeWidth, strokeColor, background,
  ]);

  // ── Slide nav helpers ─────────────────────────────────────────────────────
  const goPrev = () => setSlideIndex((i) => Math.max(0, i - 1));
  const goNext = () => setSlideIndex((i) => Math.min(slides.length - 1, i + 1));

  const currentSlideUrl = slides[slideIndex]?.url ?? '';

  return (
    <>
      <Dialog open onOpenChange={(o) => { if (!o) onCancel(); }}>
        <DialogContent className="flex h-screen max-h-screen w-screen max-w-screen flex-col gap-0 rounded-none p-0 [&>button]:hidden">
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
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-normal text-muted-foreground capitalize">
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
          <div className="flex flex-1 overflow-hidden">

            {/* ─ LEFT ─────────────────────────────────────────────────────── */}
            <ScrollArea className="w-72 shrink-0 border-r bg-card">
              <div className="space-y-6 p-5">

                {/* ASSETS — slideshow mode shows slide thumbnails */}
                {isSlideshow ? (
                  <section>
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Slides ({slides.length})
                    </p>
                    <div className="space-y-2">
                      {slides.map((slide, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center gap-3 rounded-xl border p-2.5 cursor-pointer transition-colors ${
                            idx === slideIndex ? 'border-primary bg-primary/5' : 'bg-background hover:bg-muted/50'
                          }`}
                          onClick={() => setSlideIndex(idx)}
                        >
                          <div className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                            {slide.url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={slide.url} alt={`Slide ${idx + 1}`} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full items-center justify-center">
                                <ImageIcon className="size-4 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium">Slide {idx + 1}</p>
                            {slide.caption && (
                              <p className="truncate text-[11px] text-muted-foreground">{slide.caption}</p>
                            )}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0 h-7 text-xs"
                            onClick={(e) => { e.stopPropagation(); setShowSlideSwap(idx); }}
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
                        onClick={() => setShowAddSlide(true)}
                      >
                        <Plus className="size-3.5" />
                        Add slide
                      </Button>
                    </div>
                  </section>
                ) : (
                  /* VIDEO mode: show video + audio swap */
                  <section>
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                          <p className="truncate text-[11px] text-muted-foreground">Background video</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 h-7 text-xs"
                          onClick={() => setShowVideoSwap(true)}
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
                          <p className="truncate text-[11px] text-muted-foreground">{audioLabel}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 h-7 text-xs"
                          onClick={() => setShowAudioSwap(true)}
                        >
                          Swap
                        </Button>
                      </div>
                    </div>
                  </section>
                )}

                <Separator />

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
                  <Label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Prompt
                  </Label>
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Optional instructions for regeneration…"
                    rows={4}
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
                  <p className="text-center text-[11px] text-muted-foreground">No re-rolls remaining</p>
                )}
              </div>
            </ScrollArea>

            {/* ─ CENTER — preview ─────────────────────────────────────────── */}
            <main className="flex flex-1 flex-col items-center justify-center overflow-hidden bg-muted/30 p-6 gap-4">
              {/* Phone mockup */}
              <div
                className="relative overflow-hidden rounded-2xl shadow-2xl"
                style={{ aspectRatio: '9/16', maxHeight: '78vh', width: 'auto' }}
              >
                {isSlideshow ? (
                  /* Slideshow carousel */
                  currentSlideUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={currentSlideUrl} alt={`Slide ${slideIndex + 1}`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-neutral-900">
                      <ImageIcon className="size-10 text-neutral-600" />
                      <p className="text-xs text-neutral-400">No image</p>
                    </div>
                  )
                ) : (
                  /* Video preview */
                  videoThumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={videoThumb} alt="Preview" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-neutral-900">
                      <p className="text-xs text-neutral-400">No preview</p>
                    </div>
                  )
                )}

                {/* Centered overlay text */}
                {overlayText && (
                  <div className="absolute inset-0 flex items-center justify-center px-4 pointer-events-none">
                    <p
                      className="text-center font-semibold leading-snug"
                      style={{
                        fontFamily,
                        fontWeight,
                        fontSize: `${Math.max(10, Math.round(fontSize * 0.85))}px`,
                        color: textColor,
                        textShadow: tShadow,
                        maxWidth: '90%',
                        ...bgStyle,
                      }}
                    >
                      {item.caption || overlayText}
                    </p>
                  </div>
                )}

                {/* Slide counter badge */}
                {isSlideshow && slides.length > 0 && (
                  <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 pointer-events-none">
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
                  <span className="text-xs text-muted-foreground">
                    {slideIndex + 1} / {slides.length}
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
            <ScrollArea className="w-64 shrink-0 border-l bg-card">
              <div className="space-y-1 p-4">

                {/* TEXT accordion header */}
                <div className="flex items-center gap-2 px-1 py-1">
                  <span className="text-sm font-semibold text-muted-foreground">T</span>
                  <span className="text-sm font-semibold">Text</span>
                </div>

                <div className="space-y-4 pt-1">
                  {/* Editable caption */}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] text-muted-foreground">Caption</Label>
                    <Textarea
                      value={item.caption ?? ''}
                      onChange={(e) => setItem((p) => ({ ...p, caption: e.target.value }))}
                      rows={3}
                      className="resize-none text-xs"
                    />
                  </div>

                  {/* Slide caption (slideshow only) */}
                  {isSlideshow && slides[slideIndex] !== undefined && (
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-muted-foreground">Slide {slideIndex + 1} text</Label>
                      <Textarea
                        value={slides[slideIndex]?.caption ?? ''}
                        onChange={(e) => {
                          const updated = slides.map((s, i) =>
                            i === slideIndex ? { ...s, caption: e.target.value } : s,
                          );
                          setSlides(updated);
                        }}
                        rows={2}
                        className="resize-none text-xs"
                      />
                    </div>
                  )}

                  {/* Font */}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] text-muted-foreground">Font</Label>
                    <Select value={fontFamily} onValueChange={setFontFamily}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FONTS.map((f) => (
                          <SelectItem key={f.value} value={f.value} className="text-xs">
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Weight */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] text-muted-foreground">Weight</Label>
                      <span className="text-[10px] font-medium">
                        {WEIGHTS.find((w) => w.value === fontWeight)?.label ?? fontWeight}
                      </span>
                    </div>
                    <Slider
                      min={300}
                      max={700}
                      step={100}
                      value={[fontWeight]}
                      onValueChange={([v]) => setFontWeight(v!)}
                    />
                  </div>

                  {/* Size */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] text-muted-foreground">Size</Label>
                      <span className="text-[10px] font-medium">{fontSize}px</span>
                    </div>
                    <Slider
                      min={8}
                      max={48}
                      step={1}
                      value={[fontSize]}
                      onValueChange={([v]) => setFontSize(v!)}
                    />
                  </div>

                  {/* Color */}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] text-muted-foreground">Color</Label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={textColor}
                        onChange={(e) => setTextColor(e.target.value)}
                        className="size-8 cursor-pointer rounded-md border"
                      />
                      <input
                        type="text"
                        value={textColor.toUpperCase()}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setTextColor(v);
                        }}
                        className="h-8 flex-1 rounded-md border bg-background px-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                        maxLength={7}
                      />
                    </div>
                  </div>

                  {/* Stroke width */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] text-muted-foreground">Stroke</Label>
                      <span className="text-[10px] font-medium">{strokeWidth}px</span>
                    </div>
                    <Slider
                      min={0}
                      max={10}
                      step={0.5}
                      value={[strokeWidth]}
                      onValueChange={([v]) => setStrokeWidth(v!)}
                    />
                  </div>

                  {/* Stroke color */}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] text-muted-foreground">Stroke Color</Label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={strokeColor}
                        onChange={(e) => setStrokeColor(e.target.value)}
                        className="size-8 cursor-pointer rounded-md border"
                      />
                      <input
                        type="text"
                        value={strokeColor.toUpperCase()}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setStrokeColor(v);
                        }}
                        className="h-8 flex-1 rounded-md border bg-background px-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                        maxLength={7}
                      />
                    </div>
                  </div>

                  {/* Background */}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] text-muted-foreground">Background</Label>
                    <div className="flex gap-1.5">
                      {(['white', 'none', 'snapchat'] as const).map((bg) => (
                        <button
                          key={bg}
                          type="button"
                          onClick={() => setBackground(bg)}
                          className={`flex-1 rounded-lg border px-2 py-1.5 text-[10px] font-medium capitalize transition-colors ${
                            background === bg
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border bg-background text-foreground hover:bg-muted'
                          }`}
                        >
                          {bg === 'snapchat' ? 'Snap' : bg.charAt(0).toUpperCase() + bg.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
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
          onClose={() => setShowSlideSwap(null)}
          onSelect={(url) => {
            const idx = showSlideSwap;
            setSlides((prev) => prev.map((s, i) => (i === idx ? { ...s, url } : s)));
            if (slideIndex !== idx) setSlideIndex(idx);
            setShowSlideSwap(null);
          }}
          title={`Replace Slide ${showSlideSwap + 1}`}
          mediaType="image"
        />
      )}

      {/* Add slide picker (image only) */}
      <MediaPickerModal
        open={showAddSlide}
        onClose={() => setShowAddSlide(false)}
        onSelect={(url) => {
          setSlides((prev) => {
            const next = [...prev, { url }];
            setSlideIndex(next.length - 1);
            return next;
          });
          setShowAddSlide(false);
        }}
        title="Add Slide"
        mediaType="image"
      />

      {/* Video swap picker */}
      <MediaPickerModal
        open={showVideoSwap}
        onClose={() => setShowVideoSwap(false)}
        onSelect={(url) => { setVideoThumb(url); setShowVideoSwap(false); }}
        title="Select Video"
        mediaType="video"
      />

      {/* Audio swap picker */}
      <MediaPickerModal
        open={showAudioSwap}
        onClose={() => setShowAudioSwap(false)}
        onSelect={(url) => { setAudioLabel(url.split('/').pop() ?? 'Audio track'); setShowAudioSwap(false); }}
        title="Select Audio Track"
        mediaType="all"
      />
    </>
  );
}
