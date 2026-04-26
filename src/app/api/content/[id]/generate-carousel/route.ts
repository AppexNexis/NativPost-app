import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { brandProfileSchema, contentItemSchema } from '@/models/Schema';

const IMAGE_ENGINE_URL = process.env.NATIVPOST_IMAGE_URL || 'http://localhost:4000';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/content/[id]/generate-carousel
 *
 * Generates all carousel slides from the content item's caption.
 * The caption is parsed into slides: each paragraph becomes a slide,
 * with the first as cover and last as CTA.
 *
 * Body (optional):
 *   style       — "dark" | "light" | "brand" (default: "dark")
 *   aspectRatio — "1:1" | "9:16" (default: "1:1")
 *   slides      — override auto-parsed slides with custom slide objects
 *   ctaText     — CTA slide headline (default: brand name)
 *   ctaSub      — CTA slide sub-text (default: from caption context)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const { id } = await params;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // No body is fine
  }

  try {
    // Load content item
    const [item] = await db
      .select()
      .from(contentItemSchema)
      .where(eq(contentItemSchema.id, id))
      .limit(1);

    if (!item || item.orgId !== orgId) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
    }

    if (item.contentType !== 'carousel') {
      return NextResponse.json(
        { error: 'Carousel generation only available for carousel content type' },
        { status: 400 },
      );
    }

    // Load brand profile
    const [profile] = await db
      .select({
        brandName: brandProfileSchema.brandName,
        primaryColor: brandProfileSchema.primaryColor,
        secondaryColor: brandProfileSchema.secondaryColor,
        logoUrl: brandProfileSchema.logoUrl,
      })
      .from(brandProfileSchema)
      .where(eq(brandProfileSchema.orgId, orgId!))
      .limit(1);

    const brandName = profile?.brandName || 'Brand';
    const style = (body.style as string) || 'dark';
    const aspectRatio = (body.aspectRatio as string) || '1:1';

    // Use custom slides if provided, otherwise parse from caption
    let slides: Array<Record<string, unknown>>;

    if (body.slides && Array.isArray(body.slides) && body.slides.length >= 2) {
      slides = body.slides as Array<Record<string, unknown>>;
    } else {
      // Parse caption into slides:
      // - Split on double newlines (paragraphs) or numbered lines
      // - First paragraph → cover slide
      // - Middle paragraphs → content slides
      // - Auto-add CTA slide at end
      const caption = item.caption || '';
      const paragraphs = caption
        .split(/\n{2,}/)
        .map(p => p.replace(/^\d+[.)]\s*/, '').trim()) // strip "1. " "2) " prefixes
        .filter(p => p.length > 0);

      if (paragraphs.length < 1) {
        return NextResponse.json(
          { error: 'Caption is too short to generate carousel slides. Add more content.' },
          { status: 400 },
        );
      }

      // Build slides
      const contentSlides = paragraphs.map((para, i) => {
        if (i === 0) {
          // Cover: first line is headline, rest is optional subtext
          const lines = para.split('\n').map(l => l.trim()).filter(Boolean);
          const headline = lines[0] || para;
          return {
            slideType: 'cover',
            headline: headline.slice(0, 80),
            // eyebrow from hashtags or topic
            ...(item.topic ? { eyebrow: item.topic.toUpperCase().slice(0, 20) } : {}),
          };
        }
        // Content slides: headline = first sentence, body = rest
        const sentences = para.match(/[^.!?]+[.!?]+/g) || [para];
        const headline = sentences[0]?.trim().slice(0, 80) || para.slice(0, 80);
        const body = sentences.slice(1).join(' ').trim().slice(0, 200);
        return {
          slideType: 'content',
          headline,
          ...(body ? { body } : {}),
        };
      });

      // CTA slide
      const ctaSlide = {
        slideType: 'cta',
        headline: '',
        cta: (body.ctaText as string) || `Follow ${brandName}`,
        ctaSub: (body.ctaSub as string) || 'For more content like this',
      };

      slides = [...contentSlides, ctaSlide];

      // Ensure minimum 2 slides
      if (slides.length < 2) {
        slides = [
          { slideType: 'cover', headline: caption.slice(0, 80) },
          ctaSlide,
        ];
      }
    }

    // Cap at 10 slides
    if (slides.length > 10) {
      slides = slides.slice(0, 10);
    }

    const payload = {
      slides,
      style,
      aspectRatio,
      brandName,
      brandPrimary: profile?.primaryColor || '#864FFE',
      brandSecondary: profile?.secondaryColor || '#0D0D0D',
      ...(profile?.logoUrl ? { logoUrl: profile.logoUrl } : {}),
    };

    console.log('[Carousel] Generating', slides.length, 'slides, style:', style, 'ar:', aspectRatio);

    // 120s timeout — carousels can have up to 10 slides
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000);

    let renderRes: Response;
    try {
      renderRes = await fetch(`${IMAGE_ENGINE_URL}/render/carousel`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ENGINE_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (fetchErr: unknown) {
      clearTimeout(timeoutId);
      const isAbort = fetchErr instanceof Error && fetchErr.name === 'AbortError';
      if (isAbort) {
        return NextResponse.json({ error: 'Image engine timed out. Please try again.' }, { status: 503 });
      }
      return NextResponse.json({ error: `Cannot reach image engine: ${String(fetchErr)}` }, { status: 502 });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!renderRes.ok) {
      const errText = await renderRes.text();
      console.error('[Carousel] Engine error:', renderRes.status, errText);
      return NextResponse.json({ error: 'Carousel generation failed.', detail: errText }, { status: 502 });
    }

    const renderData = await renderRes.json() as {
      slides: string[];
      slideCount: number;
      aspectRatio: string;
      renderMs: number;
    };

    console.log('[Carousel] Generated', renderData.slideCount, 'slides in', renderData.renderMs, 'ms');

    if (!renderData.slides?.length) {
      return NextResponse.json({ error: 'Carousel engine returned no slides' }, { status: 502 });
    }

    // Save all slide URLs to DB
    await db
      .update(contentItemSchema)
      .set({
        graphicUrls: renderData.slides,
        platformSpecific: {
          ...(item.platformSpecific as object),
          carouselAspectRatio: aspectRatio,
          carouselStyle: style,
          carouselSlideCount: renderData.slideCount,
        },
        updatedAt: new Date(),
      })
      .where(eq(contentItemSchema.id, id));

    return NextResponse.json({
      success: true,
      slides: renderData.slides,
      slideCount: renderData.slideCount,
      aspectRatio: renderData.aspectRatio,
      renderMs: renderData.renderMs,
    });
  } catch (err) {
    console.error('[Carousel] generate-carousel failed:', err);
    return NextResponse.json({ error: `Carousel generation failed: ${String(err)}` }, { status: 500 });
  }
}
