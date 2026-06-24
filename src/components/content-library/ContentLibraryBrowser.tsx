'use client';

import React, { useState, useCallback } from 'react';
import Image from 'next/image';
import { Play, Bookmark, ExternalLink, Filter, Search, Grid3X3, List } from 'lucide-react';
import type { ContentTemplate, TemplateFilters, NicheTag, ContentType } from '@/types/v2';

interface ContentLibraryBrowserProps {
  templates: ContentTemplate[];
  onRemix: (template: ContentTemplate) => void;
  onBookmark: (templateId: string) => void;
  bookmarkedIds: Set<string>;
}

const CONTENT_TYPE_OPTIONS: { value: ContentType; label: string }[] = [
  { value: 'slideshow', label: 'Slideshow' },
  { value: 'wall_of_text', label: 'Wall of Text' },
  { value: 'talking_head', label: 'Talking Head' },
  { value: 'green_screen_meme', label: 'Green Screen' },
  { value: 'video_hook_demo', label: 'Video Hook' },
  { value: 'ugc', label: 'UGC' },
  { value: 'carousel', label: 'Carousel' },
  { value: 'custom', label: 'Custom' },
];

const NICHE_OPTIONS: { value: NicheTag; label: string }[] = [
  { value: 'b2b_saas', label: 'B2B SaaS' },
  { value: 'agency', label: 'Agency' },
  { value: 'ecommerce', label: 'E-commerce' },
  { value: 'personal_brand', label: 'Personal Brand' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'fintech', label: 'Fintech' },
  { value: 'africa_market', label: 'Africa Market' },
  { value: 'health', label: 'Health' },
  { value: 'education', label: 'Education' },
  { value: 'food', label: 'Food' },
  { value: 'travel', label: 'Travel' },
  { value: 'fashion', label: 'Fashion' },
];

const SORT_OPTIONS = [
  { value: 'engagement', label: 'Top Performing' },
  { value: 'remixes', label: 'Most Remixed' },
  { value: 'newest', label: 'Newest' },
];

export function ContentLibraryBrowser({ templates, onRemix, onBookmark, bookmarkedIds }: ContentLibraryBrowserProps) {
  const [filters, setFilters] = useState<TemplateFilters>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedTemplate, setSelectedTemplate] = useState<ContentTemplate | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const filteredTemplates = React.useMemo(() => {
    let result = [...templates];

    if (filters.contentType) {
      result = result.filter((t) => t.contentType === filters.contentType);
    }
    if (filters.niche) {
      result = result.filter((t) => t.niches.includes(filters.niche!));
    }
    if (filters.platform) {
      result = result.filter((t) => t.sourcePlatform === filters.platform);
    }
    if (filters.angle) {
      result = result.filter((t) => t.angles.includes(filters.angle!));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.sourceCreator?.toLowerCase().includes(q) ||
          t.contentType.toLowerCase().includes(q) ||
          t.niches.some((n) => n.toLowerCase().includes(q))
      );
    }

    switch (filters.sort) {
      case 'remixes':
        result.sort((a, b) => b.remixCount - a.remixCount);
        break;
      case 'newest':
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      default:
        result.sort((a, b) => (b.engagementScore || 0) - (a.engagementScore || 0));
    }

    return result;
  }, [templates, filters, searchQuery]);

  const handleFilterChange = useCallback(<K extends keyof TemplateFilters>(key: K, value: TemplateFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = () => {
    setFilters({});
    setSearchQuery('');
  };

  const activeFilterCount = Object.values(filters).filter((v) => v !== undefined && v !== '').length + (searchQuery ? 1 : 0);

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Trending Content Library</h2>
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
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search templates, creators, niches..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              showFilters || activeFilterCount > 0
                ? 'border-purple-200 bg-purple-50 text-purple-700'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Filter className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-600 text-xs text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="text-sm text-gray-500 hover:text-gray-700">
              Clear all
            </button>
          )}
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Content Type
                </label>
                <select
                  value={filters.contentType || ''}
                  onChange={(e) => handleFilterChange('contentType', (e.target.value as ContentType) || undefined)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
                >
                  <option value="">All types</option>
                  {CONTENT_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Niche
                </label>
                <select
                  value={filters.niche || ''}
                  onChange={(e) => handleFilterChange('niche', (e.target.value as NicheTag) || undefined)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
                >
                  <option value="">All niches</option>
                  {NICHE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Platform
                </label>
                <select
                  value={filters.platform || ''}
                  onChange={(e) =>
                    handleFilterChange('platform', (e.target.value as 'tiktok' | 'instagram' | 'youtube') || undefined)
                  }
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
                >
                  <option value="">All platforms</option>
                  <option value="tiktok">TikTok</option>
                  <option value="instagram">Instagram</option>
                  <option value="youtube">YouTube</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Sort By
                </label>
                <select
                  value={filters.sort || 'engagement'}
                  onChange={(e) => handleFilterChange('sort', e.target.value as 'engagement' | 'remixes' | 'newest')}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Results count */}
        <div className="text-sm text-gray-500">
          {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''} found
        </div>
      </div>

      {/* Template Grid */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filteredTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              isBookmarked={bookmarkedIds.has(template.id)}
              onRemix={() => onRemix(template)}
              onBookmark={() => onBookmark(template.id)}
              onClick={() => setSelectedTemplate(template)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredTemplates.map((template) => (
            <TemplateListItem
              key={template.id}
              template={template}
              isBookmarked={bookmarkedIds.has(template.id)}
              onRemix={() => onRemix(template)}
              onBookmark={() => onBookmark(template.id)}
              onClick={() => setSelectedTemplate(template)}
            />
          ))}
        </div>
      )}

      {filteredTemplates.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Search className="mb-4 h-12 w-12" />
          <p className="text-lg font-medium">No templates found</p>
          <p className="text-sm">Try adjusting your filters or search query</p>
        </div>
      )}

      {/* Template Detail Modal */}
      {selectedTemplate && (
        <TemplateDetailModal
          template={selectedTemplate}
          isBookmarked={bookmarkedIds.has(selectedTemplate.id)}
          onClose={() => setSelectedTemplate(null)}
          onRemix={() => onRemix(selectedTemplate)}
          onBookmark={() => onBookmark(selectedTemplate.id)}
        />
      )}
    </div>
  );
}

