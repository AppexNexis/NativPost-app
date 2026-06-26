'use client';

import {
  Check,
  ChevronDown,
  FileVideo,
  HelpCircle,
  Info,
  Layers,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import type { CloudinaryUploadWidgetOptions } from 'next-cloudinary';
import { CldUploadWidget } from 'next-cloudinary';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { CURATED_THEMES, type CuratedTheme } from '@/libs/curatedThemes';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------
type MediaAsset = {
  publicId: string;
  name: string;
  url: string;
  thumbnailUrl: string;
  mimeType: string;
  size: number;
  isImage: boolean;
  isVideo: boolean;
  width: number | null;
  height: number | null;
  uploadedAt: string;
  categories?: string[];
  resourceType: 'image' | 'video' | 'raw';
};

type FilterType = 'all' | 'image' | 'video';

type UserSet = {
  id: string;
  name: string;
  type: 'slideshow' | 'video' | 'curated';
  assetCount: number;
  previewUrls: string[];
  curatedThemeId?: string;
};

type ModalState =
  | { kind: 'none' }
  | { kind: 'asset'; asset: MediaAsset }
  | { kind: 'new-set' }
  | { kind: 'curated-picker' }
  | { kind: 'curated-preview'; theme: CuratedTheme }
  | { kind: 'what-is-this' };

// ---------------------------------------------------------------------------
// CATEGORIES
// ---------------------------------------------------------------------------
const IMAGE_CATEGORIES = [
  'Slideshow Image',
  'Green Screen Background',
  'Data Story',
  'Educational Content',
  'Product Showcase',
  'Before & After',
  'Testimonial',
];

const VIDEO_CATEGORIES = [
  'Hook Video',
  'Reel Video',
  'UGC Ad',
  'Wall of Text',
  'Product Demo',
  'Green Screen Video',
];

const ALL_CATEGORIES = [...IMAGE_CATEGORIES, ...VIDEO_CATEGORIES];

// ---------------------------------------------------------------------------
// UNSPLASH PREVIEW HELPER
// ---------------------------------------------------------------------------
function unsplashPreviewByTheme(themeId: string, w = 300, page = 1): string {
  return `/api/media-library/unsplash-preview?theme=${encodeURIComponent(themeId)}&w=${w}&page=${page}`;
}

// ---------------------------------------------------------------------------
// FORMAT HELPERS
// ---------------------------------------------------------------------------
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDuration(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// VIDEO CARD
// ---------------------------------------------------------------------------
function VideoCard({
  asset,
  isSelected,
  isDeleting,
  selectMode,
  onClick,
  onDelete,
}: {
  asset: MediaAsset;
  isSelected: boolean;
  isDeleting: boolean;
  selectMode: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [hovering, setHovering] = useState(false);

  return (
    <div
      className={`group relative cursor-pointer overflow-hidden rounded-xl border bg-card transition-all duration-150 ${isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-muted-foreground/30'
        }`}
      onClick={onClick}
      onMouseEnter={() => {
        setHovering(true);
        videoRef.current?.play().catch(() => { });
      }}
      onMouseLeave={() => {
        setHovering(false);
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.currentTime = 0;
        }
      }}
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-zinc-950">
        <video
          ref={videoRef}
          src={asset.url}
          className={`size-full object-cover transition-opacity duration-200 ${hovering ? 'opacity-100' : 'opacity-80'}`}
          preload="metadata"
          playsInline
          muted
          loop
          onLoadedMetadata={(e) => setDuration(Math.round((e.target as HTMLVideoElement).duration))}
        />
        {!hovering && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex size-9 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
              <Play className="ml-0.5 size-4 fill-white text-white" />
            </div>
          </div>
        )}
        {duration !== null && (
          <div className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {formatDuration(duration)}
          </div>
        )}
        {asset.categories && asset.categories.length > 0 && (
          <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
            {asset.categories.slice(0, 2).map((cat) => (
              <span key={cat} className="rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-medium text-white">
                {cat.toLowerCase().replace('video', '').trim() || cat}
              </span>
            ))}
          </div>
        )}
        {(isSelected || selectMode) && (
          <div className={`absolute left-2 top-2 flex size-5 items-center justify-center rounded-full border-2 transition-all ${isSelected ? 'border-primary bg-primary' : 'border-white/70 bg-black/30'}`}>
            {isSelected && <Check className="size-3 text-white" />}
          </div>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-40"
        >
          {isDeleting ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
        </button>
      </div>
      <div className="px-2 py-1.5">
        <p className="truncate text-[10px] text-muted-foreground">{asset.name}</p>
        <p className="text-[9px] text-muted-foreground/60">{formatBytes(asset.size)} · {formatDate(asset.uploadedAt)}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// IMAGE CARD
// ---------------------------------------------------------------------------
function ImageCard({
  asset,
  isSelected,
  isDeleting,
  selectMode,
  onClick,
  onDelete,
}: {
  asset: MediaAsset;
  isSelected: boolean;
  isDeleting: boolean;
  selectMode: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className={`group relative cursor-pointer overflow-hidden rounded-xl border bg-card transition-all duration-150 ${isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-muted-foreground/30'
        }`}
      onClick={onClick}
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-muted/30">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={asset.thumbnailUrl}
          alt={asset.name}
          className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          loading="lazy"
        />
        {asset.categories && asset.categories.length > 0 && (
          <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
            {asset.categories.slice(0, 2).map((cat) => (
              <span key={cat} className="rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-white">
                {cat.toLowerCase().replace('image', '').trim() || cat}
              </span>
            ))}
          </div>
        )}
        {(isSelected || selectMode) && (
          <div className={`absolute left-2 top-2 flex size-5 items-center justify-center rounded-full border-2 transition-all ${isSelected ? 'border-primary bg-primary' : 'border-white/70 bg-black/30'}`}>
            {isSelected && <Check className="size-3 text-white" />}
          </div>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-40"
        >
          {isDeleting ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
        </button>
      </div>
      <div className="px-2 py-1.5">
        <p className="truncate text-[10px] text-muted-foreground">{asset.name}</p>
        <p className="text-[9px] text-muted-foreground/60">{formatBytes(asset.size)} · {formatDate(asset.uploadedAt)}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ASSET DETAIL MODAL
// ---------------------------------------------------------------------------
function AssetDetailModal({
  asset,
  onClose,
  onDelete,
  onCategoryChange,
  deleting,
}: {
  asset: MediaAsset;
  onClose: () => void;
  onDelete: () => void;
  onCategoryChange: (publicId: string, categories: string[], resourceType: MediaAsset['resourceType']) => Promise<void>;
  deleting: string | null;
}) {
  const categories = asset.isVideo ? VIDEO_CATEGORIES : IMAGE_CATEGORIES;
  const [selected, setSelected] = useState<string[]>(asset.categories ?? []);
  const [saving, setSaving] = useState(false);

  const toggle = (cat: string) =>
    setSelected((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));

  const save = async () => {
    setSaving(true);
    await onCategoryChange(asset.publicId, selected, asset.resourceType);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative flex max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl border bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex w-[55%] shrink-0 items-center justify-center bg-zinc-950 p-4">
          {asset.isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={asset.url} alt={asset.name} className="max-h-[70vh] w-full rounded-lg object-contain" />
          ) : asset.isVideo ? (
            <video src={asset.url} className="max-h-[70vh] w-full rounded-lg object-contain" controls preload="metadata" playsInline />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-muted/30">
              <FileVideo className="size-12 text-muted-foreground/40" />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Asset details</p>
            <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-muted">
              <X className="size-4 text-muted-foreground" />
            </button>
          </div>
          <div className="flex-1 space-y-5 p-5">
            <div>
              <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Filename</p>
              <p className="break-all text-xs font-medium">{asset.name}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Type</p>
                <p className="text-xs font-medium capitalize">{asset.isVideo ? 'Video' : 'Image'}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Size</p>
                <p className="text-xs font-medium">{formatBytes(asset.size)}</p>
              </div>
              {asset.width && asset.height && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Dimensions</p>
                  <p className="text-xs font-medium">{asset.width} × {asset.height}</p>
                </div>
              )}
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Uploaded</p>
                <p className="text-xs font-medium">{formatDate(asset.uploadedAt)}</p>
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Categories</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="size-3 cursor-help text-muted-foreground/60" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-[220px] text-xs">
                    Categories control how NativPost uses this asset. Only categories compatible with this media type are shown.
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggle(cat)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${selected.includes(cat)
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-muted-foreground/40'
                      }`}
                  >
                    {selected.includes(cat) && <Check className="mr-1 inline size-2.5" />}
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-2 border-t p-5">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
              Save categories
            </button>

            <a href={asset.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
            >
              Open in new tab
            </a>
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting === asset.publicId}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-60"
            >
              {deleting === asset.publicId ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
              Delete asset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NEW SET MODAL
// ---------------------------------------------------------------------------
function NewSetModal({
  onClose,
  onSelectSlideshow,
  onSelectVideo,
  onBrowseCurated,
}: {
  onClose: () => void;
  onSelectSlideshow: () => void;
  onSelectVideo: () => void;
  onBrowseCurated: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border bg-background p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-semibold">What kind of set?</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>
        <p className="mb-5 text-xs text-muted-foreground">Sets group your media into reusable buckets that NativPost samples when generating posts.</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onSelectSlideshow}
            className="flex flex-col items-start gap-2 rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/40 hover:bg-primary/5"
          >
            <div className="flex size-9 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
              <Layers className="size-4" />
            </div>
            <div>
              <p className="text-sm font-medium">Slideshow set</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Group images for slideshow posts.</p>
            </div>
          </button>
          <button
            type="button"
            onClick={onSelectVideo}
            className="flex flex-col items-start gap-2 rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/40 hover:bg-primary/5"
          >
            <div className="flex size-9 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
              <Video className="size-4" />
            </div>
            <div>
              <p className="text-sm font-medium">Video set</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Group videos for video posts.</p>
            </div>
          </button>
        </div>
        <div className="mt-4 border-t pt-4">
          <button
            type="button"
            onClick={onBrowseCurated}
            className="flex w-full items-center justify-between text-xs text-muted-foreground hover:text-foreground"
          >
            <span>Or browse our curated slideshow sets</span>
            <ChevronDown className="-rotate-90 size-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CURATED PICKER MODAL
// ---------------------------------------------------------------------------
function CuratedPickerModal({
  existing,
  onClose,
  onAdd,
}: {
  existing: string[];
  onClose: () => void;
  onAdd: (themes: CuratedTheme[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  const available = CURATED_THEMES.filter((t) => !existing.includes(t.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b px-6 py-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-semibold">Add Curated Themes</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {selected.length > 0 ? `${selected.length} selected` : `Select up to ${available.length} themes`}
              </p>
            </div>
            <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-muted">
              <X className="size-4 text-muted-foreground" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-3 gap-3">
            {available.map((theme) => {
              const isSel = selected.includes(theme.id);
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => toggle(theme.id)}
                  className={`group relative overflow-hidden rounded-xl border transition-all ${isSel ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-muted-foreground/30'}`}
                >
                  <div className="aspect-[4/3] overflow-hidden bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={unsplashPreviewByTheme(theme.id, 300, 1)} alt={theme.name} className="size-full object-cover" loading="lazy" />
                  </div>
                  <div className="p-2.5">
                    <p className="text-xs font-medium">{theme.name}</p>
                  </div>
                  {isSel && (
                    <div className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-primary">
                      <Check className="size-3 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 border-t px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
          <button
            type="button"
            onClick={() => onAdd(CURATED_THEMES.filter((t) => selected.includes(t.id)))}
            disabled={selected.length === 0}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Add {selected.length > 0 ? `${selected.length} Theme${selected.length > 1 ? 's' : ''}` : 'Themes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CURATED PREVIEW MODAL
// ---------------------------------------------------------------------------
function CuratedPreviewModal({
  theme,
  onClose,
  onDelete,
}: {
  theme: CuratedTheme;
  onClose: () => void;
  onDelete: () => void;
}) {
  const pages = Array.from({ length: 16 }, (_, i) => i + 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b px-6 py-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Curated Set</p>
              <h2 className="text-lg font-semibold">{theme.name}</h2>
              <p className="mt-1 text-xs text-muted-foreground">Images are curated and refreshed automatically — not editable here. 16 images total.</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-muted">
              <X className="size-4 text-muted-foreground" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-4 gap-2">
            {pages.map((page) => (
              <div key={page} className="aspect-square overflow-hidden rounded-lg bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={unsplashPreviewByTheme(theme.id, 200, page)} alt={`${theme.name} ${page}`} className="size-full object-cover" loading="lazy" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between border-t px-6 py-4">
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-500 hover:bg-red-50"
          >
            <Trash2 className="size-3" />
            Delete set
          </button>
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WHAT IS THIS MODAL
// ---------------------------------------------------------------------------
function WhatIsThisModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/20 p-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border bg-background p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Your Media Library</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>
        <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
          <p>Every image and video you upload lands here. One shared library across your workspace.</p>
          <p><span className="font-medium text-foreground">Feeds content generation.</span> NativPost pulls assets tagged with the relevant category when generating posts.</p>
          <p><span className="font-medium text-foreground">Sets</span> are reusable buckets. Tagging assets into a set tells NativPost they belong together and should be used together for on-brand content.</p>
          <p className="border-t pt-3"><span className="font-medium text-foreground">Tip:</span> hover a card and click its category badge to retag it. Use the category dropdown to filter by tag.</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BULK ACTION BAR
// ---------------------------------------------------------------------------
function BulkBar({
  count,
  onSelectAll,
  onDelete,
  onCategoryChange,
  onCancel,
  deleting,
}: {
  count: number;
  onSelectAll: () => void;
  onDelete: () => void;
  onCategoryChange: (cat: string) => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 px-4 py-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Categorize:</span>
      {ALL_CATEGORIES.slice(0, 5).map((cat) => (
        <button
          key={cat}
          type="button"
          onClick={() => onCategoryChange(cat)}
          className="rounded-full border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:border-primary hover:text-primary"
        >
          {cat}
        </button>
      ))}
      <div className="flex-1" />
      <button type="button" onClick={onSelectAll} className="text-xs text-muted-foreground hover:text-foreground">Select All</button>
      <span className="text-xs text-muted-foreground">{count} selected</span>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting || count === 0}
        className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
      >
        {deleting ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
        Delete
      </button>
      <button type="button" onClick={onCancel} className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">Cancel</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SET CARD
// ---------------------------------------------------------------------------
function SetCard({ set, onClick, onDelete }: { set: UserSet; onClick: () => void; onDelete: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex shrink-0 flex-col overflow-hidden rounded-xl border bg-card transition-all hover:border-muted-foreground/30"
      style={{ width: 112 }}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {set.previewUrls.length > 0 ? (
          <div className={`grid size-full gap-px ${set.previewUrls.length >= 4 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {set.previewUrls.slice(0, 4).map((url, i) => (
              <div key={i} className="overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="size-full object-cover" loading="lazy" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex size-full items-center justify-center">
            {set.type === 'video' ? <Video className="size-6 text-muted-foreground/40" /> : <Layers className="size-6 text-muted-foreground/40" />}
          </div>
        )}
        {set.type === 'curated' && (
          <div className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
            Curated
          </div>
        )}
      </div>
      <div className="px-2 pb-2 pt-1.5">
        <p className="truncate text-left text-[11px] font-medium">{set.name}</p>
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
      >
        <X className="size-3" />
      </button>
    </button>
  );
}

// ---------------------------------------------------------------------------
// CATEGORY DROPDOWN
// ---------------------------------------------------------------------------
function CategoryDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const options = ['All categories', 'Uncategorized', ...ALL_CATEGORIES];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
      >
        {value}
        <ChevronDown className={`size-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] overflow-hidden rounded-xl border bg-background shadow-lg">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setOpen(false); }}
              className={`flex w-full items-center justify-between px-3 py-2 text-xs hover:bg-muted ${value === opt ? 'font-medium text-primary' : 'text-muted-foreground'}`}
            >
              {opt}
              {value === opt && <Check className="size-3 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CREATE SET BOTTOM BAR
// ---------------------------------------------------------------------------
function CreateSetBar({
  type,
  selectedCount,
  name,
  onNameChange,
  onSave,
  onCancel,
  saving,
}: {
  type: 'slideshow' | 'video';
  selectedCount: number;
  name: string;
  onNameChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background px-4 py-3 shadow-lg sm:px-6">
      <div className="mx-auto flex max-w-5xl items-center gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Creating {type} set</p>
          <p className="text-xs text-muted-foreground">{selectedCount} selected{selectedCount < 1 ? ' (select at least 1)' : ''}</p>
        </div>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={type === 'slideshow' ? 'e.g. Brand photoshoot' : 'e.g. Hook videos Q3'}
          className="flex-1 rounded-lg border bg-muted/30 px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <button type="button" onClick={onCancel} className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted">
          <X className="size-3" />
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={selectedCount < 1 || !name.trim() || saving}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
          Save set
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MAIN PAGE
// ---------------------------------------------------------------------------
export default function MediaLibraryPage() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [total, setTotal] = useState(0);

  const [filter, setFilter] = useState<FilterType>('all');
  const [categoryFilter, setCategoryFilter] = useState('All categories');
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showUploader, setShowUploader] = useState(false);
  const [isFinalizingUpload, setIsFinalizingUpload] = useState(false);
  const [sets, setSets] = useState<UserSet[]>([]);
  const [creatingSetType, setCreatingSetType] = useState<'slideshow' | 'video' | null>(null);
  const [newSetName, setNewSetName] = useState('');
  const [savingSet, setSavingSet] = useState(false);

  // ── NEW: fetch org-scoped folder/tags for the upload widget ──────────────
  const [uploadFolder, setUploadFolder] = useState<string | null>(null);
  const [uploadTags, setUploadTags] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/media-library/signature')
      .then((r) => r.json())
      .then((d) => {
        setUploadFolder(d.folder);
        setUploadTags(d.tags);
      })
      .catch(() => { });
  }, []);
  // ─────────────────────────────────────────────────────────────────────────

  const fetchAssets = useCallback(async (type: FilterType, category: string, offset = 0) => {
    const params = new URLSearchParams({
      type,
      limit: '48',
      offset: String(offset),
      ...(category !== 'All categories' ? { category } : {}),
    });
    const res = await fetch(`/api/media-library?${params}`);
    if (!res.ok) throw new Error('Failed to fetch');
    return res.json() as Promise<{ assets: MediaAsset[]; nextOffset: number | null; total: number }>;
  }, []);

  const fetchSets = useCallback(async () => {
    try {
      const res = await fetch('/api/media-library/sets');
      if (res.ok) {
        const data = await res.json();
        setSets(data.sets || []);
      }
    } catch { }
  }, []);

  const load = useCallback(async (type: FilterType, category: string) => {
    setIsLoading(true);
    setAssets([]);
    setNextOffset(null);
    try {
      const data = await fetchAssets(type, category, 0);
      setAssets(data.assets);
      setNextOffset(data.nextOffset);
      setTotal(data.total);
    } catch (err) {
      console.error('[MediaLibrary]', err);
    } finally {
      setIsLoading(false);
    }
  }, [fetchAssets]);

  const loadMore = async () => {
    if (nextOffset === null || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const data = await fetchAssets(filter, categoryFilter, nextOffset);
      setAssets((prev) => [...prev, ...data.assets]);
      setNextOffset(data.nextOffset);
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => { load(filter, categoryFilter); }, [filter, categoryFilter, load]);
  useEffect(() => { fetchSets(); }, [fetchSets]);

  const handleQueuesEnd = async () => {
    setIsFinalizingUpload(true);
    try {
      await load(filter, categoryFilter);
    } finally {
      setIsFinalizingUpload(false);
      setShowUploader(false);
    }
  };

  const handleDelete = async (asset: MediaAsset) => {
    if (!window.confirm(`Delete "${asset.name}"? This cannot be undone.`)) return;
    setDeleting(asset.publicId);
    try {
      const params = new URLSearchParams({ publicId: asset.publicId, resourceType: asset.resourceType });
      const res = await fetch(`/api/media-library?${params}`, { method: 'DELETE' });
      if (res.ok) {
        setAssets((prev) => prev.filter((a) => a.publicId !== asset.publicId));
        setTotal((prev) => prev - 1);
        if (modal.kind === 'asset' && modal.asset.publicId === asset.publicId) setModal({ kind: 'none' });
      }
    } finally {
      setDeleting(null);
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.size} items? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      await Promise.all([...selectedIds].map((id) => {
        const asset = assets.find((a) => a.publicId === id);
        const params = new URLSearchParams({ publicId: id, resourceType: asset?.resourceType ?? 'image' });
        return fetch(`/api/media-library?${params}`, { method: 'DELETE' });
      }));
      setAssets((prev) => prev.filter((a) => !selectedIds.has(a.publicId)));
      setTotal((prev) => prev - selectedIds.size);
      setSelectedIds(new Set());
      setSelectMode(false);
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleCategoryChange = async (publicId: string, categories: string[], resourceType: MediaAsset['resourceType']) => {
    await fetch(`/api/media-library/${encodeURIComponent(publicId)}/categories`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories, resourceType }),
    });
    setAssets((prev) => prev.map((a) => (a.publicId === publicId ? { ...a, categories } : a)));
    if (modal.kind === 'asset' && modal.asset.publicId === publicId) {
      setModal({ kind: 'asset', asset: { ...modal.asset, categories } });
    }
  };

  const handleBulkCategory = async (category: string) => {
    await Promise.all([...selectedIds].map((id) => {
      const asset = assets.find((a) => a.publicId === id);
      const existing = asset?.categories ?? [];
      const resourceType = asset?.resourceType ?? 'image';
      return handleCategoryChange(id, existing.includes(category) ? existing : [...existing, category], resourceType);
    }));
  };

  const handleSaveSet = async () => {
    if (!creatingSetType || !newSetName.trim()) return;
    setSavingSet(true);
    try {
      const res = await fetch('/api/media-library/sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSetName.trim(), type: creatingSetType, assetUuids: [...selectedIds] }),
      });
      if (res.ok) {
        await fetchSets();
        setCreatingSetType(null);
        setNewSetName('');
        setSelectedIds(new Set());
        setSelectMode(false);
      }
    } finally {
      setSavingSet(false);
    }
  };

  const handleAddCuratedThemes = async (themes: CuratedTheme[]) => {
    await Promise.all(themes.map((theme) =>
      fetch('/api/media-library/sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: theme.name, type: 'curated', curatedThemeId: theme.id }),
      })
    ));
    await fetchSets();
    setModal({ kind: 'none' });
  };

  const handleDeleteSet = async (setId: string) => {
    if (!window.confirm('Delete this set? The media inside will not be deleted.')) return;
    await fetch(`/api/media-library/sets/${setId}`, { method: 'DELETE' });
    setSets((prev) => prev.filter((s) => s.id !== setId));
    setModal({ kind: 'none' });
  };

  const toggleSelect = (publicId: string) =>
    setSelectedIds((prev) => { const n = new Set(prev); n.has(publicId) ? n.delete(publicId) : n.add(publicId); return n; });

  const handleCardClick = (asset: MediaAsset) => {
    if (selectMode || creatingSetType) {
      toggleSelect(asset.publicId);
    } else {
      setModal({ kind: 'asset', asset });
    }
  };

  const FILTER_TABS: { label: string; value: FilterType }[] = [
    { label: 'All', value: 'all' },
    { label: 'Images', value: 'image' },
    { label: 'Videos', value: 'video' },
  ];

  const curatedSetIds = sets.filter((s) => s.type === 'curated').map((s) => s.curatedThemeId ?? '');

  const uploadSources: CloudinaryUploadWidgetOptions['sources'] = [
    'local', 'url', 'camera', 'dropbox', 'google_drive',
  ];

  // ── NEW: include folder + tags so they're in paramsToSign when the widget
  // calls the signature endpoint — making the signature cover all fields ────
  const uploadWidgetOptions: CloudinaryUploadWidgetOptions = useMemo(() => ({
    sources: uploadSources,
    multiple: true,
    resourceType: 'auto',
    maxFileSize: 500_000_000,
    cropping: false,
    language: 'en',
    ...(uploadFolder ? { folder: uploadFolder } : {}),
    ...(uploadTags ? { tags: [uploadTags] } : {}),
  }), [uploadFolder, uploadTags]);
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider delayDuration={150}>
      <div className={creatingSetType ? 'pb-20' : ''}>

        {/* YOUR SETS */}
        <div className="mb-5">
          <div className="mb-3 flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your sets</p>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="size-3.5 cursor-help text-muted-foreground/60" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[300px] p-4" align="start">
                <p className="mb-2 text-xs font-semibold">What are sets?</p>
                <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
                  Sets are reusable buckets of media that NativPost samples when generating posts.
                </p>
                <ul className="space-y-1 text-[11px] text-muted-foreground">
                  <li><span className="font-medium text-foreground">Slideshow sets</span> — images, sampled for carousel posts.</li>
                  <li><span className="font-medium text-foreground">Video sets</span> — videos, sampled for video posts.</li>
                  <li><span className="font-medium text-foreground">Curated sets</span> — themed collections, also sampled for slideshows.</li>
                </ul>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-start gap-3 overflow-x-auto pb-2">
            <button
              type="button"
              onClick={() => setModal({ kind: 'new-set' })}
              className="flex shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed bg-card p-3 transition-colors hover:border-muted-foreground/40 hover:bg-muted/30"
              style={{ width: 112, minHeight: 80 }}
            >
              <Plus className="size-4 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">New set</span>
            </button>
            {sets.map((set) => (
              <SetCard
                key={set.id}
                set={set}
                onClick={() => {
                  const theme = CURATED_THEMES.find((t) => t.id === set.curatedThemeId);
                  if (set.type === 'curated' && theme) setModal({ kind: 'curated-preview', theme });
                }}
                onDelete={() => handleDeleteSet(set.id)}
              />
            ))}
          </div>
        </div>

        {/* UPLOAD ZONE */}
        {showUploader ? (
          <div className="mb-5 rounded-xl border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium">Upload files</p>
              <button type="button" onClick={() => setShowUploader(false)} className="rounded p-1 hover:bg-muted">
                <X className="size-4 text-muted-foreground" />
              </button>
            </div>
            {isFinalizingUpload ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Saving to your library...
              </div>
            ) : (
              <CldUploadWidget
                signatureEndpoint="/api/media-library/signature"
                options={uploadWidgetOptions}
                onQueuesEnd={handleQueuesEnd}
              >
                {({ open }) => (
                  <button
                    type="button"
                    onClick={() => open()}
                    className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border/60 bg-muted/20 py-8 text-center transition-colors hover:border-primary/40 hover:bg-muted/40"
                  >
                    <Upload className="size-6 text-muted-foreground/50" />
                    <p className="text-sm font-medium text-muted-foreground">Click to choose files</p>
                    <p className="text-xs text-muted-foreground/60">Images or videos, from your computer, a URL, Dropbox, or Google Drive</p>
                  </button>
                )}
              </CldUploadWidget>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowUploader(true)}
            className="mb-5 flex w-full items-center gap-4 rounded-xl border border-dashed bg-card px-5 py-4 text-left transition-colors hover:border-muted-foreground/40 hover:bg-muted/20"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Upload className="size-4" />
            </div>
            <div>
              <p className="text-sm font-medium">Drop images or videos here</p>
              <p className="text-xs text-muted-foreground">Click to browse your computer. Supports JPG, PNG, WebP, or MP4.</p>
            </div>
          </button>
        )}

        {/* FILTER BAR */}
        {selectMode ? (
          <BulkBar
            count={selectedIds.size}
            onSelectAll={() => setSelectedIds(new Set(assets.map((a) => a.publicId)))}
            onDelete={handleBulkDelete}
            onCategoryChange={handleBulkCategory}
            onCancel={() => { setSelectMode(false); setSelectedIds(new Set()); }}
            deleting={bulkDeleting}
          />
        ) : (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border bg-muted/30 p-0.5">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setFilter(tab.value)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${filter === tab.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <CategoryDropdown value={categoryFilter} onChange={setCategoryFilter} />
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="rounded-full p-1 text-muted-foreground/60 hover:text-muted-foreground">
                  <Info className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[240px] text-[11px] leading-relaxed">
                Categories control how NativPost uses your media. Filter here to review what is tagged where.
              </TooltipContent>
            </Tooltip>
            <div className="flex-1" />
            <span className="text-xs text-muted-foreground">{total} {total === 1 ? 'item' : 'items'}</span>
            <button type="button" onClick={() => load(filter, categoryFilter)} className="rounded-lg border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Refresh">
              <RefreshCw className="size-3.5" />
            </button>
            <button type="button" onClick={() => setShowUploader(true)} className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted">
              <Upload className="size-3.5" />
              Upload
            </button>
            <button type="button" onClick={() => setSelectMode(true)} className="rounded-lg border bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90">
              Select
            </button>
            <button type="button" onClick={() => setModal({ kind: 'what-is-this' })} className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
              <HelpCircle className="size-3.5" />
              <span className="hidden sm:inline">What is this?</span>
            </button>
          </div>
        )}

        {/* MEDIA GRID */}
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-3 rounded-xl border border-dashed p-5">
              <Video className="size-10 text-muted-foreground/30" />
            </div>
            <p className="text-sm font-medium">No assets yet</p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">Upload images and videos to use across your posts and content generation.</p>
            <button type="button" onClick={() => setShowUploader(true)} className="mt-5 flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-medium hover:bg-muted">
              <Upload className="size-3.5" />
              Upload your first asset
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {assets.map((asset) =>
                asset.isVideo ? (
                  <VideoCard
                    key={asset.publicId}
                    asset={asset}
                    isSelected={selectedIds.has(asset.publicId)}
                    isDeleting={deleting === asset.publicId}
                    selectMode={selectMode || !!creatingSetType}
                    onClick={() => handleCardClick(asset)}
                    onDelete={(e) => { e.stopPropagation(); handleDelete(asset); }}
                  />
                ) : (
                  <ImageCard
                    key={asset.publicId}
                    asset={asset}
                    isSelected={selectedIds.has(asset.publicId)}
                    isDeleting={deleting === asset.publicId}
                    selectMode={selectMode || !!creatingSetType}
                    onClick={() => handleCardClick(asset)}
                    onDelete={(e) => { e.stopPropagation(); handleDelete(asset); }}
                  />
                )
              )}
            </div>
            {nextOffset !== null && (
              <div className="mt-8 flex justify-center">
                <button type="button" onClick={loadMore} disabled={isLoadingMore} className="flex items-center gap-2 rounded-lg border px-5 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-60">
                  {isLoadingMore && <Loader2 className="size-4 animate-spin" />}
                  Load more
                </button>
              </div>
            )}
          </>
        )}

        {/* CREATE SET BOTTOM BAR */}
        {creatingSetType && (
          <CreateSetBar
            type={creatingSetType}
            selectedCount={selectedIds.size}
            name={newSetName}
            onNameChange={setNewSetName}
            onSave={handleSaveSet}
            onCancel={() => { setCreatingSetType(null); setNewSetName(''); setSelectedIds(new Set()); }}
            saving={savingSet}
          />
        )}

        {/* MODALS */}
        {modal.kind === 'asset' && (
          <AssetDetailModal
            asset={modal.asset}
            onClose={() => setModal({ kind: 'none' })}
            onDelete={() => handleDelete(modal.asset)}
            onCategoryChange={handleCategoryChange}
            deleting={deleting}
          />
        )}
        {modal.kind === 'new-set' && (
          <NewSetModal
            onClose={() => setModal({ kind: 'none' })}
            onSelectSlideshow={() => { setModal({ kind: 'none' }); setCreatingSetType('slideshow'); setSelectedIds(new Set()); }}
            onSelectVideo={() => { setModal({ kind: 'none' }); setCreatingSetType('video'); setSelectedIds(new Set()); }}
            onBrowseCurated={() => setModal({ kind: 'curated-picker' })}
          />
        )}
        {modal.kind === 'curated-picker' && (
          <CuratedPickerModal existing={curatedSetIds} onClose={() => setModal({ kind: 'none' })} onAdd={handleAddCuratedThemes} />
        )}
        {modal.kind === 'curated-preview' && (
          <CuratedPreviewModal
            theme={modal.theme}
            onClose={() => setModal({ kind: 'none' })}
            onDelete={() => { const s = sets.find((x) => x.curatedThemeId === modal.theme.id); if (s) handleDeleteSet(s.id); }}
          />
        )}
        {modal.kind === 'what-is-this' && <WhatIsThisModal onClose={() => setModal({ kind: 'none' })} />}
      </div>
    </TooltipProvider>
  );
}
