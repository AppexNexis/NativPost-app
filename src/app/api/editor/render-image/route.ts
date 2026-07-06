/**
 * POST /api/editor/render-image
 *
 * Server-side proxy to the Image Engine (image-engine/src/routes/{image,carousel}.ts).
 * Mirrors /api/editor/render (which fronts the video engine) — see that
 * route's header comment for the rationale (server-only NATIVPOST_ENGINE_API_KEY
 * means a client-direct call 401s).
 *
 * Branching:
 *   - contentType === 'slideshow' | 'carousel' | 'data_story'
 *       → POST {IMAGE_ENGINE_URL}/render/carousel with a hook/body/cta →
 *         cover/content/cta slide payload.
 *   - contentType === 'single_image'
 *       → POST {IMAGE_ENGINE_URL}/render/image (quote-card style).
 *
 * Fast-path: when the caller's `slides[]` all carry URLs, we return them
 * verbatim without calling the engine. This preserves the WYSIWYG guarantee
 * for slideshow Remix (source imagery is not replaced with generic branded
 * cards). See the client helper's header for the follow-up.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { IMAGE_ENGINE_URL, engineAuthHeaders } from '@/lib/ai-studio/engine';

const VALID_ASPECT_RATIOS = new Set(['9:16', '1:1', '16:9']);
const CAROUSEL_TYPES = new Set(['slideshow', 'carousel', 'data_story']);

type SlideCopyItem = string | { text?: string; durationSeconds?: number };

export async function POST(request: NextRequest) {
  const { error } = await getAuthContext();
  if (error) return error;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    contentType,
    aspectRatio,
    script,
    style,
    background,
    slides,
  } = body as {
    contentType?: string;
    aspectRatio?: string;
    script?: {
      hookText?: string;
      bodyText?: string;
      ctaText?: string;
      slideCopy?: SlideCopyItem[];
    };
    style?: Record<string, unknown>;
    background?: { url?: string } | null;
    slides?: Array<{ url?: string; assetType?: string }>;
  };

  if (!contentType || typeof contentType !== 'string') {
    return NextResponse.json({ error: 'contentType required' }, { status: 400 });
  }
  if (aspectRatio && !VALID_ASPECT_RATIOS.has(aspectRatio)) {
    return NextResponse.json(
      { error: `Invalid aspectRatio "${aspectRatio}". Must be one of: ${[...VALID_ASPECT_RATIOS].join(', ')}` },
      { status: 400 },
    );
  }
  if (!script || typeof script !== 'object') {
    return NextResponse.json({ error: 'script object required' }, { status: 400 });
  }

  const isCarousel = CAROUSEL_TYPES.has(contentType);
  const cleanSlides = (slides || []).filter(s => typeof s?.url === 'string' && s.url.length > 0);

  // ── Fast-path: source-media pass-through ────────────────────────
  if (isCarousel && cleanSlides.length > 0) {
    return NextResponse.json({
      urls: cleanSlides.map(s => s.url as string),
      source: 'source_media',
    });
  }
  if (contentType === 'single_image' && background?.url) {
    return NextResponse.json({
      urls: [background.url],
      source: 'source_media',
    });
  }

  // ── Engine path — build the payload the Image Engine expects ────
  // Carousel engine wants { slides: [{ slideType, headline, body, cta, ctaSub, eyebrow }] }
  // (see image-engine/src/routes/carousel.ts:29-92). We turn the flat
  // hook/body/cta script into a 3-slide cover/content/cta layout when no
  // per-slide copy is supplied.
  const engineStyle = typeof style?.imageStyle === 'string'
    ? String(style.imageStyle)
    : 'dark';
  const ar = aspectRatio === '9:16' ? '9:16' : '1:1';

  try {
    if (isCarousel) {
      const slideCopy = Array.isArray(script.slideCopy) ? script.slideCopy : [];
      const derivedSlides = slideCopy.length >= 2
        ? slideCopy.map((c, i) => ({
            headline: typeof c === 'string' ? c : (c?.text || `Slide ${i + 1}`),
          }))
        : [
            { headline: script.hookText || 'Cover', slideType: 'cover' },
            { headline: script.bodyText || 'Content', slideType: 'content' },
            { headline: script.ctaText || 'Call to action', slideType: 'cta' },
          ];

      const res = await fetch(`${IMAGE_ENGINE_URL}/render/carousel`, {
        method: 'POST',
        headers: engineAuthHeaders(),
        body: JSON.stringify({
          slides: derivedSlides,
          style: engineStyle,
          aspectRatio: ar,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error('[Image Render Proxy] Carousel engine returned', res.status, text);
        return NextResponse.json(
          { error: `Carousel render failed (${res.status})`, detail: text },
          { status: 502 },
        );
      }
      const data = await res.json();
      const rawSlides = Array.isArray(data.slides) ? data.slides : [];
      // Cloudinary uploader returns { url, publicId, ... } per slide
      const urls = rawSlides
        .map((s: any) => (typeof s === 'string' ? s : s?.url))
        .filter((u: unknown): u is string => typeof u === 'string' && u.length > 0);
      if (urls.length === 0) {
        return NextResponse.json({ error: 'Engine returned no slide URLs' }, { status: 502 });
      }
      return NextResponse.json({ urls, source: 'engine' });
    }

    // ── Single image branch ─────────────────────────────────────
    const res = await fetch(`${IMAGE_ENGINE_URL}/render/image`, {
      method: 'POST',
      headers: engineAuthHeaders(),
      body: JSON.stringify({
        template: 'quote-card',
        style: engineStyle,
        formats: [ar === '9:16' ? 'vertical' : 'square'],
        quote: script.hookText || script.bodyText || '',
        attribution: script.ctaText || '',
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[Image Render Proxy] Image engine returned', res.status, text);
      return NextResponse.json(
        { error: `Image render failed (${res.status})`, detail: text },
        { status: 502 },
      );
    }
    const data = await res.json();
    // Image route returns { formats: [{ url, ... }], ... } or a flat url —
    // handle both shapes defensively.
    const urls: string[] = Array.isArray(data.formats)
      ? data.formats.map((f: any) => f?.url).filter((u: unknown): u is string => typeof u === 'string' && u.length > 0)
      : (typeof data.url === 'string' ? [data.url] : []);
    if (urls.length === 0) {
      return NextResponse.json({ error: 'Engine returned no image URL' }, { status: 502 });
    }
    return NextResponse.json({ urls, source: 'engine' });
  } catch (err) {
    console.error('[Image Render Proxy] Failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
