'use client';

import {
  FileVideo,
  ImageIcon,
  Layers,
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
};

export function MediaPicker({
  open,
  onClose,
  onSelect,
  multiple = false,
  accept = 'all',
  title = 'Select from library',
}: MediaPickerProps) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedUuids, setSelectedUuids] = useState<Set<string>>(new Set());
  const overlayRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setAssets([]);
    setNextCursor(null);
    try {
      const params = new URLSearchParams({ type: accept, limit: '48' });
      const res = await fetch(`/api/media-library?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAssets(data.assets || []);
        setNextCursor(data.nextCursor || null);
      }
    } catch (err) {
      console.error('[MediaPicker] Load error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [accept]);

  const loadMore = async () => {
    if (!nextCursor || isLoadingMore) {
      return;
    }
    setIsLoadingMore(true);
    try {
      const params = new URLSearchParams({ type: accept, limit: '48', next: nextCursor });
      const res = await fetch(`/api/media-library?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAssets(prev => [...prev, ...data.assets]);
        setNextCursor(data.nextCursor || null);
      }
    } catch (err) {
      console.error('[MediaPicker] Load more error:', err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (open) {
      load();
      setSelectedUuids(new Set());
    }
  }, [open, load]);

  // Close on Escape
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

  const toggleAsset = (asset: MediaAsset) => {
    setSelectedUuids((prev) => {
      const next = new Set(prev);
      if (next.has(asset.uuid)) {
        next.delete(asset.uuid);
      } else {
        if (!multiple) {
          next.clear();
        }
        next.add(asset.uuid);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    const selectedAssets = assets.filter(a => selectedUuids.has(a.uuid));
    const urls = selectedAssets.map(a => a.cdnUrl);
    onSelect(urls);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        ref={overlayRef}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 mx-4 flex h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border bg-background shadow-xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="text-xs text-muted-foreground">
              {multiple ? 'Select one or more assets.' : 'Select one asset.'}
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

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : assets.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-3 rounded-xl border border-dashed p-4">
                <ImageIcon className="size-8 text-muted-foreground/40" />
              </div>
              <p className="text-sm text-muted-foreground">No assets in your library yet.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Upload files from the media library page first.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 md:grid-cols-6">
                {assets.map(asset => (
                  <PickerCard
                    key={asset.uuid}
                    asset={asset}
                    isSelected={selectedUuids.has(asset.uuid)}
                    onClick={() => toggleAsset(asset)}
                  />
                ))}
              </div>

              {nextCursor && (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={isLoadingMore}
                    className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-medium hover:bg-muted disabled:opacity-60"
                  >
                    {isLoadingMore ? <Loader2 className="size-3 animate-spin" /> : null}
                    Load more
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t bg-muted/20 px-5 py-3">
          <p className="text-xs text-muted-foreground">
            {selectedUuids.size === 0
              ? 'Nothing selected'
              : `${selectedUuids.size} ${selectedUuids.size === 1 ? 'asset' : 'assets'} selected`}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={selectedUuids.size === 0}
              className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {selectedUuids.size === 0
                ? 'Select'
                : `Use ${selectedUuids.size === 1 ? 'this asset' : `${selectedUuids.size} assets`}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------
// Picker card
// -----------------------------------------------------------
function PickerCard({
  asset,
  isSelected,
  onClick,
}: {
  asset: MediaAsset;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`group relative cursor-pointer overflow-hidden rounded-lg border transition-all ${
        isSelected
          ? 'border-primary ring-2 ring-primary/20'
          : 'hover:border-muted-foreground/30'
      }`}
    >
      <div className="relative aspect-square bg-muted/30">
        {asset.isImage ? (
          <Image
            src={`${asset.cdnUrl.endsWith('/') ? asset.cdnUrl : `${asset.cdnUrl}/`}-/preview/200x200/-/format/webp/-/quality/smart/`}
            alt={asset.name}
            fill
            className="object-cover"
            unoptimized
          />
        ) : asset.isVideo ? (
          <div className="flex size-full items-center justify-center">
            <FileVideo className="size-5 text-muted-foreground/50" />
          </div>
        ) : (
          <div className="flex size-full items-center justify-center">
            <Layers className="size-5 text-muted-foreground/40" />
          </div>
        )}

        {/* Selection overlay */}
        {isSelected && (
          <div className="absolute inset-0 bg-primary/10">
            <div className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-primary">
              <svg className="size-3 text-white" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Filename */}
      <div className="border-t px-1.5 py-1">
        <p className="truncate text-[10px] text-muted-foreground">{asset.name}</p>
      </div>
    </div>
  );
}
