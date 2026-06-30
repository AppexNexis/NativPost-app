import React, { ReactNode, useState } from 'react';
import { ArrowLeft, Check, Loader2, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { useEditor } from './EditorContext';
import { VIDEO_ENGINE_URL, engineAuthHeaders } from '@/lib/ai-studio/engine';

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

// ── Engine render — compiles editor state into a permanent MP4 ───
async function renderEditorVideo(
  editorState: { script: any; style: any; layout: string; aspectRatio: string; mediaSlots: any; contentType: string },
): Promise<string | null> {
  try {
    const res = await fetch(`${VIDEO_ENGINE_URL}/render/editor-video`, {
      method: 'POST',
      headers: engineAuthHeaders(),
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
    if (!res.ok) throw new Error(`Engine render failed: ${res.status}`);
    const data = await res.json();
    return data.url || null;
  } catch (err) {
    console.error('[Publish] Engine render failed:', err);
    return null;
  }
}

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

    // Enrichment data with editor state — always stored so CSS overlays work
    const enrichmentData: Record<string, any> = {
      editorScript: state.script,
      editorStyle: state.style,
      editorLayout: state.layout,
      aspectRatio: state.aspectRatio,
    };

    // If we already have a content item, render and update
    if (state.edit?.contentItemId) {
      const compiledVideoUrl = await renderEditorVideo({
        script: state.script,
        style: state.style,
        layout: state.layout,
        aspectRatio: state.aspectRatio,
        mediaSlots: state.mediaSlots,
        contentType: state.edit?.contentType || 'text',
      });

      const updateBody: Record<string, any> = {
        enrichmentData,
      };

      if (compiledVideoUrl) {
        enrichmentData.isCompiled = true;
        updateBody.graphicUrls = [compiledVideoUrl];
      }

      const patchRes = await fetch(`/api/content/${state.edit.contentItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateBody),
      });
      if (!patchRes.ok) {
        console.error('[Publish] PATCH failed:', patchRes.status);
      }
      router.push(`/dashboard/content/${state.edit.contentItemId}`);
      return;
    }

    // 1. Compile editor state into a permanent MP4 via Remotion engine
    const compiledVideoUrl = await renderEditorVideo({
      script: state.script,
      style: state.style,
      layout: state.layout,
      aspectRatio: state.aspectRatio,
      mediaSlots: state.mediaSlots,
      contentType: state.edit?.contentType || 'text',
    });

    if (compiledVideoUrl) {
      enrichmentData.isCompiled = true;
    }

    // Use compiled video as primary; fall back to raw source
    const allMediaUrls: string[] = [];
    if (compiledVideoUrl) {
      allMediaUrls.push(compiledVideoUrl);
    } else {
      // Fallback: raw source URLs — CSS overlays will use enrichmentData on detail page
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

    // 2. Create content item
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
        }),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`API ${res.status}: ${errBody}`);
      }

      const data = await res.json();
      const contentId = data.item?.id;

      // 3. Link edit session to content item
      if (contentId && state.edit?.id) {
        await fetch(`/api/content/edit/${state.edit.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contentItemId: contentId }),
        }).catch(() => {});
      }

      // 4. Save editor state & compiled flag on the content item
      if (contentId) {
        await fetch(`/api/content/${contentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enrichmentData }),
        }).catch(() => {});
      }

      // 5. Redirect to detail page
      if (contentId) {
        router.push(`/dashboard/content/${contentId}`);
      } else {
        router.push('/dashboard/posts');
      }
    } catch (err) {
      console.error('[Publish] Failed:', err);
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
            {isPublishing ? 'Publishing...' : 'Schedule & Publish'}
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
