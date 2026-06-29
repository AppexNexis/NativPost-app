import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Film, Loader2, X } from 'lucide-react';

import { useEditor } from '../EditorContext';
import type { ContentTemplate } from '@/types/v2';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type MediaAsset = {
  publicId: string;
  name: string;
  url: string;
  thumbnailUrl: string;
  isVideo: boolean;
  isImage: boolean;
};

type ModalTab = 'trending' | 'library';

// ---------------------------------------------------------------------------
// MediaSelectModal
// ---------------------------------------------------------------------------
function MediaSelectModal({
  slot,
  contentType,
  onSelect,
  onClose,
}: {
  slot: string;
  contentType: string;
  onSelect: (slot: string, url: string, assetType: 'image' | 'video') => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ModalTab>('trending');
  const [templates, setTemplates] = useState<ContentTemplate[]>([]);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [assetsError, setAssetsError] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    setTemplatesError(null);
    try {
      const params = new URLSearchParams({ limit: '24', isApproved: 'true' });
      if (contentType) params.set('contentType', contentType);
      const res = await fetch(`/api/templates?${params}`);
      if (!res.ok) throw new Error('Failed to load templates');
      const data = await res.json();
      setTemplates(data.items || data.templates || []);
    } catch {
      setTemplatesError('Could not load trending content.');
    } finally {
      setLoadingTemplates(false);
    }
  }, [contentType]);

  const fetchAssets = useCallback(async () => {
    setLoadingAssets(true);
    setAssetsError(null);
    try {
      const res = await fetch('/api/media-library?type=video&limit=24');
      if (!res.ok) throw new Error('Failed to load media library');
      const data = await res.json();
      setAssets(data.assets || []);
    } catch {
      setAssetsError('Could not load media library.');
    } finally {
      setLoadingAssets(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    if (tab === 'library' && assets.length === 0 && !loadingAssets && !assetsError) {
      fetchAssets();
    }
  }, [tab, assets.length, loadingAssets, assetsError, fetchAssets]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[85vh] w-full flex-col rounded-t-2xl border border-border bg-card shadow-2xl sm:max-w-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">Select Media</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 border-b border-border">
          {([
            { id: 'trending' as ModalTab, label: 'Trending Content' },
            { id: 'library' as ModalTab, label: 'Media Library' },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === 'trending' && (
            <>
              {loadingTemplates && (
                <div className="flex h-32 items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {templatesError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {templatesError}
                </div>
              )}
              {!loadingTemplates && !templatesError && templates.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">No trending content found.</p>
              )}
              <div className="grid grid-cols-3 gap-3">
                {templates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => t.mediaUrl && onSelect(slot, t.mediaUrl, 'video')}
                    className="group overflow-hidden rounded-xl border border-border bg-background transition-all hover:border-primary hover:shadow-md"
                  >
                    <div className="relative aspect-[9/16] overflow-hidden bg-muted">
                      {t.thumbnailUrl ? (
                        <Image
                          src={t.thumbnailUrl}
                          alt={t.sourceCreator || 'Template'}
                          fill
                          className="object-cover transition-transform group-hover:scale-105"
                          sizes="200px"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Film className="size-8 text-muted-foreground/30" />
                        </div>
                      )}
                    </div>
                    <div className="p-2 text-left">
                      <p className="truncate text-xs font-medium text-foreground">
                        {t.sourceCreator || 'Trending'}
                      </p>
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground capitalize">
                        {t.contentType?.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {tab === 'library' && (
            <>
              {loadingAssets && (
                <div className="flex h-32 items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {assetsError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {assetsError}
                </div>
              )}
              {!loadingAssets && !assetsError && assets.length === 0 && (
                <div className="py-12 text-center">
                  <Film className="mx-auto mb-2 size-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No videos in your media library yet.</p>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                {assets.map(a => (
                  <button
                    key={a.publicId}
                    onClick={() => onSelect(slot, a.url, a.isVideo ? 'video' : 'image')}
                    className="group overflow-hidden rounded-xl border border-border bg-background transition-all hover:border-primary hover:shadow-md"
                  >
                    <div className="relative aspect-[9/16] overflow-hidden bg-muted">
                      {a.thumbnailUrl ? (
                        <Image
                          src={a.thumbnailUrl}
                          alt={a.name}
                          fill
                          className="object-cover transition-transform group-hover:scale-105"
                          sizes="200px"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Film className="size-8 text-muted-foreground/30" />
                        </div>
                      )}
                      {a.isVideo && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="rounded-full bg-black/40 p-2">
                            <Film className="size-4 text-white" />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="p-2 text-left">
                      <p className="truncate text-xs font-medium text-foreground">{a.name}</p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MediaTab
// ---------------------------------------------------------------------------
export function MediaTab() {
  const { state, dispatch } = useEditor();
  const [modalSlot, setModalSlot] = useState<string | null>(null);

  const handleSelect = (slot: string, url: string, assetType: 'image' | 'video') => {
    if (slot === 'background') {
      dispatch({ type: 'UPDATE_MEDIA_SLOTS', payload: { background: { url, assetType } } });
    } else if (slot === 'hookVideo') {
      dispatch({ type: 'UPDATE_MEDIA_SLOTS', payload: { hookVideo: { url, assetType } } });
    } else if (slot === 'demoVideo') {
      dispatch({ type: 'UPDATE_MEDIA_SLOTS', payload: { demoVideo: { url, assetType } } });
    } else if (slot === 'slide') {
      const existing = state.mediaSlots.slides || [];
      dispatch({ type: 'UPDATE_MEDIA_SLOTS', payload: { slides: [...existing, { url, assetType }] } });
    }
    setModalSlot(null);
  };

  const clearSlot = (slot: keyof typeof state.mediaSlots) => {
    dispatch({ type: 'UPDATE_MEDIA_SLOTS', payload: { [slot]: undefined } });
  };

  const contentType = state.edit?.contentType || '';

  return (
    <div className="space-y-5">
      {/* Background video */}
      <MediaSlotCard
        label="Background video"
        media={state.mediaSlots.background}
        onSelect={() => setModalSlot('background')}
        onClear={() => clearSlot('background')}
      />

      {/* Hook video (for video_hook content type) */}
      {['video_hook', 'ugc', 'talking_head'].includes(contentType) && (
        <MediaSlotCard
          label="Hook video"
          media={state.mediaSlots.hookVideo}
          onSelect={() => setModalSlot('hookVideo')}
          onClear={() => clearSlot('hookVideo')}
        />
      )}

      {/* Demo video (for ugc content type) */}
      {contentType === 'ugc' && (
        <MediaSlotCard
          label="Demo video"
          media={state.mediaSlots.demoVideo}
          onSelect={() => setModalSlot('demoVideo')}
          onClear={() => clearSlot('demoVideo')}
        />
      )}

      {/* Slides (for slideshow/carousel) */}
      {['slideshow', 'carousel'].includes(contentType) && (
        <div>
          <label className="mb-2 block text-xs font-medium text-foreground">SLIDES</label>
          <div className="space-y-2">
            {(state.mediaSlots.slides || []).map((slide, idx) => (
              <div key={idx} className="flex items-center gap-3 rounded-lg border border-border bg-background p-2">
                <div className="relative size-12 shrink-0 overflow-hidden rounded-md bg-muted">
                  <Image src={slide.url} alt={`Slide ${idx + 1}`} fill className="object-cover" sizes="48px" unoptimized />
                </div>
                <span className="flex-1 text-sm text-foreground">Slide {idx + 1}</span>
                <button
                  onClick={() => {
                    const slides = [...(state.mediaSlots.slides || [])];
                    slides.splice(idx, 1);
                    dispatch({ type: 'UPDATE_MEDIA_SLOTS', payload: { slides } });
                  }}
                  className="text-muted-foreground transition-colors hover:text-destructive"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
            <button
              onClick={() => setModalSlot('slide')}
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              Add slide
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalSlot !== null && (
        <MediaSelectModal
          slot={modalSlot as string}
          contentType={contentType}
          onSelect={handleSelect}
          onClose={() => setModalSlot(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MediaSlotCard — reusable slot display
// ---------------------------------------------------------------------------
function MediaSlotCard({
  label,
  media,
  onSelect,
  onClear,
}: {
  label: string;
  media?: { url: string; assetType?: string };
  onSelect: () => void;
  onClear: () => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-medium text-foreground uppercase tracking-wide">{label}</label>
      <div className="rounded-xl border border-border bg-background">
        {media?.url ? (
          <div className="relative overflow-hidden rounded-xl">
            {media.assetType === 'video' || /\.(mp4|mov|webm)$/i.test(media.url) ? (
              <video
                src={media.url}
                className="aspect-video w-full rounded-t-xl object-cover"
                muted
                preload="metadata"
              />
            ) : (
              <div className="relative aspect-video w-full overflow-hidden rounded-t-xl bg-muted">
                <Image src={media.url} alt={label} fill className="object-cover" sizes="350px" unoptimized />
              </div>
            )}
            <div className="flex gap-2 border-t border-border p-2">
              <button
                onClick={onSelect}
                className="flex-1 rounded-lg border border-border py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                Change
              </button>
              <button
                onClick={onClear}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={onSelect}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl py-10 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50"
          >
            <Film className="size-7 text-muted-foreground/40" strokeWidth={1.2} />
            Select
          </button>
        )}
      </div>
    </div>
  );
}
