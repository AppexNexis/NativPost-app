import React, { ReactNode, useState } from 'react';
import { ArrowLeft, Check, Loader2, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { useEditor } from './EditorContext';

// ── Content type labels ──────────────────────────────────────────
const CT_LABELS: Record<string, string> = {
  text_only: 'Text',
  single_image: 'Image',
  slideshow: 'Slideshow',
  reel: 'Video',
  ugc: 'UGC',
  data_story: 'Data Story',
  wall_of_text: 'Wall of Text',
  talking_head: 'Talking Head',
  green_screen: 'Green Screen',
};

export function EditorLayout({
  preview,
  sidebar,
}: {
  preview: ReactNode;
  sidebar: ReactNode;
}) {
  const { state, saveEdit } = useEditor();
  const router = useRouter();
  const [isPublishing, setIsPublishing] = useState(false);

  const handleContinue = async () => {
    await saveEdit();
    setIsPublishing(true);

    // If we already have a content item, go to it
    if (state.edit?.contentItemId) {
      router.push(`/dashboard/content/${state.edit.contentItemId}`);
      return;
    }

    // No content item — create one from the edit session data
    try {
      const res = await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentType: state.edit?.contentType || 'text_only',
          caption: [
            state.script?.hookText,
            state.script?.bodyText,
            state.script?.ctaText,
          ].filter(Boolean).join('\n\n'),
          targetPlatforms: state.targetPlatforms || state.edit?.targetPlatforms || [],
          status: 'draft',
          graphicUrls: state.mediaSlots?.background?.url ? [state.mediaSlots.background.url] : [],
        }),
      });

      if (!res.ok) throw new Error('Failed to create post');

      const data = await res.json();
      const contentId = data.item?.id;
      if (contentId) {
        router.push(`/dashboard/content/${contentId}`);
      } else {
        router.push('/dashboard/posts');
      }
    } catch (err) {
      console.error('Failed to publish:', err);
      // Fallback
      router.push('/dashboard/posts');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/dashboard/content-library');
    }
  };

  const isRemix = state.edit?.source === 'remix';
  const contentType = state.edit?.contentType || '';
  const displayType = CT_LABELS[contentType] || contentType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* ── Top bar ───────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-card px-4 py-2.5">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Back"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-foreground leading-none">
              {isRemix ? 'Remix Editor' : 'Editor'}
            </h1>
            {displayType && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {displayType}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* ── Save status ────────────────────────────────── */}
          <div className="hidden items-center gap-1.5 sm:flex">
            {state.isSaving ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Saving&hellip;
              </span>
            ) : state.isDirty ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Save className="size-3" />
                Unsaved
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-emerald-600">
                <Check className="size-3" />
                Saved
              </span>
            )}
          </div>

          {/* ── Save button ───────────────────────────────── */}
          <button
            onClick={saveEdit}
            disabled={!state.isDirty}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Save className="size-3.5" />
            Save
          </button>

          {/* ── Schedule & Publish ────────────────────────── */}
          <button
            onClick={handleContinue}
            disabled={isPublishing}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {isPublishing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            {isPublishing ? 'Publishing...' : 'Schedule &amp; Publish'}
          </button>
        </div>
      </header>

      {/* ── Main content: sidebar + preview ──────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-96 shrink-0 overflow-hidden border-r border-border bg-card">
          {sidebar}
        </aside>

        {/* Preview area */}
        <main className="flex flex-1 items-center justify-center overflow-hidden">
          {preview}
        </main>
      </div>
    </div>
  );
}
