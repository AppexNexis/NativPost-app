import React, { ReactNode, useState } from 'react';
import { ArrowLeft, Check, Loader2, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { useEditor } from './EditorContext';
import { getVideoPosterUrl, isCloudinaryVideoUrl } from '@/lib/cloudinary';

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

// ── Canvas preview capture (with timeout — never blocks publish) ─
async function captureEditorPreview(
  editorState: { script?: { hookText?: string; bodyText?: string; ctaText?: string }; style?: Record<string, unknown>; layout?: string },
): Promise<string | null> {
  const TIMEOUT_MS = 3000;

  // Wrap the whole capture in a timeout so it never blocks publishing
  try {
    return await Promise.race([
      capturePreviewInner(editorState),
      new Promise<null>(resolve => setTimeout(() => resolve(null), TIMEOUT_MS)),
    ]);
  } catch {
    return null;
  }
}

async function capturePreviewInner(
  editorState: { script?: { hookText?: string; bodyText?: string; ctaText?: string }; style?: Record<string, unknown>; layout?: string },
): Promise<string | null> {
  const video = document.querySelector<HTMLVideoElement>('[data-editor-preview-video]');
  const canvas = document.createElement('canvas');
  const W = 720;
  const H = 1280;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Fill background
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // Draw video frame if available (crossOrigin="anonymous" enables this)
  if (video && video.readyState >= 2 && video.videoWidth > 0) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const scale = Math.max(W / vw, H / vh);
    ctx.drawImage(video, (W - vw * scale) / 2, (H - vh * scale) / 2, vw * scale, vh * scale);
  }

  // Draw text overlays
  const script = editorState.script || {};
  const style_ = editorState.style || {};
  const layout = editorState.layout || 'centered';

  const lines: string[] = [];
  if (script.hookText) lines.push(script.hookText);
  if (script.bodyText) lines.push(script.bodyText);
  if (script.ctaText) lines.push(script.ctaText);

  if (lines.length > 0) {
    const fontSize = Number(style_.fontSize) || 20;
    const color = String(style_.color || '#ffffff');
    const bg = String(style_.backgroundColor || 'rgba(0,0,0,0.5)');
    const align = (String(style_.align || 'center')) as CanvasTextAlign;
    const paddingX = 16;
    const paddingY = 12;
    const lineHeight = fontSize * 1.35;
    const textW = W - paddingX * 4;
    const totalH = lines.length * lineHeight + paddingY * 2;

    let textY: number;
    if (layout === 'centered' || layout === 'wall_of_text') {
      textY = (H - totalH) / 2;
    } else if (layout === 'top_caption') {
      textY = paddingY + 12;
    } else {
      textY = H - totalH - 24;
    }

    ctx.fillStyle = bg;
    roundRect(ctx, paddingX * 1.5, textY, textW, totalH, 6);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    const xPos = align === 'center' ? W / 2 : align === 'right' ? W - paddingX * 2 : paddingX * 2;
    lines.forEach((line, i) => ctx.fillText(line, xPos, textY + paddingY + i * lineHeight));
  }

  // Export to blob
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  if (!blob) return null;

  // Convert to base64
  const dataUrl = await new Promise<string | null>(resolve => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
  if (!dataUrl) return null;

  // Upload to Cloudinary
  const res = await fetch('/api/content/upload-snapshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageData: dataUrl }),
  });
  if (!res.ok) throw new Error('Upload failed');
  const data = await res.json();
  return data.url;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
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

    // If we already have a content item, go directly to it
    if (state.edit?.contentItemId) {
      router.push(`/dashboard/content/${state.edit.contentItemId}`);
      return;
    }

    // 1. Build primary media URLs (non-blocking snapshot + all source URLs)
    const allMediaUrls: string[] = [];

    // Try canvas capture with 3s timeout — never blocks publishing
    const snapshotUrl = await captureEditorPreview({
      script: state.script,
      style: state.style,
      layout: state.layout,
    });
    if (snapshotUrl) {
      allMediaUrls.push(snapshotUrl);
    } else {
      // Fallback: Cloudinary poster frame from background video
      const bgUrl = state.mediaSlots?.background?.url;
      if (bgUrl && isCloudinaryVideoUrl(bgUrl)) {
        allMediaUrls.push(getVideoPosterUrl(bgUrl, { width: 608, height: 1080 }));
      }
    }

    // Raw source URLs
    if (state.mediaSlots?.background?.url) allMediaUrls.push(state.mediaSlots.background.url);
    if (state.mediaSlots?.hookVideo?.url) allMediaUrls.push(state.mediaSlots.hookVideo.url);
    if (state.mediaSlots?.demoVideo?.url) allMediaUrls.push(state.mediaSlots.demoVideo.url);
    if (state.mediaSlots?.slides?.length) {
      state.mediaSlots.slides.forEach(s => { if (s.url) allMediaUrls.push(s.url); });
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

      // 4. Redirect to detail page
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
