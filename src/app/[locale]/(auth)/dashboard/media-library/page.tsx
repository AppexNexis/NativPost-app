'use client';

import '@uploadcare/react-uploader/core.css';

import { FileUploaderRegular } from '@uploadcare/react-uploader/next';
import {
  Calendar,
  Check,
  ChevronDown,
  FileVideo,
  HelpCircle,
  Image as ImageIcon,
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
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

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
  uuid: string;
  name: string;
  cdnUrl: string;
  mimeType: string;
  size: number;
  isImage: boolean;
  isVideo: boolean;
  width: number | null;
  height: number | null;
  uploadedAt: string;
  categories?: string[];
  tags?: string[];
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
// CATEGORIES — split by media type per the smart assignment requirement
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
// HELPERS
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
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function toVideoSrc(url: string): string {
  if (/\.(?:mp4|mov|webm)(?:[/?#]|$)/i.test(url)) return url;
  const base = url.endsWith('/') ? url : `${url}/`;
  return `${base}video.mp4`;
}

function toThumbnailSrc(cdnUrl: string, size = 400): string {
  const base = cdnUrl.endsWith('/') ? cdnUrl : `${cdnUrl}/`;
  return `${base}-/preview/${size}x${size}/-/format/webp/-/quality/smart/`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// VIDEO CARD — hover to autoplay
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

  const handleMouseEnter = () => {
    setHovering(true);
    videoRef.current?.play().catch(() => {});
  };

  const handleMouseLeave = () => {
    setHovering(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  return (
    <div
      className={`group relative cursor-pointer overflow-hidden rounded-xl border bg-card transition-all duration-150 ${
        isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-muted-foreground/30'
      }`}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="relative aspect-[3/4] bg-zinc-950 overflow-hidden">
        <video
          ref={videoRef}
          src={toVideoSrc(asset.cdnUrl)}
          className={`size-full object-cover transition-opacity duration-200 ${hovering ? 'opacity-100' : 'opacity-80'}`}
          preload="metadata"
          playsInline
          muted
          loop
          onLoadedMetadata={(e) => setDuration(Math.round((e.target as HTMLVideoElement).duration))}
        />

        {/* Play icon when not hovering */}
        {!hovering && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex size-9 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
              <Play className="size-4 fill-white text-white ml-0.5" />
            </div>
          </div>
        )}

        {/* Duration badge */}
        {duration !== null && (
          <div className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            {formatDuration(duration)}
          </div>
        )}

        {/* Category badges */}
        {asset.categories && asset.categories.length > 0 && (
          <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
            {asset.categories.slice(0, 2).map((cat) => (
              <span key={cat} className="rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-medium text-white backdrop-blur-sm">
                {cat.toLowerCase().replace('video', '').trim() || cat}
              </span>
            ))}
          </div>
        )}

        {/* Selection overlay */}
        {(isSelected || selectMode) && (
          <div
            className={`absolute left-2 top-2 flex size-5 items-center justify-center rounded-full border-2 transition-all ${
              isSelected ? 'border-primary bg-primary' : 'border-white/70 bg-black/30'
            }`}
          >
            {isSelected && <Check className="size-3 text-white" />}
          </div>
        )}

        {/* Delete button */}
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity disabled:opacity-40 group-hover:opacity-100"
          aria-label="Delete"
        >
          {isDeleting ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
        </button>
      </div>

      {/* Card footer */}
      <div className="px-2 py-1.5">
        <p className="truncate text-[10px] text-muted-foreground">{asset.name}</p>
        <p className="text-[9px] text-muted-foreground/60">
          {formatBytes(asset.size)} · {formatDate(asset.uploadedAt)}
        </p>
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
      className={`group relative cursor-pointer overflow-hidden rounded-xl border bg-card transition-all duration-150 ${
        isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-muted-foreground/30'
      }`}
      onClick={onClick}
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-muted/30">
        <Image
          src={toThumbnailSrc(asset.cdnUrl, 300)}
          alt={asset.name}
          fill
          className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          unoptimized
        />

        {/* Category badges */}
        {asset.categories && asset.categories.length > 0 && (
          <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
            {asset.categories.slice(0, 2).map((cat) => (
              <span key={cat} className="rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-white backdrop-blur-sm">
                {cat.toLowerCase().replace('image', '').trim() || cat}
              </span>
            ))}
          </div>
        )}

        {/* Selection circle */}
        {(isSelected || selectMode) && (
          <div
            className={`absolute left-2 top-2 flex size-5 items-center justify-center rounded-full border-2 transition-all ${
              isSelected ? 'border-primary bg-primary' : 'border-white/70 bg-black/30'
            }`}
          >
            {isSelected && <Check className="size-3 text-white" />}
          </div>
        )}

        {/* Delete button */}
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity disabled:opacity-40 group-hover:opacity-100"
          aria-label="Delete"
        >
          {isDeleting ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
        </button>
      </div>

      <div className="px-2 py-1.5">
        <p className="truncate text-[10px] text-muted-foreground">{asset.name}</p>
        <p className="text-[9px] text-muted-foreground/60">
          {formatBytes(asset.size)} · {formatDate(asset.uploadedAt)}
        </p>
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
  onCategoryChange: (uuid: string, categories: string[]) => Promise<void>;
  deleting: string | null;
}) {
  const categories = asset.isVideo ? VIDEO_CATEGORIES : IMAGE_CATEGORIES;
  const [selected, setSelected] = useState<string[]>(asset.categories ?? []);
  const [saving, setSaving] = useState(false);

  const toggle = (cat: string) => {
    setSelected((prev) => prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]);
  };

  const save = async () => {
    setSaving(true);
    await onCategoryChange(asset.uuid, selected);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative flex max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Media preview — left side */}
        <div className="flex w-[55%] shrink-0 items-center justify-center bg-zinc-950 p-4">
          {asset.isImage ? (
            <div className="relative max-h-[75vh] w-full">
              <Image
                src={toThumbnailSrc(asset.cdnUrl, 800)}
                alt={asset.name}
                width={600}
                height={800}
                className="max-h-[70vh] w-full rounded-lg object-contain"
                unoptimized
              />
            </div>
          ) : asset.isVideo ? (
            <video
              src={toVideoSrc(asset.cdnUrl)}
              className="max-h-[70vh] w-full rounded-lg object-contain"
              controls
              preload="metadata"
              playsInline
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-muted/30">
              <FileVideo className="size-12 text-muted-foreground/40" />
            </div>
          )}
        </div>

        {/* Details — right side */}
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Asset details</p>
            <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-muted">
              <X className="size-4 text-muted-foreground" />
            </button>
          </div>

          <div className="flex-1 space-y-5 p-5">
            {/* Filename */}
            <div>
              <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Filename</p>
              <p className="break-all text-xs font-medium">{asset.name}</p>
            </div>

            {/* Metadata grid */}
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
                <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  <Calendar className="mb-0.5 mr-1 inline size-2.5" />
                  Uploaded
                </p>
                <p className="text-xs font-medium">{formatDate(asset.uploadedAt)}</p>
              </div>
            </div>

            {/* Categories */}
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Categories</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="size-3 text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-[220px] text-xs">
                    Categories control how NativPost uses this asset when generating posts. Only categories compatible with this media type are shown.
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggle(cat)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      selected.includes(cat)
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

          {/* Actions */}
          <div className="space-y-2 border-t p-5">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
              Save categories
            </button>
            <a
              href={asset.isVideo ? toVideoSrc(asset.cdnUrl) : asset.cdnUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted"
            >
              Open in new tab
            </a>
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting === asset.uuid}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 disabled:opacity-60"
            >
              {deleting === asset.uuid ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
              Delete asset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NEW SET MODAL — "What kind of set?"
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
      <div
        className="w-full max-w-sm rounded-2xl border bg-background p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
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
            className="group flex flex-col items-start gap-2 rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/40 hover:bg-primary/5"
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
            className="group flex flex-col items-start gap-2 rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/40 hover:bg-primary/5"
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
            <ChevronDown className="size-3 -rotate-90" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CURATED THEME PICKER MODAL
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

  const toggle = (id: string) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);
  };

  const available = CURATED_THEMES.filter((t) => !existing.includes(t.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b px-6 py-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-semibold">Add Curated Themes</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {selected.length > 0
                  ? `${selected.length} selected — ${available.length - selected.length} slots remaining`
                  : `Select up to ${available.length} themes`}
              </p>
            </div>
            <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-muted">
              <X className="size-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-3">
            {available.map((theme) => {
              const isSelected = selected.includes(theme.id);
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => toggle(theme.id)}
                  className={`group relative overflow-hidden rounded-xl border transition-all ${
                    isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-muted-foreground/30'
                  }`}
                >
                  <div className="aspect-[4/3] bg-muted">
                    <Image
                      src={`/api/media-library/unsplash-preview?query=${encodeURIComponent(theme.query)}&w=300`}
                      alt={theme.name}
                      width={300}
                      height={225}
                      className="size-full object-cover"
                      unoptimized
                    />
                  </div>
                  <div className="p-2.5">
                    <p className="text-xs font-medium">{theme.name}</p>
                  </div>
                  {isSelected && (
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
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onAdd(CURATED_THEMES.filter((t) => selected.includes(t.id)))}
            disabled={selected.length === 0}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            Add {selected.length > 0 ? `${selected.length} Theme${selected.length > 1 ? 's' : ''}` : 'Themes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CURATED SET PREVIEW MODAL
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
  const queries = Array.from({ length: 16 }, (_, i) =>
    `/api/media-library/unsplash-preview?query=${encodeURIComponent(theme.query)}&w=200&page=${i + 1}`
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b px-6 py-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Curated Set</p>
              <h2 className="text-lg font-semibold">{theme.name}</h2>
              <p className="mt-1 text-xs text-muted-foreground">Images for this set are curated and refreshed automatically — not editable here.</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-muted">
              <X className="size-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-4 gap-2">
            {queries.map((src, i) => (
              <div key={i} className="aspect-square overflow-hidden rounded-lg bg-muted">
                <Image src={src} alt={`${theme.name} ${i + 1}`} width={200} height={200} className="size-full object-cover" unoptimized />
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t px-6 py-4">
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-500 transition-colors hover:bg-red-50"
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
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/20 p-6 sm:items-start" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border bg-background p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Your Media Library</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-muted">
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>
        <div className="space-y-3 text-xs text-muted-foreground leading-relaxed">
          <p>Every image and video you upload lands here. It is one shared library across your workspace, used in content generation, post creation, and sets.</p>
          <p><span className="font-medium text-foreground">Feeds content generation.</span> When NativPost generates a post, it pulls from assets tagged with the relevant category. Slideshow sets let you curate a specific group of images NativPost will sample from.</p>
          <p><span className="font-medium text-foreground">Sets</span> are reusable buckets of media. Tagging assets into a set tells NativPost they belong together and should be used together when generating on-brand content.</p>
          <p className="border-t pt-3"><span className="font-medium text-foreground">Tip:</span> hover any card and pick a category from the badge strip to tag it. The category dropdown above the grid lets you review what is tagged where.</p>
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
  // onDeselectAll,
  onDelete,
  onCategoryChange,
  onCancel,
  deleting,
}: {
  count: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onDelete: () => void;
  onCategoryChange: (cat: string) => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Categorize:</span>
      {ALL_CATEGORIES.slice(0, 5).map((cat) => (
        <button
          key={cat}
          type="button"
          onClick={() => onCategoryChange(cat)}
          className="rounded-full border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          {cat}
        </button>
      ))}

      <div className="flex-1" />

      <button type="button" onClick={onSelectAll} className="text-xs text-muted-foreground hover:text-foreground">
        Select All
      </button>
      <span className="text-xs text-muted-foreground">{count} selected</span>

      <button
        type="button"
        onClick={onDelete}
        disabled={deleting || count === 0}
        className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
      >
        {deleting ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
        Delete
      </button>

      <button type="button" onClick={onCancel} className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">
        Cancel
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SET CARD
// ---------------------------------------------------------------------------
function SetCard({
  set,
  onClick,
  onDelete,
}: {
  set: UserSet;
  onClick: () => void;
  onDelete: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-all hover:border-muted-foreground/30"
      style={{ width: 120 }}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {set.previewUrls.length > 0 ? (
          <div className={`grid size-full ${set.previewUrls.length >= 4 ? 'grid-cols-2' : 'grid-cols-1'} gap-px`}>
            {set.previewUrls.slice(0, 4).map((url, i) => (
              <div key={i} className="overflow-hidden">
                <Image src={url} alt="" width={60} height={60} className="size-full object-cover" unoptimized />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex size-full items-center justify-center">
            {set.type === 'video' ? <Video className="size-6 text-muted-foreground/40" /> : <Layers className="size-6 text-muted-foreground/40" />}
          </div>
        )}

        {set.type === 'curated' && (
          <div className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
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
        aria-label="Delete set"
      >
        <X className="size-3" />
      </button>
    </button>
  );
}

// ---------------------------------------------------------------------------
// CATEGORY FILTER DROPDOWN
// ---------------------------------------------------------------------------
function CategoryDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const options = ['All categories', 'Uncategorized', ...ALL_CATEGORIES];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
      >
        {value === 'All categories' ? 'All categories' : value}
        <ChevronDown className={`size-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] overflow-hidden rounded-xl border bg-background shadow-lg">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt); setOpen(false); }}
              className={`flex w-full items-center justify-between px-3 py-2 text-xs transition-colors hover:bg-muted ${value === opt ? 'font-medium text-primary' : 'text-muted-foreground'}`}
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
// CREATE SET BOTTOM BAR (shown when in set-creation mode)
// ---------------------------------------------------------------------------
function CreateSetBar({
  type,
  selectedCount,
  minRequired,
  name,
  onNameChange,
  onSave,
  onCancel,
  saving,
}: {
  type: 'slideshow' | 'video';
  selectedCount: number;
  minRequired: number;
  name: string;
  onNameChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const needsMore = selectedCount < minRequired;
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background px-4 py-3 shadow-lg sm:px-6">
      <div className="mx-auto flex max-w-5xl items-center gap-4">
        <div className="flex flex-col">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Creating {type} set</p>
          <p className="text-xs text-muted-foreground">
            {selectedCount} selected{needsMore ? ` (need ${minRequired - selectedCount} more)` : ''}
          </p>
        </div>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={`e.g. ${type === 'slideshow' ? 'Brand photoshoot' : 'Hook videos Q3'}`}
          className="flex-1 rounded-lg border bg-muted/30 px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
        >
          <X className="size-3" />
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={needsMore || !name.trim() || saving}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
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

  const [selectedUuids, setSelectedUuids] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [deleting, setDeleting] = useState<string | null>(null);
  const [showUploader, setShowUploader] = useState(false);
  const [isTagging, setIsTagging] = useState(false);

  // Sets state
  const [sets, setSets] = useState<UserSet[]>([]);
  const [creatingSetType, setCreatingSetType] = useState<'slideshow' | 'video' | null>(null);
  const [newSetName, setNewSetName] = useState('');
  const [savingSet, setSavingSet] = useState(false);

  const pubkey = process.env.NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY || '';

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------
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
    } catch {}
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
      console.error('[MediaLibrary] Load error:', err);
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

  useEffect(() => {
    load(filter, categoryFilter);
  }, [filter, categoryFilter, load]);

  useEffect(() => {
    fetchSets();
  }, [fetchSets]);

  // ---------------------------------------------------------------------------
  // Upload
  // ---------------------------------------------------------------------------
  const handleUploadDone = async (files: { allEntries: { status: string; uuid: string | null }[] }) => {
    const uploaded = files.allEntries
      .filter((f) => f.status === 'success' && f.uuid != null)
      .map((f) => f.uuid as string);
    if (uploaded.length === 0) { setShowUploader(false); return; }
    setIsTagging(true);
    try {
      await Promise.all(
        uploaded.map((uuid) =>
          fetch('/api/media-library/tag', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uuid }),
          })
        )
      );
    } finally {
      setIsTagging(false);
      setShowUploader(false);
      load(filter, categoryFilter);
    }
  };

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------
  const handleDelete = async (asset: MediaAsset) => {
    if (!window.confirm(`Delete "${asset.name}"? This cannot be undone.`)) return;
    setDeleting(asset.uuid);
    try {
      const res = await fetch(`/api/media-library?uuid=${asset.uuid}`, { method: 'DELETE' });
      if (res.ok) {
        setAssets((prev) => prev.filter((a) => a.uuid !== asset.uuid));
        setTotal((prev) => prev - 1);
        if (modal.kind === 'asset' && modal.asset.uuid === asset.uuid) setModal({ kind: 'none' });
      }
    } finally {
      setDeleting(null);
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedUuids.size} selected items? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      await Promise.all(
        [...selectedUuids].map((uuid) => fetch(`/api/media-library?uuid=${uuid}`, { method: 'DELETE' }))
      );
      setAssets((prev) => prev.filter((a) => !selectedUuids.has(a.uuid)));
      setTotal((prev) => prev - selectedUuids.size);
      setSelectedUuids(new Set());
      setSelectMode(false);
    } finally {
      setBulkDeleting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Category assignment
  // ---------------------------------------------------------------------------
  const handleCategoryChange = async (uuid: string, categories: string[]) => {
    await fetch(`/api/media-library/${uuid}/categories`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories }),
    });
    setAssets((prev) =>
      prev.map((a) => (a.uuid === uuid ? { ...a, categories } : a))
    );
    if (modal.kind === 'asset' && modal.asset.uuid === uuid) {
      setModal({ kind: 'asset', asset: { ...modal.asset, categories } });
    }
  };

  const handleBulkCategory = async (category: string) => {
    await Promise.all(
      [...selectedUuids].map((uuid) => {
        const asset = assets.find((a) => a.uuid === uuid);
        const existing = asset?.categories ?? [];
        const updated = existing.includes(category) ? existing : [...existing, category];
        return handleCategoryChange(uuid, updated);
      })
    );
  };

  // ---------------------------------------------------------------------------
  // Sets
  // ---------------------------------------------------------------------------
  const handleSaveSet = async () => {
    if (!creatingSetType || !newSetName.trim() || selectedUuids.size < 1) return;
    setSavingSet(true);
    try {
      const res = await fetch('/api/media-library/sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSetName.trim(),
          type: creatingSetType,
          assetUuids: [...selectedUuids],
        }),
      });
      if (res.ok) {
        await fetchSets();
        setCreatingSetType(null);
        setNewSetName('');
        setSelectedUuids(new Set());
        setSelectMode(false);
      }
    } finally {
      setSavingSet(false);
    }
  };

  const handleAddCuratedThemes = async (themes: CuratedTheme[]) => {
    await Promise.all(
      themes.map((theme) =>
        fetch('/api/media-library/sets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: theme.name, type: 'curated', curatedThemeId: theme.id }),
        })
      )
    );
    await fetchSets();
    setModal({ kind: 'none' });
  };

  const handleDeleteSet = async (setId: string) => {
    if (!window.confirm('Delete this set? The media inside will not be deleted.')) return;
    await fetch(`/api/media-library/sets/${setId}`, { method: 'DELETE' });
    setSets((prev) => prev.filter((s) => s.id !== setId));
    setModal({ kind: 'none' });
  };

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------
  const toggleSelect = (uuid: string) => {
    setSelectedUuids((prev) => {
      const next = new Set(prev);
      next.has(uuid) ? next.delete(uuid) : next.add(uuid);
      return next;
    });
  };

  const handleCardClick = (asset: MediaAsset) => {
    if (selectMode || creatingSetType) {
      toggleSelect(asset.uuid);
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

  return (
    <TooltipProvider delayDuration={150}>
      <div className={`min-h-0 ${creatingSetType ? 'pb-20' : ''}`}>

        {/* ── YOUR SETS ───────────────────────────────────────── */}
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
                  Sets are reusable buckets of your media that NativPost samples when generating posts. Tagging media into a set tells NativPost these assets belong together.
                </p>
                <ul className="space-y-1 text-[11px] text-muted-foreground">
                  <li><span className="font-medium text-foreground">Slideshow sets</span> — your images, sampled for carousel posts.</li>
                  <li><span className="font-medium text-foreground">Video sets</span> — your videos, sampled for video posts.</li>
                  <li><span className="font-medium text-foreground">Curated sets</span> — themed collections, also sampled for slideshows.</li>
                </ul>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex items-start gap-3 overflow-x-auto pb-2">
            {/* New set button */}
            <button
              type="button"
              onClick={() => setModal({ kind: 'new-set' })}
              className="flex shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed bg-card p-3 transition-colors hover:border-muted-foreground/40 hover:bg-muted/30"
              style={{ width: 120, minHeight: 80 }}
            >
              <Plus className="size-4 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">New set</span>
            </button>

            {/* Existing sets */}
            {sets.map((set) => (
              <SetCard
                key={set.id}
                set={set}
                onClick={() => {
                  const theme = CURATED_THEMES.find((t) => t.id === set.curatedThemeId);
                  if (set.type === 'curated' && theme) {
                    setModal({ kind: 'curated-preview', theme });
                  }
                }}
                onDelete={() => handleDeleteSet(set.id)}
              />
            ))}
          </div>
        </div>

        {/* ── UPLOAD ZONE ─────────────────────────────────────── */}
        {showUploader ? (
          <div className="mb-5 rounded-xl border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium">Upload files</p>
              <button type="button" onClick={() => setShowUploader(false)} className="rounded p-1 hover:bg-muted">
                <X className="size-4 text-muted-foreground" />
              </button>
            </div>
            {isTagging ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
                Saving to your library...
              </div>
            ) : (
              <FileUploaderRegular
                pubkey={pubkey}
                multiple
                imgOnly={false}
                sourceList="local, url, dropbox, gdrive, camera"
                onDoneClick={handleUploadDone}
                classNameUploader="uc-light"
                className="w-full"
              />
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

        {/* ── FILTER BAR ──────────────────────────────────────── */}
        {selectMode ? (
          <BulkBar
            count={selectedUuids.size}
            onSelectAll={() => setSelectedUuids(new Set(assets.map((a) => a.uuid)))}
            onDeselectAll={() => setSelectedUuids(new Set())}
            onDelete={handleBulkDelete}
            onCategoryChange={handleBulkCategory}
            onCancel={() => { setSelectMode(false); setSelectedUuids(new Set()); }}
            deleting={bulkDeleting}
          />
        ) : (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {/* Type tabs */}
            <div className="flex items-center rounded-lg border bg-muted/30 p-0.5">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setFilter(tab.value)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    filter === tab.value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Category dropdown */}
            <CategoryDropdown value={categoryFilter} onChange={setCategoryFilter} />

            {/* Info icon */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="rounded-full p-1 text-muted-foreground/60 hover:text-muted-foreground">
                  <Info className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[240px] text-[11px] leading-relaxed">
                Categories control how NativPost uses your media. Items tagged with a category are picked when generating that post type. Filter here to review what is tagged where.
              </TooltipContent>
            </Tooltip>

            <div className="flex-1" />

            <span className="text-xs text-muted-foreground">{total} {total === 1 ? 'item' : 'items'}</span>

            <button
              type="button"
              onClick={() => load(filter, categoryFilter)}
              className="rounded-lg border p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Refresh"
            >
              <RefreshCw className="size-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setShowUploader(true)}
              className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
            >
              <Upload className="size-3.5" />
              Upload
            </button>

            <button
              type="button"
              onClick={() => setSelectMode(true)}
              className="rounded-lg border bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-colors hover:opacity-90"
            >
              Select
            </button>

            <button
              type="button"
              onClick={() => setModal({ kind: 'what-is-this' })}
              className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
            >
              <HelpCircle className="size-3.5" />
              <span className="hidden sm:inline">What is this?</span>
            </button>
          </div>
        )}

        {/* ── MEDIA GRID ──────────────────────────────────────── */}
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-3 rounded-xl border border-dashed p-5">
              <ImageIcon className="size-10 text-muted-foreground/30" />
            </div>
            <p className="text-sm font-medium">No assets yet</p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              Upload images and videos to use across your posts and content generation.
            </p>
            <button
              type="button"
              onClick={() => setShowUploader(true)}
              className="mt-5 flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-medium transition-colors hover:bg-muted"
            >
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
                    key={asset.uuid}
                    asset={asset}
                    isSelected={selectedUuids.has(asset.uuid)}
                    isDeleting={deleting === asset.uuid}
                    selectMode={selectMode || !!creatingSetType}
                    onClick={() => handleCardClick(asset)}
                    onDelete={(e) => { e.stopPropagation(); handleDelete(asset); }}
                  />
                ) : (
                  <ImageCard
                    key={asset.uuid}
                    asset={asset}
                    isSelected={selectedUuids.has(asset.uuid)}
                    isDeleting={deleting === asset.uuid}
                    selectMode={selectMode || !!creatingSetType}
                    onClick={() => handleCardClick(asset)}
                    onDelete={(e) => { e.stopPropagation(); handleDelete(asset); }}
                  />
                )
              )}
            </div>

            {nextOffset !== null && (
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="flex items-center gap-2 rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60"
                >
                  {isLoadingMore && <Loader2 className="size-4 animate-spin" />}
                  Load more
                </button>
              </div>
            )}
          </>
        )}

        {/* ── CREATE SET BOTTOM BAR ───────────────────────────── */}
        {creatingSetType && (
          <CreateSetBar
            type={creatingSetType}
            selectedCount={selectedUuids.size}
            minRequired={1}
            name={newSetName}
            onNameChange={setNewSetName}
            onSave={handleSaveSet}
            onCancel={() => { setCreatingSetType(null); setNewSetName(''); setSelectedUuids(new Set()); }}
            saving={savingSet}
          />
        )}

        {/* ── MODALS ──────────────────────────────────────────── */}
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
            onSelectSlideshow={() => {
              setModal({ kind: 'none' });
              setCreatingSetType('slideshow');
              setSelectMode(false);
              setSelectedUuids(new Set());
            }}
            onSelectVideo={() => {
              setModal({ kind: 'none' });
              setCreatingSetType('video');
              setSelectMode(false);
              setSelectedUuids(new Set());
            }}
            onBrowseCurated={() => setModal({ kind: 'curated-picker' })}
          />
        )}

        {modal.kind === 'curated-picker' && (
          <CuratedPickerModal
            existing={curatedSetIds}
            onClose={() => setModal({ kind: 'none' })}
            onAdd={handleAddCuratedThemes}
          />
        )}

        {modal.kind === 'curated-preview' && (
          <CuratedPreviewModal
            theme={modal.theme}
            onClose={() => setModal({ kind: 'none' })}
            onDelete={() => {
              const set = sets.find((s) => s.curatedThemeId === modal.theme.id);
              if (set) handleDeleteSet(set.id);
            }}
          />
        )}

        {modal.kind === 'what-is-this' && (
          <WhatIsThisModal onClose={() => setModal({ kind: 'none' })} />
        )}
      </div>
    </TooltipProvider>
  );
}