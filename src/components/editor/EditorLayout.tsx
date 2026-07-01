import React, { ReactNode, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, Loader2, Save, X } from 'lucide-react';
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

// ── Engine render — proxied via /api/editor/render so the engine API key
//    (server-only env) is attached server-side. Previously this called the
//    engine directly from the browser, which silently 401'd because
//    NATIVPOST_ENGINE_API_KEY is never available in the client bundle.
//
// Throws on failure — callers decide whether to block the publish or
// fall through. Silent nulls led to broken detail pages before.
async function renderEditorVideo(
  editorState: { script: any; style: any; layout: string; aspectRatio: string; mediaSlots: any; contentType: string },
): Promise<string> {
  const res = await fetch('/api/editor/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      script: editorState.script,
      style: editorState.style,
      layout: editorState.layout,
      aspectRatio: editorState.aspectRatio,
      contentType: editorState.contentType,
      backgroundUrl: editorState.mediaSlots?.background?.url,
      hookVideoUrl: editorState.mediaSlots?.hookVideo?.url,
      slides: editorState.mediaSlots?.slides,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Engine render failed (${res.status}): ${text || 'no response body'}`);
  }
  const data = await res.json();
  if (!data.url) throw new Error('Engine returned no url');
  return data.url as string;
}

type PublishStage = 'idle' | 'rendering' | 'saving' | 'redirecting';

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

  const isPublishing = publishStage !== 'idle';

  const runPublish = async (opts: { proceedWithRaw: boolean }) => {
    setPublishError(null);
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
    };

    let compiledVideoUrl: string | null = null;
    try {
      compiledVideoUrl = await renderEditorVideo({
        script: state.script,
        style: state.style,
        layout: state.layout,
        aspectRatio: state.aspectRatio,
        mediaSlots: state.mediaSlots,
        contentType: state.edit?.contentType || 'text',
      });
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

  const publishLabel =
    publishStage === 'rendering'   ? 'Rendering video…' :
    publishStage === 'saving'      ? 'Saving…' :
    publishStage === 'redirecting' ? 'Opening post…' :
    'Schedule & Publish';

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

      {/* ── Compile-failure modal ────────────────────────────── */}
      {publishError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border bg-card p-5 shadow-2xl">
            <div className="mb-3 flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-amber-100 p-1.5 text-amber-700">
                <AlertTriangle className="size-4" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-foreground">Video compile failed</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  The engine couldn't render a standalone video with your text overlays baked in. The most common cause is that the video-renderer service is not running (expected at <code className="rounded bg-muted px-1">NATIVPOST_VIDEO_URL</code>) or its API key is missing.
                </p>
                <pre className="mt-2 max-h-24 overflow-auto rounded bg-muted/60 p-2 text-[10px] leading-tight text-muted-foreground">{publishError.message}</pre>
              </div>
              <button
                type="button"
                onClick={() => setPublishError(null)}
                className="text-muted-foreground hover:text-foreground"
                title="Close"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => runPublish({ proceedWithRaw: false })}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Loader2 className={`size-3.5 ${isPublishing ? 'animate-spin' : 'hidden'}`} />
                Retry compile
              </button>
              {publishError.canProceedRaw && (
                <button
                  type="button"
                  onClick={() => runPublish({ proceedWithRaw: true })}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
                  title="Publish without a compiled video. Overlays will render live on the detail page but downloads will show raw source."
                >
                  Publish without compile
                </button>
              )}
              <button
                type="button"
                onClick={() => setPublishError(null)}
                className="rounded-lg border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
