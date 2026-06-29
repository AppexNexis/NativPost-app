'use client';

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  // ChevronDown,
  ImageIcon,
  Italic,
  Layout,
  Music,
  Type,
  Underline,
  Video,
  Wand2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { ContentTemplate, TemplateStructure } from '@/types/v2';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------
export interface RemixEdits {
  structure: TemplateStructure;
  style: TextStyle;
  layout: TemplateLayout;
  mediaReplacements: MediaReplacement[];
  audioTrack?: {
    name: string;
    url: string;
    source: 'library' | 'upload' | 'original';
  };
}

interface TextStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  backgroundColor: string;
  align: 'left' | 'center' | 'right';
  weight: 'normal' | 'bold';
  italic: boolean;
  underline: boolean;
}

type TemplateLayout =
  | 'wall_of_text'
  | 'split_screen'
  | 'centered'
  | 'bottom_caption'
  | 'top_caption';

interface MediaReplacement {
  id: string;
  slot: 'background' | 'slide' | 'hook_video' | 'b_roll';
  label: string;
  currentUrl: string;
  newUrl?: string;
  newPublicId?: string;
}

interface RemixEditorProps {
  template: ContentTemplate;
  initialEdits?: Partial<RemixEdits>;
  onChange: (edits: RemixEdits) => void;
  onGenerate: () => void;
  isGenerating: boolean;
}

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const FONT_OPTIONS = [
  { value: 'Inter', label: 'Inter' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Impact', label: 'Impact' },
  { value: 'Oswald', label: 'Oswald' },
  { value: 'Poppins', label: 'Poppins' },
  { value: 'Roboto', label: 'Roboto' },
];

const LAYOUT_OPTIONS: { value: TemplateLayout; label: string; icon: React.ElementType }[] = [
  { value: 'wall_of_text', label: 'Wall of Text', icon: Type },
  { value: 'split_screen', label: 'Split Screen', icon: Layout },
  { value: 'centered', label: 'Centered', icon: AlignCenter },
  { value: 'bottom_caption', label: 'Bottom Caption', icon: AlignLeft },
  { value: 'top_caption', label: 'Top Caption', icon: AlignLeft },
];

const COLOR_SWATCHES = [
  '#ffffff', '#000000', '#ef4444', '#f97316', '#f59e0b',
  '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
  '#8b5cf6', '#d946ef', '#f43f5e',
];

const DEFAULT_STYLE: TextStyle = {
  fontFamily: 'Inter',
  fontSize: 28,
  color: '#ffffff',
  backgroundColor: 'rgba(0,0,0,0.5)',
  align: 'center',
  weight: 'bold',
  italic: false,
  underline: false,
};

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
function isVideoUrl(url?: string | null): boolean {
  if (!url) return false;
  return /\.(?:mp4|mov|webm|avi)(?:[/?#]|$)/i.test(url) || url.includes('cloudinary.com') && url.includes('/video/');
}

function ensureStructure(structure?: TemplateStructure | null): TemplateStructure {
  const s = structure || {};
  return {
    hook: s.hook || { text: 'Hook text', duration: 3, visualType: 'text_overlay' },
    body: s.body || { text: 'Body text', duration: 8 },
    cta: s.cta || { text: 'Call to action', duration: 2 },
    transitions: s.transitions || ['quick_cut'],
    musicStyle: s.musicStyle || 'upbeat_lofi',
    textOverlayStyle: s.textOverlayStyle || 'bold_caption',
  };
}

function buildMediaReplacements(template: ContentTemplate): MediaReplacement[] {
  const reps: MediaReplacement[] = [];
  const structure = template.structure || {};

  // Background / main video
  if (template.mediaUrl) {
    reps.push({
      id: 'background',
      slot: 'background',
      label: isVideoUrl(template.mediaUrl) ? 'Background video' : 'Background image',
      currentUrl: template.mediaUrl,
    });
  }

  // Slides for slideshow
  if (template.contentType === 'slideshow') {
    // We don't have explicit slide URLs in the current schema, so we use the
    // thumbnail as a placeholder. In a full implementation these would come from
    // template.slides or a related media_set.
    reps.push({
      id: 'slide-1',
      slot: 'slide',
      label: 'Slide 1',
      currentUrl: template.thumbnailUrl,
    });
  }

  // Hook video placeholder
  if (structure.hook?.visualType === 'b_roll' && template.mediaUrl) {
    reps.push({
      id: 'hook-video',
      slot: 'hook_video',
      label: 'Hook video',
      currentUrl: template.mediaUrl,
    });
  }

  return reps;
}

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------
export function RemixEditor({
  template,
  initialEdits,
  onChange,
  onGenerate,
  isGenerating,
}: RemixEditorProps) {
  const [structure, setStructure] = useState<TemplateStructure>(() =>
    ensureStructure(initialEdits?.structure ?? template.structure),
  );
  const [style, setStyle] = useState<TextStyle>(() => initialEdits?.style ?? DEFAULT_STYLE);
  const [layout, setLayout] = useState<TemplateLayout>(initialEdits?.layout ?? 'centered');
  const [mediaReplacements, setMediaReplacements] = useState<MediaReplacement[]>(() =>
    initialEdits?.mediaReplacements ?? buildMediaReplacements(template),
  );
  const [audioTrack, setAudioTrack] = useState<RemixEdits['audioTrack']>(
    initialEdits?.audioTrack ?? { name: 'Original audio', url: template.mediaUrl || '', source: 'original' },
  );
  const [activeTab, setActiveTab] = useState<'text' | 'media' | 'audio' | 'layout'>('text');
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);

  const edits = useMemo<RemixEdits>(
    () => ({ structure, style, layout, mediaReplacements, audioTrack }),
    [structure, style, layout, mediaReplacements, audioTrack],
  );

  useEffect(() => {
    onChange(edits);
  }, [edits, onChange]);

  const updateStructureText = (
    key: 'hook' | 'body' | 'cta',
    field: 'text' | 'duration',
    value: string | number,
  ) => {
    setStructure((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const handleMediaUpload = async (slotId: string, file: File) => {
    setUploadingSlot(slotId);
    try {
      // Build params to sign
      const timestamp = Math.round(Date.now() / 1000);
      const paramsToSign: Record<string, any> = {
        timestamp,
        folder: 'nativpost/remix',
        tags: 'remix-upload',
      };

      const signatureRes = await fetch('/api/media-library/signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paramsToSign }),
      });
      if (!signatureRes.ok) throw new Error('Failed to get upload signature');
      const sig = await signatureRes.json();

      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', sig.apiKey);
      formData.append('timestamp', String(sig.timestamp));
      formData.append('signature', sig.signature);
      formData.append('folder', paramsToSign.folder);
      formData.append('tags', paramsToSign.tags);

      const uploadRes = await fetch(
        `https://api.cloudinary.com/v1_1/${sig.cloudName}/${file.type.startsWith('video') ? 'video' : 'image'}/upload`,
        { method: 'POST', body: formData },
      );

      if (!uploadRes.ok) throw new Error('Cloudinary upload failed');
      const data = await uploadRes.json();

      setMediaReplacements((prev) =>
        prev.map((r) =>
          r.id === slotId
            ? { ...r, newUrl: data.secure_url, newPublicId: data.public_id }
            : r,
        ),
      );
    } catch (err) {
      console.error('[RemixEditor] Upload failed:', err);
      alert('Upload failed. Please try again.');
    } finally {
      setUploadingSlot(null);
    }
  };

  const previewUrl = mediaReplacements.find((r) => r.id === 'background')?.newUrl
    || template.mediaUrl
    || template.thumbnailUrl;

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* Preview */}
      <div className="lg:col-span-3">
        <div className="sticky top-6 space-y-4">
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="border-b px-4 py-3">
              <h3 className="text-sm font-semibold">Preview</h3>
            </div>
            <div className="relative flex items-center justify-center bg-black p-4">
              <div
                className="relative overflow-hidden rounded-lg bg-zinc-900"
                style={{
                  width: '100%',
                  maxWidth: 360,
                  aspectRatio: template.aspectRatio?.replace(':', '/') || '9/16',
                }}
              >
                {isVideoUrl(previewUrl) ? (
                  <video
                    src={previewUrl}
                    className="size-full object-cover"
                    controls
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <img
                    src={previewUrl}
                    alt="Template preview"
                    className="size-full object-cover"
                  />
                )}

                {/* Text overlay preview */}
                <div
                  className={`absolute inset-0 flex flex-col ${
                    layout === 'bottom_caption'
                      ? 'justify-end'
                      : layout === 'top_caption'
                      ? 'justify-start'
                      : layout === 'centered'
                      ? 'items-center justify-center'
                      : 'items-center justify-center'
                  } p-4`}
                >
                  {(['hook', 'body', 'cta'] as const).map((key) => {
                    const segment = structure[key];
                    if (!segment) return null;
                    return (
                      <div
                        key={key}
                        className="mb-2 max-w-full rounded px-2 py-1"
                        style={{
                          fontFamily: style.fontFamily,
                          fontSize: `${style.fontSize * (key === 'hook' ? 1.1 : key === 'cta' ? 0.9 : 1)}px`,
                          color: style.color,
                          backgroundColor: style.backgroundColor,
                          textAlign: style.align,
                          fontWeight: style.weight,
                          fontStyle: style.italic ? 'italic' : 'normal',
                          textDecoration: style.underline ? 'underline' : 'none',
                          lineHeight: 1.25,
                        }}
                      >
                        {segment.text}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="border-t px-4 py-3">
              <p className="text-xs text-muted-foreground">
                This is a live preview. Final rendered media may differ slightly.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onGenerate}
            disabled={isGenerating}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <Wand2 className="size-4" />
            {isGenerating ? 'Generating...' : 'Generate variants'}
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="lg:col-span-2">
        <div className="rounded-xl border bg-card">
          <div className="flex border-b">
            {([
              { id: 'text', label: 'Text', icon: Type },
              { id: 'layout', label: 'Layout', icon: Layout },
              { id: 'media', label: 'Media', icon: ImageIcon },
              { id: 'audio', label: 'Audio', icon: Music },
            ] as const).map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-3 text-xs font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'border-b-2 border-primary text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="size-3.5" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="p-4">
            {activeTab === 'text' && (
              <div className="space-y-5">
                {(['hook', 'body', 'cta'] as const).map((key) => {
                  const segment = structure[key];
                  if (!segment) return null;
                  const labels = { hook: 'Hook', body: 'Body', cta: 'CTA' };
                  return (
                    <div key={key}>
                      <label className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <span>{labels[key]}</span>
                        <span className="font-normal normal-case text-muted-foreground/60">
                          {segment.duration}s
                        </span>
                      </label>
                      <textarea
                        value={segment.text}
                        onChange={(e) => updateStructureText(key, 'text', e.target.value)}
                        rows={key === 'body' ? 4 : 2}
                        className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      <input
                        type="range"
                        min={1}
                        max={30}
                        value={segment.duration}
                        onChange={(e) => updateStructureText(key, 'duration', Number(e.target.value))}
                        className="mt-2 w-full"
                      />
                    </div>
                  );
                })}

                <hr />

                {/* Style controls */}
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Font
                    </label>
                    <select
                      value={style.fontFamily}
                      onChange={(e) => setStyle((s) => ({ ...s, fontFamily: e.target.value }))}
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                    >
                      {FONT_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Size: {style.fontSize}px
                    </label>
                    <input
                      type="range"
                      min={12}
                      max={72}
                      value={style.fontSize}
                      onChange={(e) => setStyle((s) => ({ ...s, fontSize: Number(e.target.value) }))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Text color
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {COLOR_SWATCHES.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setStyle((s) => ({ ...s, color: c }))}
                          className={`size-7 rounded-full border-2 ${
                            style.color === c ? 'border-primary' : 'border-transparent'
                          }`}
                          style={{ backgroundColor: c }}
                          title={c}
                        />
                      ))}
                      <input
                        type="color"
                        value={style.color}
                        onChange={(e) => setStyle((s) => ({ ...s, color: e.target.value }))}
                        className="size-7 cursor-pointer rounded-full border-0 p-0"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Background
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        'rgba(0,0,0,0.5)',
                        'rgba(0,0,0,0.8)',
                        'rgba(255,255,255,0.5)',
                        'rgba(255,255,255,0.8)',
                        'transparent',
                      ].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setStyle((s) => ({ ...s, backgroundColor: c }))}
                          className={`size-7 rounded border-2 ${
                            style.backgroundColor === c ? 'border-primary' : 'border-border'
                          }`}
                          style={{ backgroundColor: c === 'transparent' ? '#f3f4f6' : c }}
                          title={c}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {(
                      [
                        { key: 'align', value: 'left', icon: AlignLeft },
                        { key: 'align', value: 'center', icon: AlignCenter },
                        { key: 'align', value: 'right', icon: AlignRight },
                      ] as const
                    ).map((opt) => {
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setStyle((s) => ({ ...s, align: opt.value }))}
                          className={`flex flex-1 items-center justify-center rounded-lg border py-2 ${
                            style.align === opt.value
                              ? 'border-primary bg-primary/5 text-primary'
                              : 'hover:bg-muted'
                          }`}
                        >
                          <Icon className="size-4" />
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setStyle((s) => ({ ...s, weight: s.weight === 'bold' ? 'normal' : 'bold' }))}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-medium ${
                        style.weight === 'bold'
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'hover:bg-muted'
                      }`}
                    >
                      <Bold className="size-3.5" /> Bold
                    </button>
                    <button
                      type="button"
                      onClick={() => setStyle((s) => ({ ...s, italic: !s.italic }))}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-medium ${
                        style.italic
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'hover:bg-muted'
                      }`}
                    >
                      <Italic className="size-3.5" /> Italic
                    </button>
                    <button
                      type="button"
                      onClick={() => setStyle((s) => ({ ...s, underline: !s.underline }))}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-medium ${
                        style.underline
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'hover:bg-muted'
                      }`}
                    >
                      <Underline className="size-3.5" /> Underline
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'layout' && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Choose how text and media are composed in the final video.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {LAYOUT_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setLayout(opt.value)}
                        className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all ${
                          layout === opt.value
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'hover:border-muted-foreground/30 hover:bg-muted/30'
                        }`}
                      >
                        <Icon className="size-6" />
                        <span className="text-xs font-medium">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'media' && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Replace background video, images, or individual slides.
                </p>
                {mediaReplacements.map((rep) => (
                  <div key={rep.id} className="rounded-lg border bg-muted/30 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium">{rep.label}</span>
                      {rep.newUrl && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          Replaced
                        </span>
                      )}
                    </div>
                    <div className="relative mb-2 aspect-video overflow-hidden rounded-lg bg-black">
                      {isVideoUrl(rep.newUrl || rep.currentUrl) ? (
                        <video
                          src={rep.newUrl || rep.currentUrl}
                          className="size-full object-cover"
                          controls
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        <img
                          src={rep.newUrl || rep.currentUrl}
                          alt={rep.label}
                          className="size-full object-cover"
                        />
                      )}
                    </div>
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs font-medium transition-colors hover:bg-muted">
                      <Video className="size-3.5" />
                      {uploadingSlot === rep.id ? 'Uploading...' : 'Upload replacement'}
                      <input
                        type="file"
                        accept="image/*,video/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleMediaUpload(rep.id, file);
                        }}
                        disabled={uploadingSlot === rep.id}
                      />
                    </label>
                    {rep.newUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          setMediaReplacements((prev) =>
                            prev.map((r) =>
                              r.id === rep.id ? { ...r, newUrl: undefined, newPublicId: undefined } : r,
                            ),
                          )
                        }
                        className="mt-2 w-full text-xs text-muted-foreground hover:text-foreground"
                      >
                        Revert to original
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'audio' && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Replace the audio track. Full audio library coming soon.
                </p>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-sm font-medium">Current track</p>
                  <p className="text-xs text-muted-foreground">{audioTrack?.name || 'Original audio'}</p>
                </div>
                <div className="space-y-2">
                  {[
                    { name: 'Original audio', source: 'original' as const },
                    { name: 'Upbeat Lo-Fi', source: 'library' as const },
                    { name: 'Energetic Pop', source: 'library' as const },
                    { name: 'Calm Acoustic', source: 'library' as const },
                    { name: 'No audio / Mute', source: 'library' as const },
                  ].map((track) => (
                    <button
                      key={track.name}
                      type="button"
                      onClick={() =>
                        setAudioTrack({
                          name: track.name,
                          url: track.source === 'original' ? template.mediaUrl || '' : '',
                          source: track.source,
                        })
                      }
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                        audioTrack?.name === track.name
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'hover:bg-muted'
                      }`}
                    >
                      <span>{track.name}</span>
                      {audioTrack?.name === track.name && <CheckIcon />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}
