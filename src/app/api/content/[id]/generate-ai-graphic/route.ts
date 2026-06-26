
/**
 * POST /api/content/[id]/generate-ai-graphic
 *
 * Generates a premium AI graphic using OpenAI gpt-image-1 via the
 * NativPost Image Engine. This is the third image generation mode
 * alongside generate-image (Puppeteer templates) and generate-scene
 * (FLUX photographic backgrounds).
 *
 * What makes this different:
 *   - OpenAI gpt-image-1 produces graphic design-quality output:
 *     crisp typography, infographics, flat illustrations, editorial
 *     layouts — things FLUX and Puppeteer templates cannot do
 *   - Claude auto-generates the visual prompt from brand profile + topic
 *     (no prompt engineering required from the user)
 *   - Puppeteer composites a brand overlay on top for identity consistency
 *
 * Content types:
 *   infographic  — structured layouts with data, steps, comparisons
 *   illustration — branded concept art, flat design, visual metaphors
 *   typography   — text-dominant editorial graphics, bold quote cards
 *
 * Quality tiers:
 *   standard — gpt-image-1 medium quality (~$0.011–0.042/image)
 *   premium  — gpt-image-1 high quality  (~$0.06–0.21/image)
 *
 * Body (optional unless noted):
 *   contentType      — "infographic" | "illustration" | "typography" (default: "illustration")
 *   format           — "square" | "vertical" (default: "square")
 *   quality          — "standard" | "premium" (default: "standard")
 *   visualPrompt     — override: skip Claude, use this exact prompt
 *   overlayHeadline  — override: skip Claude, use this headline on overlay
 *   overlaySubtext   — optional subtext on overlay
 *   overlayEyebrow   — optional eyebrow label e.g. "PRO TIP"
 */

import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { applyRemixEdits, getRemixEditsFromGenerationParams } from '@/lib/remix-edits';
import { getDb } from '@/libs/DB';
import { brandProfileSchema, contentItemSchema } from '@/models/Schema';

const IMAGE_ENGINE_URL = process.env.NATIVPOST_IMAGE_URL || 'http://localhost:4000';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

type RouteParams = { params: Promise<{ id: string }> };

const VALID_CONTENT_TYPES = ['infographic', 'illustration', 'typography'] as const;
const VALID_FORMATS = ['square', 'vertical'] as const;
const VALID_QUALITY = ['standard', 'premium'] as const;

