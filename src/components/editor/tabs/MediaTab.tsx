import React, { useState, useEffect, useCallback } from 'react';
import { Film, Loader2, X } from 'lucide-react';

import { useEditor } from '../EditorContext';
import { getVideoPosterUrl } from '@/lib/cloudinary';
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
      const params = new URLSearchParams({ limit: '30', isApproved: 'true' });
      if (contentType && contentType !== 'text_only') params.set('contentType', contentType);
      const res = await fetch(`/api/templates?${params}`);
      if (!res.ok) throw new Error('Failed to load templates');
      const data = await res.json();
      setTemplates(data.templates || data.items || []);
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
      const res = await fetch('/api/media-library?limit=30');
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
    if (tab === 'trending') fetchTemplates();
    else fetchAssets();
  }, [tab, fetchTemplates, fetchAssets]);

  const handleSelectTemplate = (t: ContentTemplate) => {
    const url = t.mediaUrl || t.thumbnailUrl;
    if (!url) return;
    const isVideo = Boolean(t.mediaUrl);
    onSelect(slot, url, isVideo ? 'video' : 'image');
    onClose();
  };

  const handleSelectAsset = (a: MediaAsset) => {
    const assetType = a.isVideo ? 'video' : 'image';
    onSelect(slot, a.url, assetType);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[80vh] w-full flex-col rounded-t-2xl border border-border bg-card shadow-2xl sm:max-w-xl sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Select Media</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            type="button"
            onClick={() => setTab('trending')}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
              tab === 'trending'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Trending Content
          </button>
          <button
            type="button"
            onClick={() => setTab('library')}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
              tab === 'library'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Media Library
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3">
          {tab === 'trending' && (
            <>
              {loadingTemplates && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {templatesError && (
                <p className="py-4 text-center text-xs text-red-500">{templatesError}</p>
              )}
              {!loadingTemplates && !templatesError && templates.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">No trending content found.</p>
              )}
              {!loadingTemplates && templates.length > 0 && (
                <div className="grid grid-cols-5 gap-1.5">
                  {templates.map(t => {
                    const posterUrl = getVideoPosterUrl(t.thumbnailUrl, { width: 240, height: 426 });
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleSelectTemplate(t)}
                        className="group relative aspect-[9/16] overflow-hidden rounded-lg bg-muted transition-transform hover:scale-[1.03]"
                      >
                        {posterUrl ? (
                          <img
                            src={posterUrl}
                            alt={t.sourceCreator || 'Template'}
                            className="size-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Film className="size-5 text-muted-foreground/30" />
                          </div>
                        )}
                        {t.sourceCreator && (
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4">
                            <p className="truncate text-[10px] text-white/90">{t.sourceCreator}</p>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {tab === 'library' && (
            <>
              {loadingAssets && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {assetsError && (
                <p className="py-4 text-center text-xs text-red-500">{assetsError}</p>
              )}
              {!loadingAssets && !assetsError && assets.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">Media library is empty.</p>
              )}
              {!loadingAssets && assets.length > 0 && (
                <div className="grid grid-cols-5 gap-1.5">
                  {assets.map(a => (
                    <button
                      key={a.publicId}
                      type="button"
                      onClick={() => handleSelectAsset(a)}
                      className="group relative aspect-[9/16] overflow-hidden rounded-lg bg-muted transition-transform hover:scale-[1.03]"
                    >
                      {a.thumbnailUrl ? (
                        <img
                          src={a.thumbnailUrl}
                          alt={a.name}
                          className="size-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Film className="size-5 text-muted-foreground/30" />
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4">
                        <p className="truncate text-[10px] text-white/90">{a.name}</p>
                      </div>
                      {a.isVideo && (
                        <span className="absolute right-1 top-1 rounded bg-black/60 px-1 py-0.5 text-[9px] text-white">
                          Video
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Media slot labels
// ---------------------------------------------------------------------------
const SLOT_LABELS: Record<string, string> = {
  background: 'Background',
  hookVideo: 'Hook Video',
  demoVideo: 'Demo / B-roll',
  subjectVideo: 'Subject (foreground)',
  faceVideo: 'Face Camera',
  slides: 'Slides',
  charts: 'Charts / Data',
};

// ---------------------------------------------------------------------------
// MediaTab
// ---------------------------------------------------------------------------
export function MediaTab() {
  const { state, dispatch } = useEditor();
  const [activeSlot, setActiveSlot] = useState<string | null>(null);

  const contentType = state.edit?.contentType ?? '';
  const slots = state.mediaSlots || {};

  const getSlotLabel = (key: string) => SLOT_LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());

  // Determine which slots to show based on content type
  const visibleSlots = getSlotsForContentType(contentType);

  const handleSelect = (slot: string, url: string, assetType: 'image' | 'video') => {
    if (slot === 'slides') {
      const current = slots.slides || [];
      dispatch({
        type: 'UPDATE_MEDIA_SLOTS',
        payload: { slides: [...current, { url, assetType }] },
      });
    } else {
      dispatch({
        type: 'UPDATE_MEDIA_SLOTS',
        payload: { [slot]: { url, assetType } },
      });
    }
    setActiveSlot(null);
  };

  const handleRemove = (slot: string, index?: number) => {
    if (slot === 'slides') {
      const current = slots.slides || [];
      const updated = current.filter((_, i) => i !== index);
      dispatch({ type: 'UPDATE_MEDIA_SLOTS', payload: { slides: updated } });
    } else {
      dispatch({ type: 'UPDATE_MEDIA_SLOTS', payload: { [slot]: null } });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Select replacement media for each slot.
      </p>

      {visibleSlots.map(slot => {
        const slotKey = slot as keyof typeof slots;
        const slotData = slot === 'slides' ? undefined : slots[slotKey] as { url: string; assetType?: string } | undefined;
        const slides = slot === 'slides' ? slots.slides || [] : [];

        return (
          <div key={slot}>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-foreground">{getSlotLabel(slot)}</label>
              <button
                type="button"
                onClick={() => setActiveSlot(slot)}
                className="text-[11px] font-medium text-primary transition-colors hover:text-primary/80"
              >
                Select
              </button>
            </div>

            {/* Current media preview */}
            {slot !== 'slides' && slotData && 'url' in slotData && slotData.url && (
              <div className="group relative aspect-[9/16] w-full overflow-hidden rounded-lg bg-muted">
                {slotData.assetType === 'video' || /\.(mp4|mov|webm)$/i.test(slotData.url) ? (
                  <video
                    src={slotData.url}
                    className="size-full object-cover"
                    muted
                    loop
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <img
                    src={slotData.url}
                    alt={getSlotLabel(slot)}
                    className="size-full object-cover"
                  />
                )}
                <button
                  type="button"
                  onClick={() => handleRemove(slot)}
                  className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white/80 opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100"
                >
                  <X className="size-3" />
                </button>
              </div>
            )}

            {/* Slides */}
            {slot === 'slides' && (
              <div className="space-y-2">
                {slides.length === 0 && (
                  <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/20 py-6">
                    <p className="text-xs text-muted-foreground">No slides yet. Click Select to add.</p>
                  </div>
                )}
                {slides.map((slide, i) => (
                  <div key={i} className="group relative flex items-center gap-3 rounded-lg bg-muted/30 p-2">
                    {slide.url && (
                      <div className="relative size-14 shrink-0 overflow-hidden rounded-md bg-muted">
                        {slide.assetType === 'video' || /\.(mp4|mov|webm)$/i.test(slide.url) ? (
                          <video src={slide.url} className="size-full object-cover" muted loop playsInline />
                        ) : (
                          <img src={slide.url} alt={`Slide ${i + 1}`} className="size-full object-cover" />
                        )}
                      </div>
                    )}
                    <span className="flex-1 truncate text-xs text-muted-foreground">Slide {i + 1}</span>
                    <button
                      type="button"
                      onClick={() => handleRemove(slot, i)}
                      className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Select modal */}
      {activeSlot && (
        <MediaSelectModal
          slot={activeSlot}
          contentType={contentType}
          onSelect={handleSelect}
          onClose={() => setActiveSlot(null)}
        />
      )}
    </div>
  );
}

// ── Slot visibility per content type ─────────────────────────────
function getSlotsForContentType(ct: string): string[] {
  const map: Record<string, string[]> = {
    text_only: [],
    single_image: ['background'],
    slideshow: ['slides'],
    reel: ['background', 'hookVideo'],
    ugc: ['demoVideo'],
    data_story: ['charts'],
    wall_of_text: ['background'],
    talking_head: ['background', 'faceVideo'],
    green_screen: ['background', 'subjectVideo'],
  };
  return map[ct] || ['background'];
}
