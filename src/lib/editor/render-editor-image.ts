/**
 * Client helper: publish an image-kind edit through /api/editor/render-image.
 *
 * Two branches, mirroring the two Image Engine endpoints:
 *   - slideshow / carousel / data_story → POST /render/carousel (branded
 *     multi-slide render). Returns an array of Cloudinary URLs.
 *   - single_image                       → POST /render/image (one branded
 *     card). Returns a single Cloudinary URL wrapped in a 1-element array.
 *
 * Fast-path: when the user's `mediaSlots.slides[]` all carry Cloudinary URLs
 * already (the common Remix path — slides come straight off the template),
 * we skip the engine and return the source URLs directly. The Image Engine
 * currently generates from HTML templates, not from user-uploaded slide
 * imagery, so calling it would replace the template's photography with
 * generic branded cards — WYSIWYG-breaking. When we later add a
 * "use source images as slide backgrounds" mode to the engine, remove this
 * fast-path.
 *
 * Progress semantics match `render-editor-video`: `onProgress(pct, stage)`
 * fires with `pct` climbing 0-95 while rendering, 100 on upload/complete.
 * The Image Engine returns synchronously today, so the progress callback
 * fires 25% before the call and 100% after — good enough for the UX.
 */

export type ImageRenderStage = 'rendering' | 'uploading';

export type RenderEditorImageInput = {
  script: {
    hookText?: string;
    bodyText?: string;
    ctaText?: string;
    slideCopy?: Array<string | { text: string; durationSeconds?: number }>;
  };
  style: Record<string, any>;
  layout: string;
  aspectRatio: string;
  mediaSlots: {
    background?: { url: string };
    slides?: Array<{ url: string; assetType?: string }>;
  };
  contentType: string;
};

export type ImageRenderProgressCallback = (percent: number, stage: ImageRenderStage) => void;

export type ImageRenderResult = {
  urls: string[];
  source: 'engine' | 'source_media';
};

export async function renderEditorImage(
  input: RenderEditorImageInput,
  onProgress?: ImageRenderProgressCallback,
): Promise<ImageRenderResult> {
  onProgress?.(10, 'rendering');

  const res = await fetch('/api/editor/render-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contentType: input.contentType,
      aspectRatio: input.aspectRatio,
      script: input.script,
      style: input.style,
      layout: input.layout,
      background: input.mediaSlots?.background || null,
      slides: input.mediaSlots?.slides || [],
    }),
  });

  onProgress?.(80, 'rendering');

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Image render failed (${res.status}): ${text || 'no response body'}`);
  }

  const data = await res.json();
  const urls: string[] = Array.isArray(data.urls) ? data.urls : [];
  if (urls.length === 0) {
    throw new Error('Image render returned no URLs');
  }

  onProgress?.(100, 'uploading');

  return {
    urls,
    source: data.source === 'source_media' ? 'source_media' : 'engine',
  };
}
