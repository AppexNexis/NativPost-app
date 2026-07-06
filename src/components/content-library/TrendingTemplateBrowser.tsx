'use client';

/**
 * TrendingTemplateBrowser — used by the Create Post flow to let users start
 * from a trending template of the picked content type rather than a blank
 * form. Fetches `/api/templates?contentType=X&limit=N&sort=engagement`
 * (server-side already applies `curationStatus='approved' AND isActive=true`
 * per `nativpost-approve-set-isactive` memory).
 *
 * Delegates card rendering to `TemplateCard` so preview behavior (video
 * hover-play, slideshow arrows, engagement pills, Remix CTA) stays byte-
 * identical to the Content Library page — one card component, two hosts.
 *
 * `onRemix(template)` fires when the user clicks a card's Remix CTA. The
 * Create page navigates to `?templateId=X` which re-enters the same page
 * in the existing isRemix branch.
 */

import { Loader2, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { ContentTemplate } from '@/types/v2';

import { TemplateCard } from './TemplateCard';
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

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!contentType) return;
      setState({ status: 'loading' });
      try {
        const params = new URLSearchParams({
          contentType,
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
  }, [contentType, limit]);

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <div className="flex items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 py-10">
        <Loader2 className="mr-2 size-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading trending templates...</span>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="rounded-xl border border-red-200/60 bg-red-50/60 px-4 py-3 text-sm text-red-700">
        Couldn&apos;t load trending templates. {state.message}
      </div>
    );
  }

  if (state.templates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 py-10 text-center">
        <Sparkles className="size-6 text-muted-foreground/30" strokeWidth={1.2} />
        <p className="text-sm font-medium text-foreground">No trending templates yet</p>
        <p className="text-xs text-muted-foreground">
          Nothing has been approved for this content type. Start from scratch below.
        </p>
      </div>
    );
  }

  // Two presentations from the same data:
  //   - Mobile/narrow: Swiper Cards stack — feels native and matches the
  //     Phase 5d reference (stacked deck, auto-advance every 5s)
  //   - Desktop: 4-up grid so power users can scan and compare
  // Both render TemplateCard so hover-play, slideshow arrows, and the Remix
  // CTA stay identical to Content Library.
  return (
    <>
      <div className="lg:hidden">
        <TrendingTemplateCarousel templates={state.templates} onRemix={onRemix} />
      </div>
      <div className="hidden lg:grid lg:grid-cols-4 lg:gap-3">
        {state.templates.map(template => (
          <TemplateCard key={template.id} template={template} onRemix={onRemix} />
        ))}
      </div>
    </>
  );
}
