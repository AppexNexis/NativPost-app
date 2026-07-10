'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, Music, RefreshCw, X } from 'lucide-react';
import { useCallback, useState } from 'react';

import type { ContentItem } from '@/types/v2';

export type CampaignPostEditModalProps = {
  campaignId: string;
  contentItem: ContentItem;
  reRollsRemaining: number;
  onCancel: () => void;
  onSaved: (updated: ContentItem) => void;
  onSwapVideo: () => void;
};

export function CampaignPostEditModal({
  campaignId,
  contentItem,
  reRollsRemaining,
  onCancel,
  onSaved,
  onSwapVideo,
}: CampaignPostEditModalProps) {
  const [previewItem, setPreviewItem] = useState<ContentItem>(contentItem);
  const enrichment = (previewItem.enrichmentData ?? {}) as Record<string, unknown>;
  const script = (enrichment.editorScript ?? {}) as Record<string, unknown>;

  const initMention = (() => {
    const mf = String(enrichment.mentionFrequency ?? '');
    return mf === 'always' || mf === 'often';
  })();

  const [mentionBusiness, setMentionBusiness] = useState(initMention);
  const [prompt, setPrompt] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  // Preview media: prefer sourceMediaSlots background thumbnail, fall back to graphicUrls[0]
  const mediaSlots = (enrichment.sourceMediaSlots ?? {}) as Record<string, unknown>;
  const bgSlot = (mediaSlots.background ?? {}) as Record<string, unknown>;
  const previewImageUrl =
    String(bgSlot.thumbnailUrl ?? bgSlot.url ?? '') ||
    (Array.isArray(previewItem.graphicUrls) ? String(previewItem.graphicUrls[0] ?? '') : '');

  const overlayText = String(script.hookText ?? script.bodyText ?? previewItem.caption ?? '');
  const videoThumb = String(bgSlot.thumbnailUrl ?? bgSlot.url ?? previewImageUrl);

  const handleRegenerate = useCallback(async () => {
    if (isRegenerating || reRollsRemaining <= 0) return;
    setIsRegenerating(true);
    setRegenError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/re-roll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentItemId: previewItem.id,
          keepText: false,
          topicOverride: prompt || null,
        }),
      });
      const data = (await res.json()) as { contentItem?: ContentItem; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Regeneration failed');
      if (data.contentItem) {
        setPreviewItem(data.contentItem);
        setPrompt('');
      }
    } catch (err: unknown) {
      setRegenError(err instanceof Error ? err.message : 'Regeneration failed');
    } finally {
      setIsRegenerating(false);
    }
  }, [isRegenerating, reRollsRemaining, campaignId, previewItem.id, prompt]);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/content/${previewItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption: previewItem.caption }),
      });
      const data = (await res.json()) as { item?: ContentItem };
      onSaved(data.item ?? previewItem);
    } catch {
      onSaved(previewItem);
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, previewItem, onSaved]);

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background outline-none"
        >
          <Dialog.Title className="sr-only">Edit content</Dialog.Title>

          {/* Top bar */}
          <header className="flex shrink-0 items-center border-b border-border bg-card px-4 py-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <X className="size-4" />
            </button>
            <span className="flex-1 text-center text-sm font-semibold text-foreground">
              Edit content
            </span>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {isSaving && <Loader2 className="size-3.5 animate-spin" />}
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </header>

          {/* Body */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left sidebar */}
            <aside className="w-72 shrink-0 space-y-6 overflow-y-auto border-r border-border bg-card p-5">

              {/* ASSETS */}
              <div>
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Assets
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-2.5">
                    {videoThumb ? (
                      <img
                        src={videoThumb}
                        alt=""
                        className="size-10 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="size-10 shrink-0 rounded-lg bg-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground">Video</p>
                      <p className="truncate text-[11px] text-muted-foreground">Background video</p>
                    </div>
                    <button
                      type="button"
                      onClick={onSwapVideo}
                      className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                    >
                      Swap
                    </button>
                  </div>

                  <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-2.5">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Music className="size-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground">Audio</p>
                      <p className="text-[11px] text-muted-foreground">Audio track</p>
                    </div>
                    <button
                      type="button"
                      onClick={onSwapVideo}
                      className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                    >
                      Swap
                    </button>
                  </div>
                </div>
              </div>

              {/* MENTION YOUR BUSINESS? */}
              <div>
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Mention your business?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMentionBusiness(true)}
                    className={`flex-1 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                      mentionBusiness
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-foreground hover:bg-muted'
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setMentionBusiness(false)}
                    className={`flex-1 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                      !mentionBusiness
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background text-foreground hover:bg-muted'
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>

              {/* PROMPT */}
              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Prompt
                </p>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Optional instructions for regeneration..."
                  rows={4}
                  className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              {regenError && (
                <p className="text-xs text-destructive">{regenError}</p>
              )}

              <button
                type="button"
                onClick={handleRegenerate}
                disabled={isRegenerating || reRollsRemaining <= 0}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-3 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                {isRegenerating ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                {isRegenerating ? 'Regenerating...' : 'Regenerate Text'}
              </button>

              {reRollsRemaining <= 0 && (
                <p className="text-center text-[11px] text-muted-foreground">
                  No re-rolls remaining
                </p>
              )}
            </aside>

            {/* Right preview */}
            <main className="flex flex-1 items-center justify-center overflow-hidden bg-muted/20">
              <div
                className="relative overflow-hidden rounded-2xl shadow-xl"
                style={{ aspectRatio: '9/16', maxHeight: '80vh' }}
              >
                {previewImageUrl ? (
                  <img
                    src={previewImageUrl}
                    alt="Content preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-neutral-900">
                    <p className="text-xs text-neutral-400">No preview available</p>
                  </div>
                )}
                {overlayText && (
                  <div className="absolute inset-x-0 bottom-12 px-4 text-center">
                    <p className="line-clamp-6 text-sm font-semibold leading-snug text-white drop-shadow-lg">
                      {overlayText}
                    </p>
                  </div>
                )}
              </div>
            </main>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
