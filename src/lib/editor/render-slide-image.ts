/**
 * Server-side helper: render a slide image with text overlay via the image
 * engine's Puppeteer endpoint, then upload to Cloudinary.
 *
 * For slideshow and single_image content types. Each slide (background image
 * + caption text + style) is composited into a single image that mirrors
 * the GalleryPreview styling exactly — published carousel images are WYSIWYG
 * with the editor preview.
 *
 * Graceful fallback: if the engine is unreachable, returns the raw
 * backgroundUrl so publishing still works (text-free but functional).
 */

import { IMAGE_ENGINE_URL, engineAuthHeaders } from '@/lib/ai-studio/engine';

export type SlideRenderInput = {
  /** Public URL of the slide background image. */
  backgroundUrl: string;
  /** Caption text to overlay. */
  text?: string | null;
  /** Aspect ratio e.g. "9:16", "1:1". */
  aspectRatio?: string | null;
  /** Layout variant matching editorLayout from enrichmentData. */
  layout?: string | null;
  /** Horizontal text alignment from editorStyle.align. */
  align?: string | null;
  /** 0..1 dim overlay from editorStyle.backgroundDimming. */
  backgroundDimming?: number | null;
  /** Caption box background color (CSS color, e.g. 'transparent', 'rgba(0,0,0,0.4)'). */
  backgroundColor?: string | null;
  /** Font size in px. */
  fontSize?: number | null;
};

export type SlideRenderResult = {
  url: string;
  source: 'engine' | 'fallback';
  error?: string;
};

/**
 * Render one slide via the image engine's Puppeteer endpoint.
 *
 * @returns The rendered (text-burned) Cloudinary URL, or the raw backgroundUrl
 *          if the engine is unreachable (failure logged, publishing continues).
 */
export async function renderSlideImage(input: SlideRenderInput): Promise<SlideRenderResult> {
  if (!input.backgroundUrl) {
    return { url: '', source: 'fallback', error: 'No background URL' };
  }

  try {
    const res = await fetch(`${IMAGE_ENGINE_URL}/render/slide`, {
      method: 'POST',
      headers: engineAuthHeaders(),
      signal: AbortSignal.timeout(60_000), // 60s per slide
      body: JSON.stringify({
        backgroundUrl: input.backgroundUrl,
        text: input.text || '',
        aspectRatio: input.aspectRatio || '1:1',
        layout: input.layout || 'bottom_caption',
        align: input.align || 'center',
        backgroundDimming: input.backgroundDimming ?? 0,
        backgroundColor: input.backgroundColor || undefined,
        fontSize: input.fontSize || undefined,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[SlideRender] Engine returned ${res.status}: ${text}`);
      return { url: input.backgroundUrl, source: 'fallback', error: `Engine error ${res.status}` };
    }

    const data = await res.json() as { url?: string; error?: string };
    if (!data.url) {
      return { url: input.backgroundUrl, source: 'fallback', error: 'Engine returned no URL' };
    }

    return { url: data.url, source: 'engine' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[SlideRender] Failed: ${message} — falling back to raw URL`);
    return { url: input.backgroundUrl, source: 'fallback', error: message };
  }
}

/**
 * Render all slides for a slideshow or carousel content item.
 *
 * Calls the image engine for each slide in parallel (up to 10 slides).
 *
 * @returns Array of rendered (or fallback) URLs, same order as inputSlides.
 */
export async function renderAllSlides(
  slides: Array<{ url: string }>,
  slideCopy: (string | null | undefined)[],
  styleOpts?: {
    aspectRatio?: string | null;
    layout?: string | null;
    align?: string | null;
    backgroundDimming?: number | null;
    backgroundColor?: string | null;
    fontSize?: number | null;
  },
): Promise<string[]> {
  if (slides.length === 0) return [];

  const results = await Promise.allSettled(
    slides.map((slide, i) =>
      renderSlideImage({
        backgroundUrl: slide.url,
        text: slideCopy[i] ?? null,
        aspectRatio: styleOpts?.aspectRatio,
        layout: styleOpts?.layout,
        align: styleOpts?.align,
        backgroundDimming: styleOpts?.backgroundDimming,
        backgroundColor: styleOpts?.backgroundColor,
        fontSize: styleOpts?.fontSize,
      }),
    ),
  );

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value.url;
    console.warn(`[SlideRender] Slide ${i} failed:`, r.reason);
    return slides[i]?.url || '';
  });
}
