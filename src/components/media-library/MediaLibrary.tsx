'use client';

import { Clock, Grid3X3, ImageIcon, List, Maximize2, Search, Trash2, Upload, Video, Wand2 } from 'lucide-react';
import Image from 'next/image';
import React, { useState } from 'react';

import type { AspectRatio, AssetType, MediaAsset, MediaAssetFilters } from '@/types/v2';

type MediaLibraryProps = {
  assets: MediaAsset[];
  onUpload: () => void;
  onSelect: (asset: MediaAsset) => void;
  onDelete: (id: string) => void;
  selectedIds?: Set<string>;
};

const ASSET_TYPE_OPTIONS: { value: AssetType; label: string; icon: React.ReactNode }[] = [
  { value: 'image', label: 'Images', icon: <ImageIcon className="size-4" /> },
  { value: 'video', label: 'Videos', icon: <Video className="size-4" /> },
  { value: 'ai_scene', label: 'AI Scenes', icon: <Wand2 className="size-4" /> },
  { value: 'audio', label: 'Audio', icon: <Clock className="size-4" /> },
  { value: 'lottie', label: 'Lottie', icon: <Maximize2 className="size-4" /> },
];

const ASPECT_RATIO_OPTIONS: { value: AspectRatio; label: string }[] = [
  { value: '9:16', label: '9:16 (Stories)' },
  { value: '1:1', label: '1:1 (Square)' },
  { value: '16:9', label: '16:9 (Landscape)' },
  { value: '4:3', label: '4:3 (Standard)' },
  { value: '3:4', label: '3:4 (Portrait)' },
  { value: '2:3', label: '2:3 (Pinterest)' },
  { value: '3:2', label: '3:2 (Wide)' },
  { value: '21:9', label: '21:9 (Cinematic)' },
];

export function MediaLibrary({ assets, onUpload, onSelect, onDelete, selectedIds }: MediaLibraryProps) {
  const [filters, setFilters] = useState<MediaAssetFilters>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);

  const filteredAssets = React.useMemo(() => {
    let result = [...assets];

    if (filters.assetType) {
      result = result.filter(a => a.assetType === filters.assetType);
    }
    if (filters.aspectRatio) {
      result = result.filter(a => a.aspectRatio === filters.aspectRatio);
    }
    if (filters.source) {
      result = result.filter(a => a.source === filters.source);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        a =>
          a.description?.toLowerCase().includes(q)
          || a.tags.some(t => t.toLowerCase().includes(q))
          || a.assetType.toLowerCase().includes(q),
      );
    }

    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [assets, filters, searchQuery]);

  const activeFilterCount = Object.values(filters).filter(v => v !== undefined).length + (searchQuery ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">Media Library</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`rounded-lg p-2 ${viewMode === 'grid' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Grid3X3 className="size-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`rounded-lg p-2 ${viewMode === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <List className="size-4" />
            </button>
            <button
              onClick={onUpload}
              className="ml-2 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Upload className="size-4" />
              Upload
            </button>
          </div>
        </div>

        {/* Search and filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search assets..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border bg-background py-2 pl-10 pr-4 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex gap-2">
            {ASSET_TYPE_OPTIONS.map(type => (
              <button
                key={type.value}
                onClick={() =>
                  setFilters(prev => ({
                    ...prev,
                    assetType: prev.assetType === type.value ? undefined : type.value,
                  }))}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  filters.assetType === type.value
                    ? 'border-primary/30 bg-primary/5 text-primary'
                    : 'border text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                }`}
              >
                {type.icon}
                {type.label}
              </button>
            ))}
          </div>

          <select
            value={filters.aspectRatio || ''}
            onChange={e =>
              setFilters(prev => ({ ...prev, aspectRatio: (e.target.value as AspectRatio) || undefined }))}
            className="rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          >
            <option value="">All ratios</option>
            {ASPECT_RATIO_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {activeFilterCount > 0 && (
            <button
              onClick={() => {
                setFilters({});
                setSearchQuery('');
              }}
              className="text-body text-muted-foreground hover:text-foreground"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Assets */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filteredAssets.map(asset => (
            <AssetCard
              key={asset.id}
              asset={asset}
              isSelected={selectedIds?.has(asset.id)}
              onClick={() => setSelectedAsset(asset)}
              onSelect={() => onSelect(asset)}
              onDelete={() => onDelete(asset.id)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredAssets.map(asset => (
            <AssetListItem
              key={asset.id}
              asset={asset}
              isSelected={selectedIds?.has(asset.id)}
              onClick={() => setSelectedAsset(asset)}
              onSelect={() => onSelect(asset)}
              onDelete={() => onDelete(asset.id)}
            />
          ))}
        </div>
      )}

      {filteredAssets.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <ImageIcon className="mb-4 size-12" />
          <p className="text-lg font-medium">No assets found</p>
          <p className="text-sm">Upload your first asset or adjust your filters</p>
        </div>
      )}

      {/* Asset Detail Modal */}
      {selectedAsset && (
        <AssetDetailModal asset={selectedAsset} onClose={() => setSelectedAsset(null)} onSelect={() => onSelect(selectedAsset)} />
      )}
    </div>
  );
}

