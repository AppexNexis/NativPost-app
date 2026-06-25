"use client";

import React, { useState } from 'react';
import Image from 'next/image';
import { Upload, Search, ImageIcon, Video, Wand2, Grid3X3, List, Clock, Maximize2, Trash2 } from 'lucide-react';
import type { MediaAsset, MediaAssetFilters, AssetType, AspectRatio } from '@/types/v2';

interface MediaLibraryProps {
  assets: MediaAsset[];
  onUpload: () => void;
  onSelect: (asset: MediaAsset) => void;
  onDelete: (id: string) => void;
  selectedIds?: Set<string>;
}

const ASSET_TYPE_OPTIONS: { value: AssetType; label: string; icon: React.ReactNode }[] = [
  { value: 'image', label: 'Images', icon: <ImageIcon className="h-4 w-4" /> },
  { value: 'video', label: 'Videos', icon: <Video className="h-4 w-4" /> },
  { value: 'ai_scene', label: 'AI Scenes', icon: <Wand2 className="h-4 w-4" /> },
  { value: 'audio', label: 'Audio', icon: <Clock className="h-4 w-4" /> },
  { value: 'lottie', label: 'Lottie', icon: <Maximize2 className="h-4 w-4" /> },
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
      result = result.filter((a) => a.assetType === filters.assetType);
    }
    if (filters.aspectRatio) {
      result = result.filter((a) => a.aspectRatio === filters.aspectRatio);
    }
    if (filters.source) {
      result = result.filter((a) => a.source === filters.source);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.description?.toLowerCase().includes(q) ||
          a.tags.some((t) => t.toLowerCase().includes(q)) ||
          a.assetType.toLowerCase().includes(q)
      );
    }

    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [assets, filters, searchQuery]);

  const activeFilterCount = Object.values(filters).filter((v) => v !== undefined).length + (searchQuery ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Media Library</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`rounded-lg p-2 ${viewMode === 'grid' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`rounded-lg p-2 ${viewMode === 'list' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={onUpload}
              className="ml-2 flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-purple-700"
            >
              <Upload className="h-4 w-4" />
              Upload
            </button>
          </div>
        </div>

        {/* Search and filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search assets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>

          <div className="flex gap-2">
            {ASSET_TYPE_OPTIONS.map((type) => (
              <button
                key={type.value}
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    assetType: prev.assetType === type.value ? undefined : type.value,
                  }))
                }
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  filters.assetType === type.value
                    ? 'border-purple-300 bg-purple-50 text-purple-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {type.icon}
                {type.label}
              </button>
            ))}
          </div>

          <select
            value={filters.aspectRatio || ''}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, aspectRatio: (e.target.value as AspectRatio) || undefined }))
            }
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
          >
            <option value="">All ratios</option>
            {ASPECT_RATIO_OPTIONS.map((opt) => (
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
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Assets */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filteredAssets.map((asset) => (
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
          {filteredAssets.map((asset) => (
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
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <ImageIcon className="mb-4 h-12 w-12" />
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
      className={`group relative cursor-pointer overflow-hidden rounded-xl border bg-white transition-all ${
        isSelected ? 'border-purple-500 ring-2 ring-purple-500' : 'border-gray-200 hover:shadow-lg'
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
    >
      <div className="relative aspect-square overflow-hidden bg-gray-100">
        <Image
          src={asset.thumbnailUrl || asset.url}
          alt={asset.description || asset.assetType}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes="(max-width: 640px) 50vw, 20vw"
        />

        {/* Type badge */}
        <div className="absolute top-2 left-2 flex gap-1">
          <span className="rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm capitalize">
            {asset.assetType}
          </span>
          {isAIScene && (
            <span className="rounded bg-purple-500/80 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
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
              onClick={(e) => { e.stopPropagation(); onSelect(); }}
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-gray-900"
            >
              Select
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
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
        <p className="line-clamp-1 text-xs font-medium text-gray-700">{asset.description || 'Untitled'}</p>
        <div className="mt-1 flex items-center justify-between text-[10px] text-gray-400">
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
      className={`flex cursor-pointer items-center gap-4 rounded-xl border bg-white p-3 transition-all hover:shadow-md ${
        isSelected ? 'border-purple-500 ring-1 ring-purple-500' : 'border-gray-200'
      }`}
      onClick={onClick}
    >
      <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
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
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium capitalize text-gray-600">
            {asset.assetType}
          </span>
          <span className="text-[10px] text-gray-400">{asset.source}</span>
        </div>
        <p className="mt-0.5 truncate text-sm font-medium text-gray-900">{asset.description || 'Untitled'}</p>
        <div className="mt-0.5 flex gap-2 text-[10px] text-gray-400">
          <span>{formatFileSize(asset.fileSize)}</span>
          {asset.aspectRatio && <span>{asset.aspectRatio}</span>}
          {asset.durationSeconds && <span>{formatDuration(asset.durationSeconds)}</span>}
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-purple-600 hover:bg-purple-50"
        >
          Select
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-gray-400 hover:text-red-500"
        >
          <Trash2 className="h-4 w-4" />
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
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col md:flex-row">
          <div className="relative aspect-video w-full md:aspect-square md:w-1/2 bg-gray-100">
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
                  <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700 capitalize">
                    {asset.assetType}
                  </span>
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 capitalize">
                    {asset.source}
                  </span>
                </div>
                <h3 className="mt-2 text-lg font-semibold text-gray-900">
                  {asset.description || 'Untitled Asset'}
                </h3>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Dimensions</div>
                <div className="text-sm font-medium text-gray-900">
                  {asset.width && asset.height ? `${asset.width} × ${asset.height}` : 'Unknown'}
                </div>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Aspect Ratio</div>
                <div className="text-sm font-medium text-gray-900">{asset.aspectRatio || 'Unknown'}</div>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="text-xs text-gray-500">File Size</div>
                <div className="text-sm font-medium text-gray-900">{formatFileSize(asset.fileSize)}</div>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Duration</div>
                <div className="text-sm font-medium text-gray-900">
                  {asset.durationSeconds ? formatDuration(asset.durationSeconds) : 'N/A'}
                </div>
              </div>
            </div>

            {Object.keys(asset.aiMetadata).length > 0 && (
              <div className="mt-6">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">AI Generation Metadata</h4>
                <div className="mt-2 rounded-lg bg-gray-50 p-3">
                  <pre className="text-xs text-gray-600 whitespace-pre-wrap">{JSON.stringify(asset.aiMetadata, null, 2)}</pre>
                </div>
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={onSelect}
                className="flex-1 rounded-xl bg-purple-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-700"
              >
                Select Asset
              </button>
              <a
                href={asset.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-center text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
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
  if (bytes === null) return 'Unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
