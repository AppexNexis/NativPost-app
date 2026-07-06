'use client';

/**
 * TrendingTemplateBrowser — used by the Create Post flow to let users start
 * from a trending template rather than a blank form. Fetches
 * `/api/templates?contentType=X&limit=N&sort=engagement` (server-side already
 * applies `curationStatus='approved' AND isActive=true` per
 * `nativpost-approve-set-isactive` memory).
 *
 * Phase 5d redesign — matches usefastlane's Fan Stack / Depth Carousel:
 *   - Header row: "Trending Content" pill / content-type dropdown / Preview
 *     autoplay toggle
 *   - Filter pills row: niche pills (single-select; null = all niches)
 *   - Body: single `TrendingTemplateCarousel` coverflow for all viewports
 *
 * The parent-provided `contentType` prop seeds the dropdown but users can
 * override it inline — changing the dropdown refetches. Niche filtering is
 * done client-side over the fetched batch.
 *
 * Delegates card rendering to `TemplateCard` so preview behavior (video
 * hover-play, slideshow arrows, engagement pills, Remix CTA) stays byte-
 * identical to the Content Library page.
 *
 * `onRemix(template)` fires when the user clicks a card's Remix CTA. The
 * Create page navigates to `?templateId=X` which re-enters the same page
 * in the existing isRemix branch.
 */

import { Loader2, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { ContentTemplate, NicheTag } from '@/types/v2';

import { CONTENT_TYPE_OPTIONS, NICHE_OPTIONS } from './ContentLibraryBrowser';
import { TrendingTemplateCarousel } from './TrendingTemplateCarousel';

type Props = {
  contentType: string;
  onRemix: (template: ContentTemplate) => void;
  limit?: number;
};

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; templates: ContentTemplate[] };

export function TrendingTemplateBrowser({ contentType, onRemix, limit = 12 }: Props) {
  const [state, setState] = useState<FetchState>({ status: 'idle' });
  const [selectedContentType, setSelectedContentType] = useState<string>(contentType);
  const [selectedNiche, setSelectedNiche] = useState<NicheTag | null>(null);
  const [previewAutoplay, setPreviewAutoplay] = useState<boolean>(true);

  // Keep local dropdown in sync if the parent-provided contentType changes
  // (e.g. user picks a different type on the previous step).
  useEffect(() => {
    setSelectedContentType(contentType);
  }, [contentType]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!selectedContentType) return;
      setState({ status: 'loading' });
      try {
        const params = new URLSearchParams({
          contentType: selectedContentType,
          limit: String(limit),
          sort: 'engagement',
        });
        const res = await fetch(`/api/templates?${params.toString()}`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          if (!cancelled) {
            setState({
              status: 'error',
              message: detail || `Failed to load trending (${res.status})`,
            });
          }
          return;
        }
        const data = await res.json();
        const templates: ContentTemplate[] = Array.isArray(data.templates)
          ? data.templates
          : [];
        if (!cancelled) setState({ status: 'ready', templates });
      } catch (err) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedContentType, limit]);

  // Client-side niche filter over the fetched batch. Single-select feels
  // right for a "browse" step — user picks one lens, sees results.
  const filteredTemplates = useMemo(() => {
    if (state.status !== 'ready') return [];
    if (!selectedNiche) return state.templates;
    return state.templates.filter((t) => {
      const niches = (t.niches ?? []) as NicheTag[];
      return niches.includes(selectedNiche);
    });
  }, [state, selectedNiche]);

  return (
    <div className="space-y-4">
      {/* Header row: pill / type dropdown / preview toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
          <Sparkles className="size-3.5" />
          Trending Content
        </div>

        <select
          value={selectedContentType}
          onChange={(e) => setSelectedContentType(e.target.value)}
          className="h-9 rounded-full border border-border bg-background px-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {CONTENT_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
          <span>Preview</span>
          <button
            type="button"
            role="switch"
            aria-checked={previewAutoplay}
            onClick={() => setPreviewAutoplay((v) => !v)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              previewAutoplay ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span
              className={`inline-block size-4 rounded-full bg-background shadow transition-transform ${
                previewAutoplay ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </label>
      </div>

      {/* Filter pills row — niche single-select */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSelectedNiche(null)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            selectedNiche === null
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/70'
          }`}
        >
          All
        </button>
        {NICHE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setSelectedNiche(opt.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selectedNiche === opt.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/70'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Body */}
      {state.status === 'idle' || state.status === 'loading' ? (
        <div className="flex items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 py-10">
          <Loader2 className="mr-2 size-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading trending templates...</span>
        </div>
      ) : state.status === 'error' ? (
        <div className="rounded-xl border border-red-200/60 bg-red-50/60 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t load trending templates. {state.message}
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 py-10 text-center">
          <Sparkles className="size-6 text-muted-foreground/30" strokeWidth={1.2} />
          <p className="text-sm font-medium text-foreground">No trending templates yet</p>
          <p className="text-xs text-muted-foreground">
            {selectedNiche
              ? 'No approved templates match this niche. Try another pill or start from scratch below.'
              : 'Nothing has been approved for this content type. Start from scratch below.'}
          </p>
        </div>
      ) : (
        <TrendingTemplateCarousel
          templates={filteredTemplates}
          onRemix={onRemix}
          autoplay={previewAutoplay}
        />
      )}
    </div>
  );
}