// ============================================================
// Asset Card
// ============================================================
function AssetCard({
  asset,
  isSelected,
  onClick,
  onSelect,
  onDelete,
}: {
  asset: MediaAsset;
  isSelected?: boolean;
  onClick: () => void;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  // const isVideo = asset.assetType === 'video';
  const isAIScene = asset.source === 'ai_generated' || asset.source === 'flux' || asset.source === 'seedance';

  return (
    <div
      className={`group relative cursor-pointer overflow-hidden rounded-xl border bg-card transition-all ${
        isSelected ? 'border-primary ring-2 ring-primary' : 'hover:shadow-sm'
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        <Image
          src={asset.thumbnailUrl || asset.url}
          alt={asset.description || asset.assetType}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes="(max-width: 640px) 50vw, 20vw"
        />

        {/* Type badge */}
        <div className="absolute left-2 top-2 flex gap-1">
          <span className="rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-medium capitalize text-white backdrop-blur-sm">
            {asset.assetType}
          </span>
          {isAIScene && (
            <span className="rounded bg-primary/80 px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground backdrop-blur-sm">
              AI
            </span>
          )}
        </div>

        {/* Hover overlay */}
        <div
          className={`absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation(); onSelect();
              }}
              className="rounded-lg bg-background px-3 py-1.5 text-xs font-medium text-foreground"
            >
              Select
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation(); onDelete();
              }}
              className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Duration */}
        {asset.durationSeconds && (
          <div className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {formatDuration(asset.durationSeconds)}
          </div>
        )}

        {/* Aspect ratio */}
        {asset.aspectRatio && (
          <div className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {asset.aspectRatio}
          </div>
        )}
      </div>

      <div className="p-2.5">
        <p className="line-clamp-1 text-xs font-medium text-foreground">{asset.description || 'Untitled'}</p>
        <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{formatFileSize(asset.fileSize)}</span>
          <span>{asset.width && asset.height ? `${asset.width}×${asset.height}` : ''}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Asset List Item
// ============================================================
function AssetListItem({
  asset,
  isSelected,
  onClick,
  onSelect,
  onDelete,
}: {
  asset: MediaAsset;
  isSelected?: boolean;
  onClick: () => void;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`flex cursor-pointer items-center gap-4 rounded-xl border bg-card p-3 transition-all hover:shadow-sm ${
        isSelected ? 'border-primary ring-1 ring-primary' : ''
      }`}
      onClick={onClick}
    >
      <div className="relative size-14 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
        <Image
          src={asset.thumbnailUrl || asset.url}
          alt=""
          fill
          className="object-cover"
          sizes="56px"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
            {asset.assetType}
          </span>
          <span className="text-[10px] text-muted-foreground">{asset.source}</span>
        </div>
        <p className="mt-0.5 truncate text-sm font-medium text-foreground">{asset.description || 'Untitled'}</p>
        <div className="mt-0.5 flex gap-2 text-[10px] text-muted-foreground">
          <span>{formatFileSize(asset.fileSize)}</span>
          {asset.aspectRatio && <span>{asset.aspectRatio}</span>}
          {asset.durationSeconds && <span>{formatDuration(asset.durationSeconds)}</span>}
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation(); onSelect();
          }}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
        >
          Select
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation(); onDelete();
          }}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Asset Detail Modal
// ============================================================
function AssetDetailModal({
  asset,
  onClose,
  onSelect,
}: {
  asset: MediaAsset;
  onClose: () => void;
  onSelect: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-background shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex flex-col md:flex-row">
          <div className="relative aspect-video w-full bg-muted md:aspect-square md:w-1/2">
            <Image
              src={asset.url}
              alt={asset.description || ''}
              fill
              className="object-contain"
              sizes="(max-width: 768px) 100vw, 400px"
            />
          </div>
          <div className="flex-1 p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium capitalize text-primary">
                    {asset.assetType}
                  </span>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium capitalize text-muted-foreground">
                    {asset.source}
                  </span>
                </div>
                <h3 className="mt-2 text-lg font-semibold text-foreground">
                  {asset.description || 'Untitled Asset'}
                </h3>
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-muted/30 p-3">
                <div className="text-meta text-muted-foreground">Dimensions</div>
                <div className="text-sm font-medium text-foreground">
                  {asset.width && asset.height ? `${asset.width} × ${asset.height}` : 'Unknown'}
                </div>
              </div>
              <div className="rounded-lg bg-muted/30 p-3">
                <div className="text-meta text-muted-foreground">Aspect Ratio</div>
                <div className="text-sm font-medium text-foreground">{asset.aspectRatio || 'Unknown'}</div>
              </div>
              <div className="rounded-lg bg-muted/30 p-3">
                <div className="text-meta text-muted-foreground">File Size</div>
                <div className="text-sm font-medium text-foreground">{formatFileSize(asset.fileSize)}</div>
              </div>
              <div className="rounded-lg bg-muted/30 p-3">
                <div className="text-meta text-muted-foreground">Duration</div>
                <div className="text-sm font-medium text-foreground">
                  {asset.durationSeconds ? formatDuration(asset.durationSeconds) : 'N/A'}
                </div>
              </div>
            </div>

            {Object.keys(asset.aiMetadata).length > 0 && (
              <div className="mt-6">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI Generation Metadata</h4>
                <div className="mt-2 rounded-lg bg-muted/30 p-3">
                  <pre className="whitespace-pre-wrap text-meta text-muted-foreground">{JSON.stringify(asset.aiMetadata, null, 2)}</pre>
                </div>
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={onSelect}
                className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Select Asset
              </button>
              <a
                href={asset.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 rounded-xl border py-2.5 text-center text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Open Original
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null) {
    return 'Unknown';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) {
    return `${s}s`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}
