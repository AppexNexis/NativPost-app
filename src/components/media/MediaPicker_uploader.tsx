'use client';

import {
  FileVideo,
  ImageIcon,
  Loader2,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

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
};

type FilterType = 'all' | 'image' | 'video';

type MediaPickerProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (urls: string[]) => void;
  multiple?: boolean;
  accept?: FilterType;
  title?: string;
  maxSelect?: number;
};

function toVideoSrc(url: string): string {
  if (/\.(?:mp4|mov|webm)(?:[/?#]|$)/i.test(url)) {
    return url;
  }
  const base = url.endsWith('/') ? url : `${url}/`;
  return `${base}video.mp4`;
}

function toThumbnailSrc(cdnUrl: string): string {
  const base = cdnUrl.endsWith('/') ? cdnUrl : `${cdnUrl}/`;
  return `${base}-/preview/300x300/-/format/webp/-/quality/smart/`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 B';
  }
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

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
  const [selectedUuids, setSelectedUuids] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterType>(accept === 'all' ? 'all' : accept);
  const [total, setTotal] = useState(0);
  const overlayRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (type: FilterType, offset = 0) => {
    if (offset === 0) {
      setIsLoading(true);
      setAssets([]);
    } else {
      setIsLoadingMore(true);
    }
    try {
      const params = new URLSearchParams({ type, limit: '48', offset: String(offset) });
      const res = await fetch(`/api/media-library?${params.toString()}`);
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
      setSelectedUuids(new Set());
    }
  }, [open, load, filter]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (open) {
      document.addEventListener('keydown', handler);
    }
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const effectiveMultiple = multiple && (!maxSelect || maxSelect > 1);
  const atSelectionLimit = maxSelect !== undefined && selectedUuids.size >= maxSelect;

  const toggleAsset = (asset: MediaAsset) => {
    setSelectedUuids((prev) => {
      const next = new Set(prev);
      if (next.has(asset.uuid)) {
        next.delete(asset.uuid);
      } else {
        if (!effectiveMultiple) {
          next.clear();
        }
        if (!atSelectionLimit || next.has(asset.uuid)) {
          next.add(asset.uuid);
        }
      }
      return next;
    });
  };

  const handleConfirm = () => {
    const selectedAssets = assets.filter(a => selectedUuids.has(a.uuid));
    onSelect(selectedAssets.map(a => a.cdnUrl));
    onClose();
  };

  const FILTER_TABS: { label: string; value: FilterType }[] = accept === 'all'
    ? [
        { label: 'All', value: 'all' },
        { label: 'Images', value: 'image' },
        { label: 'Videos', value: 'video' },
      ]
    : [];

  const selectionLabel = () => {
    if (selectedUuids.size === 0) {
      return effectiveMultiple ? 'Select assets' : 'Select an asset';
    }
    if (selectedUuids.size === 1) {
      return '1 asset selected';
    }
    return `${selectedUuids.size} assets selected`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div
        ref={overlayRef}
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
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Filter tabs — only shown when accept === 'all' */}
        {FILTER_TABS.length > 0 && (
          <div className="flex shrink-0 gap-1 border-b px-5">
            {FILTER_TABS.map(tab => (
              <button
                key={tab.value}
                type="button"
                onClick={() => {
                  setFilter(tab.value);
                  setSelectedUuids(new Set());
                }}
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
              <p className="mt-1 text-xs text-muted-foreground">
                Upload files from the media library page first.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                {assets.map((asset) => {
                  const isSelected = selectedUuids.has(asset.uuid);
                  const isDisabled = !isSelected && atSelectionLimit;

                  return (
                    <PickerCard
                      key={asset.uuid}
                      asset={asset}
                      isSelected={isSelected}
                      isDisabled={isDisabled}
                      selectionIndex={
                        isSelected && effectiveMultiple
                          ? [...selectedUuids].indexOf(asset.uuid) + 1
                          : null
                      }
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
                    className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-60"
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
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={selectedUuids.size === 0}
              className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {selectedUuids.size === 0
                ? 'Use selected'
                : `Use ${selectedUuids.size === 1 ? 'this asset' : `${selectedUuids.size} assets`}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PickerCard({
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
      className={`group relative cursor-pointer overflow-hidden rounded-lg border transition-all ${
        isSelected
          ? 'border-primary ring-2 ring-primary/20'
          : isDisabled
            ? 'cursor-not-allowed border-border opacity-40'
            : 'hover:border-muted-foreground/40'
      }`}
    >
      <div className="relative aspect-square bg-muted/30">
        {asset.isImage ? (
          <Image
            src={toThumbnailSrc(asset.cdnUrl)}
            alt={asset.name}
            fill
            className="object-cover"
            unoptimized
          />
        ) : asset.isVideo ? (
          <div className="relative size-full bg-zinc-900">
            { }
            <video
              src={toVideoSrc(asset.cdnUrl)}
              className="size-full object-cover"
              preload="metadata"
              playsInline
              muted
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex size-6 items-center justify-center rounded-full bg-black/50">
                <FileVideo className="size-3 text-white" />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex size-full items-center justify-center">
            <ImageIcon className="size-5 text-muted-foreground/40" />
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
                  <path
                    d="M2 6l3 3 5-5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Filename and size */}
      <div className="border-t p-1.5">
        <p className="truncate text-[10px] font-medium text-foreground">{asset.name}</p>
        <p className="text-[9px] text-muted-foreground">{formatBytes(asset.size)}</p>
      </div>
    </div>
  );
}