// ============================================================
// Template Card (Grid View)
// ============================================================
function TemplateCard({
  template,
  isBookmarked,
  onRemix,
  onBookmark,
  onClick,
}: {
  template: ContentTemplate;
  isBookmarked: boolean;
  onRemix: () => void;
  onBookmark: () => void;
  onClick: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="group relative cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-lg"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div className="relative aspect-[9/16] overflow-hidden bg-gray-100">
        <Image
          src={template.thumbnailUrl}
          alt={template.contentType}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
        />
        {/* Overlay */}
        <div
          className={`absolute inset-0 flex flex-col justify-between bg-gradient-to-b from-black/40 via-transparent to-black/60 p-3 transition-opacity ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="flex justify-between">
            <span className="rounded-full bg-black/50 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
              {template.contentType.replace('_', ' ')}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onBookmark();
              }}
              className={`rounded-full p-1.5 backdrop-blur-sm transition-colors ${
                isBookmarked ? 'bg-yellow-500 text-white' : 'bg-black/50 text-white hover:bg-black/70'
              }`}
            >
              <Bookmark className="h-3.5 w-3.5" fill={isBookmarked ? 'currentColor' : 'none'} />
            </button>
          </div>
          <div className="flex items-center justify-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemix();
              }}
              className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-lg transition-transform hover:scale-105"
            >
              <Play className="h-4 w-4" fill="currentColor" />
              Remix
            </button>
          </div>
        </div>
        {/* Duration badge */}
        {template.durationSeconds && (
          <div className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white">
            {Math.round(template.durationSeconds)}s
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="capitalize">{template.sourcePlatform}</span>
          {template.sourceCreator && (
            <>
              <span>·</span>
              <span>@{template.sourceCreator}</span>
            </>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {template.niches.slice(0, 2).map((niche) => (
            <span
              key={niche}
              className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700"
            >
              {niche.replace('_', ' ')}
            </span>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
          <span>{template.remixCount} remixes</span>
          {template.engagementScore && (
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              {(template.engagementScore * 100).toFixed(0)}% engagement
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Template List Item (List View)
// ============================================================
function TemplateListItem({
  template,
  isBookmarked,
  onRemix,
  onBookmark,
  onClick,
}: {
  template: ContentTemplate;
  isBookmarked: boolean;
  onRemix: () => void;
  onBookmark: () => void;
  onClick: () => void;
}) {
  return (
    <div
      className="flex cursor-pointer items-center gap-4 rounded-xl border border-gray-200 bg-white p-3 transition-shadow hover:shadow-md"
      onClick={onClick}
    >
      <div className="relative h-20 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
        <Image
          src={template.thumbnailUrl}
          alt={template.contentType}
          fill
          className="object-cover"
          sizes="48px"
        />
        {template.durationSeconds && (
          <div className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] font-medium text-white">
            {Math.round(template.durationSeconds)}s
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium capitalize text-gray-600">
            {template.contentType.replace('_', ' ')}
          </span>
          <span className="text-xs text-gray-400 capitalize">{template.sourcePlatform}</span>
        </div>
        <p className="mt-1 truncate text-sm font-medium text-gray-900">
          {template.sourceCreator ? `@${template.sourceCreator}` : 'Unknown creator'}
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          {template.niches.slice(0, 3).map((niche) => (
            <span key={niche} className="text-xs text-gray-500">
              #{niche.replace('_', '')}
            </span>
          ))}
        </div>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <div className="text-right text-xs text-gray-500">
          <div>{template.remixCount} remixes</div>
          {template.engagementScore && (
            <div className="text-green-600">{(template.engagementScore * 100).toFixed(0)}% engagement</div>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onBookmark();
          }}
          className={`rounded-lg p-2 transition-colors ${
            isBookmarked ? 'bg-yellow-50 text-yellow-600' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
          }`}
        >
          <Bookmark className="h-4 w-4" fill={isBookmarked ? 'currentColor' : 'none'} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemix();
          }}
          className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
        >
          <Play className="h-3.5 w-3.5" fill="currentColor" />
          Remix
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Template Detail Modal
// ============================================================
function TemplateDetailModal({
  template,
  isBookmarked,
  onClose,
  onRemix,
  onBookmark,
}: {
  template: ContentTemplate;
  isBookmarked: boolean;
  onClose: () => void;
  onRemix: () => void;
  onBookmark: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-video w-full overflow-hidden bg-gray-100">
          <Image
            src={template.thumbnailUrl}
            alt={template.contentType}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 672px"
          />
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-purple-100 px-3 py-1 text-sm font-medium text-purple-700 capitalize">
                  {template.contentType.replace('_', ' ')}
                </span>
                <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-600 capitalize">
                  {template.sourcePlatform}
                </span>
              </div>
              <h3 className="mt-2 text-lg font-semibold text-gray-900">
                {template.sourceCreator ? `@${template.sourceCreator}` : 'Unknown creator'}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onBookmark}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  isBookmarked
                    ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Bookmark className="mr-1.5 inline h-4 w-4" fill={isBookmarked ? 'currentColor' : 'none'} />
                {isBookmarked ? 'Saved' : 'Save'}
              </button>
              <a
                href={template.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                <ExternalLink className="h-4 w-4" />
                View Source
              </a>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-4 gap-4">
            <StatBox label="Views" value={formatNumber(template.viewCount)} />
            <StatBox label="Likes" value={formatNumber(template.likeCount)} />
            <StatBox label="Shares" value={formatNumber(template.shareCount)} />
            <StatBox label="Remixes" value={template.remixCount.toString()} />
          </div>

          {/* Structure */}
          {template.structure && Object.keys(template.structure).length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Structure</h4>
              <div className="mt-2 space-y-2">
                {template.structure.hook && (
                  <div className="rounded-lg bg-gray-50 p-3">
                    <div className="text-xs font-medium text-purple-600">Hook</div>
                    <div className="mt-1 text-sm text-gray-700">{template.structure.hook.text}</div>
                    <div className="mt-1 text-xs text-gray-400">{template.structure.hook.duration}s</div>
                  </div>
                )}
                {template.structure.body && (
                  <div className="rounded-lg bg-gray-50 p-3">
                    <div className="text-xs font-medium text-blue-600">Body</div>
                    <div className="mt-1 text-sm text-gray-700">{template.structure.body.text}</div>
                    <div className="mt-1 text-xs text-gray-400">{template.structure.body.duration}s</div>
                  </div>
                )}
                {template.structure.cta && (
                  <div className="rounded-lg bg-gray-50 p-3">
                    <div className="text-xs font-medium text-green-600">CTA</div>
                    <div className="mt-1 text-sm text-gray-700">{template.structure.cta.text}</div>
                    <div className="mt-1 text-xs text-gray-400">{template.structure.cta.duration}s</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Niches and Angles */}
          <div className="mt-6 flex flex-wrap gap-6">
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Niches</h4>
              <div className="mt-2 flex flex-wrap gap-2">
                {template.niches.map((niche) => (
                  <span key={niche} className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
                    {niche.replace('_', ' ')}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Angles</h4>
              <div className="mt-2 flex flex-wrap gap-2">
                {template.angles.map((angle) => (
                  <span key={angle} className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
                    {angle}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-8 flex justify-end">
            <button
              onClick={onRemix}
              className="flex items-center gap-2 rounded-xl bg-purple-600 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-purple-700"
            >
              <Play className="h-5 w-5" fill="currentColor" />
              Remix This Template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3 text-center">
      <div className="text-lg font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function formatNumber(num: number | null): string {
  if (num === null || num === undefined) return '—';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}
