'use client';

import '@uploadcare/react-uploader/core.css';

import { FileUploaderRegular } from '@uploadcare/react-uploader/next';
import {
  FileVideo,
  ImageIcon,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';

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

function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 B';
  }
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

function formatDate(iso: string): string {
  if (!iso) {
    return '';
  }
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Build a playable video src — same logic as content detail page
function toVideoSrc(url: string): string {
  if (/\.(?:mp4|mov|webm)(?:[/?#]|$)/i.test(url)) {
    return url;
  }
  const base = url.endsWith('/') ? url : `${url}/`;
  return `${base}video.mp4`;
}

// Uploadcare image CDN transformation for thumbnails
// The -/preview/ operation resizes safely without cropping
function toThumbnailSrc(cdnUrl: string, size = 300): string {
  const base = cdnUrl.endsWith('/') ? cdnUrl : `${cdnUrl}/`;
  return `${base}-/preview/${size}x${size}/-/format/webp/-/quality/smart/`;
}

export default function MediaLibraryPage() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showUploader, setShowUploader] = useState(false);
  const [isTagging, setIsTagging] = useState(false);
  const [total, setTotal] = useState(0);

  const pubkey = process.env.NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY || '';

  const fetchAssets = useCallback(async (type: FilterType, offset = 0) => {
    const params = new URLSearchParams({ type, limit: '48', offset: String(offset) });
    const res = await fetch(`/api/media-library?${params.toString()}`);
    if (!res.ok) {
      throw new Error('Failed to fetch');
    }
    return res.json() as Promise<{
      assets: MediaAsset[];
      nextOffset: number | null;
      total: number;
    }>;
  }, []);

  const load = useCallback(async (type: FilterType) => {
    setIsLoading(true);
    setAssets([]);
    setNextOffset(null);
    setSelected(null);
    try {
      const data = await fetchAssets(type, 0);
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
    if (nextOffset === null || isLoadingMore) {
      return;
    }
    setIsLoadingMore(true);
    try {
      const data = await fetchAssets(filter, nextOffset);
      setAssets(prev => [...prev, ...data.assets]);
      setNextOffset(data.nextOffset);
    } catch (err) {
      console.error('[MediaLibrary] Load more error:', err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    load(filter);
  }, [filter, load]);

  const handleUploadDone = async (files: {
    allEntries: { status: string; uuid: string | null }[];
  }) => {
    const uploaded = files.allEntries
      .filter(f => f.status === 'success' && f.uuid != null)
      .map(f => f.uuid as string);

    if (uploaded.length === 0) {
      setShowUploader(false);
      return;
    }

    setIsTagging(true);
    try {
      await Promise.all(
        uploaded.map(uuid =>
          fetch('/api/media-library/tag', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uuid }),
          }),
        ),
      );
    } catch (err) {
      console.error('[MediaLibrary] Tagging error:', err);
    } finally {
      setIsTagging(false);
      setShowUploader(false);
      load(filter);
    }
  };

  const handleDelete = async (asset: MediaAsset) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete "${asset.name}"? This cannot be undone.`)) {
      return;
    }
    setDeleting(asset.uuid);
    try {
      const res = await fetch(`/api/media-library?uuid=${asset.uuid}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setAssets(prev => prev.filter(a => a.uuid !== asset.uuid));
        setTotal(prev => prev - 1);
        if (selected?.uuid === asset.uuid) {
          setSelected(null);
        }
      }
    } finally {
      setDeleting(null);
    }
  };

  const FILTER_TABS: { label: string; value: FilterType }[] = [
    { label: 'All', value: 'all' },
    { label: 'Images', value: 'image' },
    { label: 'Videos', value: 'video' },
  ];

  return (
    <div className="flex h-full gap-0">
      {/* ── Main panel ─────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">

        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Media library</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {isLoading ? 'Loading...' : `${total} ${total === 1 ? 'asset' : 'assets'}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => load(filter)}
              className="rounded-lg border p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Refresh"
            >
              <RefreshCw className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowUploader(p => !p)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Upload className="size-4" />
              Upload
            </button>
          </div>
        </div>

        {/* Upload panel */}
        {showUploader && (
          <div className="mb-5 rounded-xl border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium">Upload files</p>
              <button
                type="button"
                onClick={() => setShowUploader(false)}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            </div>
            {isTagging ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
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
        )}

        {/* Filter tabs */}
        <div className="mb-4 flex gap-1 border-b">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setFilter(tab.value)}
              className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                filter === tab.value
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center py-20">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : assets.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
            <div className="mb-3 rounded-xl border border-dashed p-4">
              <ImageIcon className="size-8 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">No assets yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Assets attached to your posts will appear here.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {assets.map(asset => (
                <AssetCard
                  key={asset.uuid}
                  asset={asset}
                  isSelected={selected?.uuid === asset.uuid}
                  isDeleting={deleting === asset.uuid}
                  onClick={() =>
                    setSelected(prev =>
                      prev?.uuid === asset.uuid ? null : asset,
                    )}
                  onDelete={() => handleDelete(asset)}
                />
              ))}
            </div>

            {nextOffset !== null && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60"
                >
                  {isLoadingMore && <Loader2 className="size-4 animate-spin" />}
                  Load more
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Detail sidebar ──────────────────────────── */}
      {selected && (
        <div className="ml-4 w-72 shrink-0 rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-xs font-semibold">Asset details</p>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <div className="p-4">
            {/* Preview */}
            <div className="mb-4 overflow-hidden rounded-lg border bg-muted/30">
              {selected.isImage ? (
                <div className="relative aspect-video w-full">
                  <Image
                    src={toThumbnailSrc(selected.cdnUrl, 600)}
                    alt={selected.name}
                    fill
                    className="object-contain"
                    unoptimized
                  />
                </div>
              ) : selected.isVideo ? (
                <div className="aspect-video w-full bg-black">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video
                    src={toVideoSrc(selected.cdnUrl)}
                    className="size-full object-contain"
                    controls
                    preload="metadata"
                    playsInline
                  />
                </div>
              ) : (
                <div className="flex aspect-video w-full items-center justify-center">
                  <FileVideo className="size-8 text-muted-foreground/40" />
                </div>
              )}
            </div>

            {/* Details */}
            <div className="space-y-2.5">
              <SidebarRow label="Filename" value={selected.name} mono={false} />
              <div className="grid grid-cols-2 gap-2">
                <SidebarRow label="Type" value={selected.mimeType || 'Unknown'} />
                <SidebarRow label="Size" value={formatBytes(selected.size)} />
              </div>
              {selected.width && selected.height && (
                <SidebarRow
                  label="Dimensions"
                  value={`${selected.width} × ${selected.height} px`}
                />
              )}
              <SidebarRow label="Uploaded" value={formatDate(selected.uploadedAt)} />
              <div>
                <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  CDN URL
                </p>
                <p className="break-all font-mono text-[10px] text-muted-foreground">
                  {selected.cdnUrl}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-4 space-y-2 border-t pt-4">
              <a
                href={selected.isVideo ? toVideoSrc(selected.cdnUrl) : selected.cdnUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted"
              >
                Open in new tab
              </a>
              <button
                type="button"
                onClick={() => handleDelete(selected)}
                disabled={deleting === selected.uuid}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 disabled:opacity-60"
              >
                {deleting === selected.uuid
                  ? <Loader2 className="size-3 animate-spin" />
                  : <Trash2 className="size-3" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------
// Asset card
// -----------------------------------------------------------
function AssetCard({
  asset,
  isSelected,
  isDeleting,
  onClick,
  onDelete,
}: {
  asset: MediaAsset;
  isSelected: boolean;
  isDeleting: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`group relative cursor-pointer overflow-hidden rounded-lg border bg-card transition-all ${
        isSelected
          ? 'border-primary ring-2 ring-primary/20'
          : 'hover:border-muted-foreground/30'
      }`}
    >
      {/* Thumbnail */}
      <div className="relative aspect-square overflow-hidden bg-muted/30">
        {asset.isImage ? (
          // Use next/image with the Uploadcare transformation URL
          <Image
            src={toThumbnailSrc(asset.cdnUrl, 200)}
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
              <div className="flex size-7 items-center justify-center rounded-full bg-black/50">
                <FileVideo className="size-3.5 text-white" />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1.5">
            <ImageIcon className="size-6 text-muted-foreground/40" />
            <p className="line-clamp-2 px-2 text-center text-[9px] text-muted-foreground/60">
              {asset.name}
            </p>
          </div>
        )}

        {/* Selection checkmark */}
        {isSelected && (
          <div className="absolute inset-0 bg-primary/10">
            <div className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-primary">
              <svg className="size-3 text-white" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2 6l3 3 5-5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        )}

        {/* Delete button on hover */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation(); onDelete();
          }}
          disabled={isDeleting}
          className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity disabled:opacity-40 group-hover:opacity-100"
          title="Delete"
        >
          {isDeleting
            ? <Loader2 className="size-3 animate-spin" />
            : <Trash2 className="size-3" />}
        </button>
      </div>

      {/* Filename label */}
      <div className="border-t px-1.5 py-1">
        <p className="truncate text-[10px] text-muted-foreground">{asset.name}</p>
      </div>
    </div>
  );
}

// -----------------------------------------------------------
// Sidebar detail row
// -----------------------------------------------------------
function SidebarRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`break-all text-xs ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}
