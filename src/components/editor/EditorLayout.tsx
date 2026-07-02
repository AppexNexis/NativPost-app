import React, { ReactNode, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, Loader2, Save, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { useEditor } from './EditorContext';
import { renderEditorVideo } from '@/lib/editor/render-editor-video';

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

// Render helper (with polling) lives in @/lib/editor/render-editor-video.
// Shared with the detail-page recompile flow so both paths handle the
// engine's async /render/editor-video job model identically.

type PublishStage = 'idle' | 'rendering' | 'uploading' | 'saving' | 'redirecting';

type PublishError = {
  message: string;
  canProceedRaw: boolean;
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
  const [publishStage, setPublishStage] = useState<PublishStage>('idle');
  const [publishError, setPublishError] = useState<PublishError | null>(null);
  const [renderPercent, setRenderPercent] = useState<number>(0);

  const isPublishing = publishStage !== 'idle';

  const runPublish = async (opts: { proceedWithRaw: boolean }) => {
    setPublishError(null);
    setRenderPercent(0);
    await saveEdit();

    setPublishStage('rendering');

    // Enrichment data with editor state — always stored so overlays work
    // for any items lacking a compiled URL. `editorScript` gates the
    // detail page's RemotionPreviewPlayer fallback, so it must include
    // real text (see EditorContext.initialScript for caption fallback).
    const enrichmentData: Record<string, any> = {
      editorScript: state.script,
      editorStyle: state.style,
      editorLayout: state.layout,
      aspectRatio: state.aspectRatio,
      // Preserve the raw source media so re-editing / recompiling doesn't
      // stack overlays on top of an already-baked video. graphicUrls[0] gets
      // overwritten with the compiled MP4 after render, so without this stash
      // we lose the original background forever.
      sourceMediaSlots: state.mediaSlots,
    };

    let compiledVideoUrl: string | null = null;
    try {
      compiledVideoUrl = await renderEditorVideo(
        {
          script: state.script,
          style: state.style,
          layout: state.layout,
          aspectRatio: state.aspectRatio,
          mediaSlots: state.mediaSlots,
          contentType: state.edit?.contentType || 'text',
        },
        (percent, stage) => {
          setRenderPercent(percent);
          setPublishStage(stage === 'uploading' ? 'uploading' : 'rendering');
        },
      );
      enrichmentData.isCompiled = true;
    } catch (err) {
      console.error('[Publish] Engine render failed:', err);
      if (!opts.proceedWithRaw) {
        setPublishStage('idle');
        setPublishError({
          message: err instanceof Error ? err.message : String(err),
          canProceedRaw: true,
        });
        return;
      }
      // User explicitly chose to proceed without a compiled video. Overlays
      // will still render via RemotionPreviewPlayer on the detail page.
      enrichmentData.isCompiled = false;
      enrichmentData.compileError = err instanceof Error ? err.message : String(err);
    }

    setPublishStage('saving');

    // ── Branch A: existing content item — single PATCH, await it.
    if (state.edit?.contentItemId) {
      const updateBody: Record<string, any> = { enrichmentData };
      if (compiledVideoUrl) updateBody.graphicUrls = [compiledVideoUrl];
      if (state.aspectRatio) updateBody.aspectRatio = state.aspectRatio;

      const patchRes = await fetch(`/api/content/${state.edit.contentItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateBody),
      });
      if (!patchRes.ok) {
        console.error('[Publish] PATCH failed:', patchRes.status);
      }
      setPublishStage('redirecting');
      router.push(`/dashboard/content/${state.edit.contentItemId}`);
      return;
    }

    // ── Branch B: new content item. Build the FULL body (incl. enrichment +
    //    graphicUrls) and POST once. No follow-up PATCH means no race
    //    condition between create and isCompiled being set on the row.
    const allMediaUrls: string[] = [];
    if (compiledVideoUrl) {
      allMediaUrls.push(compiledVideoUrl);
    } else {
      if (state.mediaSlots?.background?.url) allMediaUrls.push(state.mediaSlots.background.url);
      if (state.mediaSlots?.hookVideo?.url) allMediaUrls.push(state.mediaSlots.hookVideo.url);
      if (state.mediaSlots?.demoVideo?.url) allMediaUrls.push(state.mediaSlots.demoVideo.url);
      if (state.mediaSlots?.slides?.length) {
        state.mediaSlots.slides.forEach(s => { if (s.url) allMediaUrls.push(s.url); });
      }
    }

    const caption = [
      state.script?.hookText,
      state.script?.bodyText,
      state.script?.ctaText,
    ].filter(Boolean).join('\n\n');

    try {
      const res = await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentType: state.edit?.contentType || 'text_only',
          caption,
          targetPlatforms: state.targetPlatforms || state.edit?.targetPlatforms || [],
          status: 'draft',
          graphicUrls: allMediaUrls,
          aspectRatio: state.aspectRatio || state.edit?.aspectRatio || '9:16',
          contentMode: state.edit?.contentMode || null,
          enrichmentData,
        }),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`API ${res.status}: ${errBody}`);
      }

      const data = await res.json();
      const contentId = data.item?.id;

      // Link edit session to the new content item (best-effort, awaited).
      if (contentId && state.edit?.id) {
        const linkRes = await fetch(`/api/content/edit/${state.edit.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contentItemId: contentId }),
        });
        if (!linkRes.ok) {
          console.error('[Publish] Link edit→content failed:', linkRes.status);
        }
      }

      setPublishStage('redirecting');
      if (contentId) {
        router.push(`/dashboard/content/${contentId}`);
      } else {
        router.push('/dashboard/posts');
      }
    } catch (err) {
      console.error('[Publish] Failed:', err);
      setPublishStage('idle');
      router.push('/dashboard/posts');
    }
  };

  const handleContinue = () => runPublish({ proceedWithRaw: false });

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

  // Unified progress: render fills 0–95%, upload jumps to 100%, save/redirect
  // holds at 100%. One label — "Saving X%" — replaces the noisy multi-stage
  // strip. Under the hood the stages are still tracked for logic; the UI just
  // presents them as a single progressing action.
  const unifiedPercent =
    publishStage === 'rendering'   ? Math.min(95, renderPercent) :
    publishStage === 'uploading'   ? 100 :
    publishStage === 'saving'      ? 100 :
    publishStage === 'redirecting' ? 100 :
    0;
  const publishLabel =
    publishStage === 'idle' ? 'Schedule & Publish' : `Saving ${unifiedPercent}%`;

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
            {publishLabel}
          </button>
        </div>
      </header>

      {/* ── Compile-failure banner ───────────────────────────── */}
      {publishError && (
        <div className="shrink-0 flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 dark:border-amber-900/40 dark:bg-amber-950/30">
          <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="min-w-0 flex-1 truncate text-xs text-amber-800 dark:text-amber-300">
            <span className="font-medium">Compile failed —</span>{' '}
            {publishError.message}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => runPublish({ proceedWithRaw: false })}
              disabled={isPublishing}
              className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {isPublishing && <Loader2 className="size-3 animate-spin" />}
              Retry
            </button>
            {publishError.canProceedRaw && (
              <button
                type="button"
                onClick={() => runPublish({ proceedWithRaw: true })}
                disabled={isPublishing}
                className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-60 dark:border-amber-700 dark:bg-transparent dark:text-amber-300"
                title="Overlays will render live on the detail page but no standalone MP4 will be produced."
              >
                Publish anyway
              </button>
            )}
            <button
              type="button"
              onClick={() => setPublishError(null)}
              className="rounded-md p-1 text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/40"
              title="Dismiss"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      )}

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
