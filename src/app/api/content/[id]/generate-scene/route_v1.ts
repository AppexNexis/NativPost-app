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
 * POST /api/content/[id]/generate-scene
 *
 * Generates a studio-quality AI scene image using FLUX Pro (via fal.ai).
 * The post caption drives the visual concept — no caption text is rendered
 * inside the image. Falls back to a Puppeteer quote card if fal.ai is
 * unavailable (exhausted credits, API down, timeout).
 *
 * Body (optional):
 *   formats      — ["square"] | ["vertical"] | ["square","vertical"] (default: ["square","vertical"])
 *   imageStyle   — "minimal"|"vibrant"|"professional"|"elegant"|"bold"|"cinematic" (default: "professional")
 *   modelTier    — "pro"|"dev"|"schnell" (default: "pro")
 *   overlayStyle — "standard"|"minimal"|"none" (default: "standard")
 *   scenePrompt  — explicit scene description (overrides auto-generation)
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
    // No body — use defaults
  }

  try {
    const [item] = await db
      .select()
      .from(contentItemSchema)
      .where(eq(contentItemSchema.id, id))
      .limit(1);

    if (!item || item.orgId !== orgId) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
    }

    if (!item.caption?.trim()) {
      return NextResponse.json({ error: 'Content item has no caption to generate a scene from' }, { status: 400 });
    }

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

    const brandTone = deriveBrandTone(
      profile?.toneFormality ?? 5,
      profile?.toneHumor ?? 5,
      profile?.toneEnergy ?? 5,
    );

    const formats = (body.formats as string[]) || ['square', 'vertical'];
    const imageStyle = (body.imageStyle as string) || 'professional';
    const modelTier = (body.modelTier as string) || 'pro';
    const overlayStyle = (body.overlayStyle as string) || 'standard';
    const scenePrompt = (body.scenePrompt as string) || undefined;

    const payload = {
      caption: item.caption,
      industry: profile?.industry || undefined,
      brandTone,
      imageStyle,
      formats,
      modelTier,
      overlayStyle,
      scenePrompt,
      brandName: profile?.brandName || 'Brand',
      brandPrimary: profile?.primaryColor || '#864FFE',
      brandSecondary: profile?.secondaryColor || '#0D0D0D',
      ...(profile?.logoUrl ? { logoUrl: profile.logoUrl } : {}),
    };

    console.log('[Scene] Generating for content:', id, '| industry:', profile?.industry, '| tone:', brandTone);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000);

    let renderRes: Response;
    try {
      renderRes = await fetch(`${IMAGE_ENGINE_URL}/render/scene`, {
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
        return NextResponse.json({ error: 'Scene generation timed out. Please try again.' }, { status: 503 });
      }
      return NextResponse.json({ error: `Cannot reach image engine: ${String(fetchErr)}` }, { status: 502 });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!renderRes.ok) {
      const errText = await renderRes.text();
      console.error('[Scene] Engine error:', renderRes.status, errText);
      return NextResponse.json({ error: 'Scene generation failed.', detail: errText }, { status: 502 });
    }

    const renderData = await renderRes.json() as {
      square?: string;
      vertical?: string;
      promptUsed?: string;
      modelUsed?: string;
      fallback?: boolean;
      fallbackReason?: string;
      totalMs?: number;
    };

    const imageUrls = [renderData.square, renderData.vertical].filter(Boolean) as string[];

    if (!imageUrls.length) {
      return NextResponse.json({ error: 'Scene engine returned no images' }, { status: 502 });
    }

    await db
      .update(contentItemSchema)
      .set({
        graphicUrls: imageUrls,
        platformSpecific: {
          ...(item.platformSpecific as object || {}),
          imageTemplate: 'ai-scene',
          imageStyle,
          sceneModelUsed: renderData.modelUsed,
          promptUsed: renderData.promptUsed,
          isFallback: renderData.fallback ?? false,
        },
        updatedAt: new Date(),
      })
      .where(eq(contentItemSchema.id, id));

    return NextResponse.json({
      success: true,
      square: renderData.square,
      vertical: renderData.vertical,
      promptUsed: renderData.promptUsed,
      modelUsed: renderData.modelUsed,
      fallback: renderData.fallback ?? false,
      fallbackReason: renderData.fallbackReason,
      totalMs: renderData.totalMs,
    });
  } catch (err) {
    console.error('[Scene] generate-scene failed:', err);
    return NextResponse.json({ error: `Scene generation failed: ${String(err)}` }, { status: 500 });
  }
}

function deriveBrandTone(formality: number, humor: number, energy: number): string {
  const tones: string[] = [];
  if (formality >= 7) {
    tones.push('professional');
  } else if (formality <= 3) {
    tones.push('casual');
  }
  if (humor >= 7) {
    tones.push('playful');
  } else if (humor <= 3) {
    tones.push('serious');
  }
  if (energy >= 7) {
    tones.push('bold');
  } else if (energy <= 3) {
    tones.push('calm');
  }

  if (tones.includes('professional') && tones.includes('bold')) {
    return 'bold professional';
  }
  if (tones.includes('professional') && tones.includes('calm')) {
    return 'elegant';
  }
  if (tones.includes('casual') && tones.includes('playful')) {
    return 'vibrant';
  }
  if (tones.includes('casual') && tones.includes('bold')) {
    return 'bold';
  }
  if (tones.includes('serious')) {
    return 'cinematic';
  }
  return tones.join(' ') || 'professional';
}
