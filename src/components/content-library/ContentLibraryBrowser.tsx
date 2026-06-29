'use client';

import { Loader2, Search, SlidersHorizontal, X } from 'lucide-react';
import React, { useState } from 'react';

import type { ContentTemplate, ContentType, NicheTag, TemplateFilters } from '@/types/v2';

import { TemplateCard } from './TemplateCard';
import { TemplatePreviewModal } from './TemplatePreviewModal';

type ContentLibraryBrowserProps = {
  templates: ContentTemplate[];
  total: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  filters: TemplateFilters;
  searchQuery: string;
  onFiltersChange: (filters: TemplateFilters) => void;
  onSearchChange: (query: string) => void;
  onLoadMore: () => void;
  onRemix: (template: ContentTemplate) => void;
};

const CONTENT_TYPE_OPTIONS: { value: ContentType; label: string }[] = [
  { value: 'slideshow', label: 'Slideshow' },
  { value: 'wall_of_text', label: 'Wall of Text' },
  { value: 'talking_head', label: 'Talking Head' },
  { value: 'green_screen_meme', label: 'Green Screen' },
  { value: 'video_hook_demo', label: 'Video Hook' },
  { value: 'ugc', label: 'UGC' },
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

export function ContentLibraryBrowser({
  templates,
  total,
  isLoading,
  isLoadingMore,
  hasMore,
  filters,
  searchQuery,
  onFiltersChange,
  onSearchChange,
  onLoadMore,
  onRemix,
}: ContentLibraryBrowserProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<ContentTemplate | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const handleFilterChange = React.useCallback(
    <K extends keyof TemplateFilters>(key: K, value: TemplateFilters[K]) => {
      onFiltersChange({ ...filters, [key]: value });
    },
    [filters, onFiltersChange],
  );

  const clearFilters = () => {
    onFiltersChange({});
    onSearchChange('');
  };

  const activeFilterCount
    = Object.values(filters).filter(v => v !== undefined && v !== '').length
      + (searchQuery ? 1 : 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Trending Content</h1>
          <p className="text-sm text-muted-foreground">
            Browse and remix high-performing short-form templates.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-72">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              className="h-10 w-full rounded-full border border-border bg-background pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowFilters(s => !s)}
            className={`relative flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors ${
              showFilters || activeFilterCount > 0
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-border bg-background text-foreground hover:bg-muted'
            }`}
          >
            <SlidersHorizontal className="size-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FilterSelect
              label="Content Type"
              value={filters.contentType || ''}
              options={[{ value: '', label: 'All types' }, ...CONTENT_TYPE_OPTIONS]}
              onChange={v =>
                handleFilterChange('contentType', (v as ContentType) || undefined)}
            />
            <FilterSelect
              label="Niche"
              value={filters.niche || ''}
              options={[{ value: '', label: 'All niches' }, ...NICHE_OPTIONS]}
              onChange={v => handleFilterChange('niche', (v as NicheTag) || undefined)}
            />
            <FilterSelect
              label="Platform"
              value={filters.platform || ''}
              options={[
                { value: '', label: 'All platforms' },
                { value: 'tiktok', label: 'TikTok' },
                { value: 'instagram', label: 'Instagram' },
                { value: 'youtube', label: 'YouTube' },
                { value: 'pexels', label: 'Pexels' },
              ]}
              onChange={v =>
                handleFilterChange('platform', (v as 'tiktok' | 'instagram' | 'youtube' | 'pexels') || undefined)}
            />
            <FilterSelect
              label="Sort By"
              value={filters.sort || 'engagement'}
              options={SORT_OPTIONS}
              onChange={v =>
                handleFilterChange('sort', v as 'engagement' | 'remixes' | 'newest')}
            />
          </div>

          {activeFilterCount > 0 && (
            <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={clearFilters}
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3.5" />
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        {isLoading && templates.length === 0 ? 'Loading templates...' : (
          <>
            {total}
            {' '}
            template
            {total !== 1 ? 's' : ''}
            {' '}
            found
          </>
        )}
      </div>

      {/* Grid */}
      {templates.length > 0 ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {templates.map(template => (
              <TemplateCard
                key={template.id}
                template={template}
                onRemix={onRemix}
                onClick={setSelectedTemplate}
              />
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={onLoadMore}
                disabled={isLoadingMore}
                className="flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Loading more...
                  </>
                ) : (
                  <>Load more templates</>
                )}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-20 text-muted-foreground">
          {isLoading ? (
            <Loader2 className="mb-4 size-12 animate-spin opacity-20" />
          ) : (
            <Search className="mb-4 size-12 opacity-20" />
          )}
          <p className="text-lg font-medium">
            {isLoading ? 'Loading templates...' : 'No templates found'}
          </p>
          {!isLoading && <p className="text-sm">Try adjusting your filters or search query</p>}
        </div>
      )}

      {/* Preview modal */}
      {selectedTemplate && (
        <TemplatePreviewModal
          template={selectedTemplate}
          onClose={() => setSelectedTemplate(null)}
          onRemix={onRemix}
        />
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
