'use client';

/**
 * MediaPicker — Cloudinary replacement for the Uploadcare-based picker modal.
 *
 * Key changes from Uploadcare version:
 *  - Asset type is now MediaAsset from the Cloudinary API route
 *  - publicId replaces uuid as the primary key
 *  - cldThumbnail() / cldVideoSrc() replace ucThumbnail() / ucVideoSrc()
 *  - Video hover-autoplay card kept and improved
 *  - onSelect() now returns publicIds[] instead of CDN URLs[]
 */

import { FileVideo, ImageIcon, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cldThumbnail, cldVideoSrc, cldVideoThumbnail } from '@/lib/cloudflare-helpers';
import type { MediaAsset } from '@/app/api/media-library/route';

type FilterType = 'all' | 'image' | 'video';

type MediaPickerProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (publicIds: string[]) => void;   // ← was: urls[]
  multiple?: boolean;
  accept?: FilterType;
  title?: string;
  maxSelect?: number;
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

// ---------------------------------------------------------------------------
// Picker card for images
// ---------------------------------------------------------------------------
function ImagePickerCard({
  asset,
  isSelected,
  isDisabled,
  selectionIndex,
  onClick,
}: {
  asset: MediaAsset;
  isSelected: boolean;
  isDisabled: boolean;
  selectionIndex: number | null;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`group relative cursor-pointer overflow-hidden rounded-xl border transition-all duration-150 ${
        isSelected
          ? 'border-primary ring-2 ring-primary/20'
          : isDisabled
            ? 'cursor-not-allowed border-border opacity-40'
            : 'border-border hover:border-muted-foreground/40'
      }`}
    >
      <div className="relative aspect-square overflow-hidden bg-muted/30">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cldThumbnail(asset.publicId, 300)}
          alt={asset.name}
          className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          loading="lazy"
        />

        {/* Category badges */}
        {asset.categories.length > 0 && (
          <div className="absolute bottom-1.5 left-1.5 flex flex-wrap gap-1">
            {asset.categories.slice(0, 1).map(cat => (
              <span key={cat} className="rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-white">
                {cat}
              </span>
            ))}
          </div>
        )}

        {/* Selection indicator */}
        {isSelected && (
          <div className="absolute inset-0 bg-primary/10">
            <div className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-white">
              {selectionIndex !== null ? (
                <span className="text-[9px] font-bold">{selectionIndex}</span>
              ) : (
                <svg className="size-3" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="border-t p-1.5">
        <p className="truncate text-[10px] font-medium text-foreground">{asset.name}</p>
        <p className="text-[9px] text-muted-foreground">{formatBytes(asset.size)}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Picker card for videos — hover autoplay
// ---------------------------------------------------------------------------
function VideoPickerCard({
  asset,
  isSelected,
  isDisabled,
  selectionIndex,
  onClick,
}: {
  asset: MediaAsset;
  isSelected: boolean;
  isDisabled: boolean;
  selectionIndex: number | null;
  onClick: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hovering, setHovering] = useState(false);

  return (
    <div
      onClick={onClick}
      className={`group relative cursor-pointer overflow-hidden rounded-xl border transition-all duration-150 ${
        isSelected
          ? 'border-primary ring-2 ring-primary/20'
          : isDisabled
            ? 'cursor-not-allowed border-border opacity-40'
            : 'border-border hover:border-muted-foreground/40'
      }`}
      onMouseEnter={() => {
        setHovering(true);
        videoRef.current?.play().catch(() => {});
      }}
      onMouseLeave={() => {
        setHovering(false);
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.currentTime = 0;
        }
      }}
    >
      <div className="relative aspect-square overflow-hidden bg-zinc-950">
        <video
          ref={videoRef}
          src={cldVideoSrc(asset.publicId)}
          poster={cldVideoThumbnail(asset.publicId, 300)}
          className={`size-full object-cover transition-opacity duration-200 ${hovering ? 'opacity-100' : 'opacity-80'}`}
          preload="metadata"
          playsInline
          muted
          loop
        />
        {!hovering && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex size-7 items-center justify-center rounded-full bg-black/50">
              <FileVideo className="size-3.5 text-white" />
            </div>
          </div>
        )}

        {/* Selection indicator */}
        {isSelected && (
          <div className="absolute inset-0 bg-primary/10">
            <div className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-white">
              {selectionIndex !== null ? (
                <span className="text-[9px] font-bold">{selectionIndex}</span>
              ) : (
                <svg className="size-3" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="border-t p-1.5">
        <p className="truncate text-[10px] font-medium text-foreground">{asset.name}</p>
        <p className="text-[9px] text-muted-foreground">{formatBytes(asset.size)}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main MediaPicker
// ---------------------------------------------------------------------------
export function MediaPicker({
  open,
  onClose,
  onSelect,
  multiple = false,
  accept = 'all',
  title = 'Select from media library',
  maxSelect,
}: MediaPickerProps) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedPublicIds, setSelectedPublicIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterType>(accept === 'all' ? 'all' : accept);
  const [total, setTotal] = useState(0);

  const load = useCallback(async (type: FilterType, offset = 0) => {
    if (offset === 0) {
      setIsLoading(true);
      setAssets([]);
    } else {
      setIsLoadingMore(true);
    }
    try {
      const params = new URLSearchParams({ type, limit: '48', offset: String(offset) });
      const res = await fetch(`/api/media-library?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (offset === 0) {
          setAssets(data.assets || []);
        } else {
          setAssets(prev => [...prev, ...(data.assets || [])]);
        }
        setNextOffset(data.nextOffset ?? null);
        setTotal(data.total ?? 0);
      }
    } catch (err) {
      console.error('[MediaPicker] Load error:', err);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      load(filter, 0);
      setSelectedPublicIds(new Set());
    }
  }, [open, load, filter]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const effectiveMultiple = multiple && (!maxSelect || maxSelect > 1);
  const atSelectionLimit = maxSelect !== undefined && selectedPublicIds.size >= maxSelect;

  const toggleAsset = (asset: MediaAsset) => {
    setSelectedPublicIds(prev => {
      const next = new Set(prev);
      if (next.has(asset.publicId)) {
        next.delete(asset.publicId);
      } else {
        if (!effectiveMultiple) next.clear();
        if (!atSelectionLimit || next.has(asset.publicId)) {
          next.add(asset.publicId);
        }
      }
      return next;
    });
  };

  const handleConfirm = () => {
    onSelect([...selectedPublicIds]);
    onClose();
  };

  const FILTER_TABS: { label: string; value: FilterType }[] =
    accept === 'all'
      ? [{ label: 'All', value: 'all' }, { label: 'Images', value: 'image' }, { label: 'Videos', value: 'video' }]
      : [];

  const selectionLabel = () => {
    if (selectedPublicIds.size === 0) return effectiveMultiple ? 'Select assets' : 'Select an asset';
    if (selectedPublicIds.size === 1) return '1 asset selected';
    return `${selectedPublicIds.size} assets selected`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 flex h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl border bg-background shadow-xl sm:mx-4 sm:h-[80vh] sm:max-w-4xl sm:rounded-xl">

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {total > 0 ? `${total} ${total === 1 ? 'asset' : 'assets'} in your library` : 'Your media library'}
              {maxSelect && maxSelect > 1 && ` · Select up to ${maxSelect}`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        {/* Filter tabs */}
        {FILTER_TABS.length > 0 && (
          <div className="flex shrink-0 gap-1 border-b px-5">
            {FILTER_TABS.map(tab => (
              <button
                key={tab.value}
                type="button"
                onClick={() => { setFilter(tab.value); setSelectedPublicIds(new Set()); }}
                className={`border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
                  filter === tab.value
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : assets.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-3 rounded-xl border border-dashed p-5">
                <ImageIcon className="size-8 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No assets in your library</p>
              <p className="mt-1 text-xs text-muted-foreground">Upload files first to see them here.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                {assets.map(asset => {
                  const isSelected = selectedPublicIds.has(asset.publicId);
                  const isDisabled = !isSelected && atSelectionLimit;
                  const selectionIndex =
                    isSelected && effectiveMultiple
                      ? [...selectedPublicIds].indexOf(asset.publicId) + 1
                      : null;

                  return asset.isVideo ? (
                    <VideoPickerCard
                      key={asset.publicId}
                      asset={asset}
                      isSelected={isSelected}
                      isDisabled={isDisabled}
                      selectionIndex={selectionIndex}
                      onClick={() => !isDisabled && toggleAsset(asset)}
                    />
                  ) : (
                    <ImagePickerCard
                      key={asset.publicId}
                      asset={asset}
                      isSelected={isSelected}
                      isDisabled={isDisabled}
                      selectionIndex={selectionIndex}
                      onClick={() => !isDisabled && toggleAsset(asset)}
                    />
                  );
                })}
              </div>

              {nextOffset !== null && (
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => load(filter, nextOffset)}
                    disabled={isLoadingMore}
                    className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-medium hover:bg-muted disabled:opacity-60"
                  >
                    {isLoadingMore && <Loader2 className="size-3 animate-spin" />}
                    Load more
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t bg-muted/20 px-5 py-3">
          <p className="text-xs text-muted-foreground">{selectionLabel()}</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={selectedPublicIds.size === 0}
              className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {selectedPublicIds.size === 0
                ? 'Use selected'
                : `Use ${selectedPublicIds.size === 1 ? 'this asset' : `${selectedPublicIds.size} assets`}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}