export async function POST(request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // No body — use defaults
  }

  try {
    // ── Load content item ────────────────────────────────────────────────────
    const [item] = await db
      .select()
      .from(contentItemSchema)
      .where(eq(contentItemSchema.id, id))
      .limit(1);

    if (!item || item.orgId !== orgId) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
    }

    // AI graphic works for single_image only (same as generate-image/generate-scene)
    if (item.contentType !== 'single_image') {
      return NextResponse.json(
        { error: 'AI graphic generation is only available for single_image content type' },
        { status: 400 },
      );
    }

    if (!item.caption?.trim()) {
      return NextResponse.json(
        { error: 'Content item has no caption — cannot auto-generate visual prompt' },
        { status: 400 },
      );
    }

    // ── Load brand profile ───────────────────────────────────────────────────
    const [profile] = await db
      .select({
        brandName: brandProfileSchema.brandName,
        primaryColor: brandProfileSchema.primaryColor,
        secondaryColor: brandProfileSchema.secondaryColor,
        logoUrl: brandProfileSchema.logoUrl,
        industry: brandProfileSchema.industry,
        toneFormality: brandProfileSchema.toneFormality,
        toneHumor: brandProfileSchema.toneHumor,
        toneEnergy: brandProfileSchema.toneEnergy,
      })
      .from(brandProfileSchema)
      .where(eq(brandProfileSchema.orgId, orgId!))
      .limit(1);

    // ── Extract + validate request params ────────────────────────────────────
    const contentType = (body.contentType as string) || 'illustration';
    const format = (body.format as string) || 'square';
    const quality = (body.quality as string) || 'standard';

    if (!VALID_CONTENT_TYPES.includes(contentType as typeof VALID_CONTENT_TYPES[number])) {
      return NextResponse.json(
        { error: `contentType must be one of: ${VALID_CONTENT_TYPES.join(', ')}` },
        { status: 400 },
      );
    }
    if (!VALID_FORMATS.includes(format as typeof VALID_FORMATS[number])) {
      return NextResponse.json(
        { error: `format must be one of: ${VALID_FORMATS.join(', ')}` },
        { status: 400 },
      );
    }
    if (!VALID_QUALITY.includes(quality as typeof VALID_QUALITY[number])) {
      return NextResponse.json(
        { error: `quality must be one of: ${VALID_QUALITY.join(', ')}` },
        { status: 400 },
      );
    }

    const brandTone = deriveBrandTone(
      profile?.toneFormality ?? 5,
      profile?.toneHumor ?? 5,
      profile?.toneEnergy ?? 5,
    );

    const remixEdits = getRemixEditsFromGenerationParams(item.generationParams);

    // ── Build payload for image engine ───────────────────────────────────────
    const basePayload: Record<string, unknown> = {
      // Content context — Claude uses these to write the visual prompt
      topic: item.topic || item.caption.split('\n')[0]?.slice(0, 120) || item.caption.slice(0, 120),
      postCaption: item.caption,
      contentType,

      // Brand tokens
      brandName: profile?.brandName || 'Brand',
      brandPrimary: profile?.primaryColor || '#864FFE',
      brandSecondary: profile?.secondaryColor || '#0D0D0D',
      ...(profile?.logoUrl ? { logoUrl: profile.logoUrl } : {}),
      industry: profile?.industry || undefined,
      brandTone,

      // Format + quality
      format,
      quality,
    };

    // Manual overrides — passed straight through to the engine
    // If visualPrompt AND overlayHeadline are both provided, Claude is skipped entirely
    if (body.visualPrompt) basePayload.visualPrompt = body.visualPrompt;
    if (body.overlayHeadline) basePayload.overlayHeadline = body.overlayHeadline;
    if (body.overlaySubtext) basePayload.overlaySubtext = body.overlaySubtext;
    if (body.overlayEyebrow) basePayload.overlayEyebrow = body.overlayEyebrow;

    const payload = applyRemixEdits(basePayload, remixEdits, 'ai_graphic');

    console.log(
      '[AI Graphic] Generating for content:', id,
      '| type:', contentType,
      '| format:', format,
      '| quality:', quality,
      '| brand:', profile?.brandName,
    );

    // ── Call image engine ────────────────────────────────────────────────────
    // 180s timeout — gpt-image-1 high quality can take 60–90s
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180_000);

    let renderRes: Response;
    try {
      renderRes = await fetch(`${IMAGE_ENGINE_URL}/render/ai-graphic`, {
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
        return NextResponse.json(
          { error: 'AI graphic generation timed out. Try standard quality or try again.' },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { error: `Cannot reach image engine: ${String(fetchErr)}` },
        { status: 502 },
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!renderRes.ok) {
      const errText = await renderRes.text();
      console.error('[AI Graphic] Engine error:', renderRes.status, errText);
      return NextResponse.json(
        { error: 'AI graphic generation failed.', detail: errText },
        { status: 502 },
      );
    }

    const renderData = await renderRes.json() as {
      url: string;
      publicId: string;
      format: string;
      quality: string;
      contentType: string;
      visualPrompt: string;
      overlayHeadline: string;
      generationMs: number;
      totalMs: number;
    };

    if (!renderData.url) {
      return NextResponse.json(
        { error: 'AI graphic engine returned no image URL' },
        { status: 502 },
      );
    }

    // ── Save to DB ───────────────────────────────────────────────────────────
    // Single URL — the engine returns one image per request (format: square OR vertical)
    // We store it in graphicUrls[0] (or append alongside existing images if regenerating)
    const existingUrls = (item.graphicUrls as string[]) || [];
    const existingPublicIds = ((item.platformSpecific as Record<string, any>)?.cloudinaryPublicIds as string[]) || [];

    // Replace or append: if format matches an existing slot, replace it; otherwise append
    // slot 0 = square, slot 1 = vertical (same convention as generate-scene/generate-image)
    const slotIndex = format === 'square' ? 0 : 1;
    const updatedUrls = [...existingUrls];
    const updatedPublicIds = [...existingPublicIds];
    updatedUrls[slotIndex] = renderData.url;
    updatedPublicIds[slotIndex] = renderData.publicId;

    await db
      .update(contentItemSchema)
      .set({
        graphicUrls: updatedUrls.filter(Boolean),
        platformSpecific: {
          ...(item.platformSpecific as object || {}),
          imageTemplate: 'ai-graphic',
          aiGraphicType: contentType,
          aiGraphicQuality: quality,
          promptUsed: renderData.visualPrompt,
          headlineUsed: renderData.overlayHeadline,
          cloudinaryPublicIds: updatedPublicIds.filter(Boolean),
        },
        updatedAt: new Date(),
      })
      .where(eq(contentItemSchema.id, id));

    return NextResponse.json({
      success: true,
      url: renderData.url,
      publicId: renderData.publicId,
      format: renderData.format,
      quality: renderData.quality,
      contentType: renderData.contentType,
      visualPrompt: renderData.visualPrompt,
      overlayHeadline: renderData.overlayHeadline,
      generationMs: renderData.generationMs,
      totalMs: renderData.totalMs,
    });
  } catch (err) {
    console.error('[AI Graphic] generate-ai-graphic failed:', err);
    return NextResponse.json(
      { error: `AI graphic generation failed: ${String(err)}` },
      { status: 500 },
    );
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
// Copied from generate-scene.ts for consistency — same tone derivation logic

function deriveBrandTone(formality: number, humor: number, energy: number): string {
  const tones: string[] = [];
  if (formality >= 7) tones.push('professional');
  else if (formality <= 3) tones.push('casual');
  if (humor >= 7) tones.push('playful');
  else if (humor <= 3) tones.push('serious');
  if (energy >= 7) tones.push('bold');
  else if (energy <= 3) tones.push('calm');

  if (tones.includes('professional') && tones.includes('bold')) return 'bold professional';
  if (tones.includes('professional') && tones.includes('calm')) return 'elegant';
  if (tones.includes('casual') && tones.includes('playful')) return 'vibrant';
  if (tones.includes('casual') && tones.includes('bold')) return 'bold';
  if (tones.includes('serious')) return 'cinematic';
  return tones.join(' ') || 'professional';
}
