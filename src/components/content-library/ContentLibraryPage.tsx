'use client';

import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useState } from 'react';

import { ContentLibraryBrowser } from '@/components/content-library/ContentLibraryBrowser';
import type { ContentTemplate, TemplateFilters } from '@/types/v2';

const DEFAULT_LIMIT = 24;

export function ContentLibraryPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<ContentTemplate[]>([]);
  const [filters, setFilters] = useState<TemplateFilters>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRemixing, setIsRemixing] = useState<string | null>(null);
  const [remixError, setRemixError] = useState<string | null>(null);

  const buildQuery = useCallback(
    (pageNum: number) => {
      const params = new URLSearchParams();
      params.set('page', String(pageNum));
      params.set('limit', String(DEFAULT_LIMIT));
      if (filters.contentType) params.set('contentType', filters.contentType);
      if (filters.niche) params.set('niche', filters.niche);
      if (filters.platform) params.set('platform', filters.platform);
      if (filters.angle) params.set('angle', filters.angle);
      if (filters.sort) params.set('sort', filters.sort);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      return params.toString();
    },
    [filters, searchQuery],
  );

  const fetchPage = useCallback(
    async (pageNum: number, append = false) => {
      const loadingSetter = append ? setIsLoadingMore : setIsLoading;
      loadingSetter(true);
      setError(null);

      try {
        const res = await fetch(`/api/templates?${buildQuery(pageNum)}`);
        if (!res.ok) {
          throw new Error(`Failed to load templates: ${res.status}`);
        }

        const data = (await res.json()) as {
          templates: ContentTemplate[];
          total: number;
          page: number;
          limit: number;
          totalPages: number;
          hasMore: boolean;
        };

        setTemplates((prev) => {
          const incoming = data.templates;
          if (append) {
            // Deduplicate by id so tied-score pagination doesn't create duplicates
            const seen = new Set(prev.map(t => t.id));
            const deduped = incoming.filter(t => !seen.has(t.id));
            return [...prev, ...deduped];
          }
          return incoming;
        });
        setTotal(data.total);
        setHasMore(data.hasMore);
        setPage(data.page);
      } catch (err) {
        console.error('[ContentLibraryPage] Failed to fetch templates:', err);
        setError(err instanceof Error ? err.message : 'Failed to load templates');
      } finally {
        loadingSetter(false);
      }
    },
    [buildQuery],
  );

  // Reset to page 1 whenever filters or search change.
  useEffect(() => {
    setPage(1);
    fetchPage(1, false);
  }, [filters, searchQuery]);

  const handleLoadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) return;
    fetchPage(page + 1, true);
  }, [fetchPage, hasMore, isLoadingMore, page]);

  const handleRemix = async (template: ContentTemplate) => {
    if (isRemixing) {
      return;
    }
    setIsRemixing(template.id);
    setRemixError(null);

    try {
      router.push(`/dashboard/content/create?templateId=${template.id}`);
    } catch (err) {
      console.error('[Remix] Failed:', err);
      setRemixError('Remix failed. Please try again.');
      setIsRemixing(null);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-12">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {(error || remixError) && (
          <div className="mb-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error || remixError}
          </div>
        )}
        <ContentLibraryBrowser
          templates={templates}
          total={total}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          hasMore={hasMore}
          filters={filters}
          searchQuery={searchQuery}
          onFiltersChange={setFilters}
          onSearchChange={setSearchQuery}
          onLoadMore={handleLoadMore}
          onRemix={handleRemix}
        />
      </div>

    </div>
  );
}
