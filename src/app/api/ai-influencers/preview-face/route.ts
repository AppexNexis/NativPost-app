import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { buildInfluencerCaption, buildInfluencerPrompt, type InfluencerTraits } from '@/lib/ai-influencers/build-prompt';
import { commitCredits, refundCredits, reserveCredits } from '@/lib/ai-studio/server';
import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { brandProfileSchema } from '@/models/Schema';

const IMAGE_ENGINE_URL = process.env.NATIVPOST_IMAGE_URL || 'http://localhost:4000';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

const PREVIEW_FACE_CREDITS = 3;

// -----------------------------------------------------------
// POST /api/ai-influencers/preview-face
// Generate a candidate base-character face for the create wizard.
// The influencer row does NOT exist yet — this endpoint is stateless
// (no DB writes) and is called repeatedly while the user regenerates.
// Costs 3 credits per generation.
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  let body: { traits?: InfluencerTraits; regenerationInstructions?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const traits = body.traits;
  if (!traits || typeof traits !== 'object') {
    return NextResponse.json({ error: 'Missing traits' }, { status: 400 });
  }

  const reservationId = `influencer-preview-${orgId}-${Date.now()}`;

  // Reserve credits before calling the image engine
  try {
    await reserveCredits(orgId!, reservationId, PREVIEW_FACE_CREDITS);
  } catch {
    return NextResponse.json(
      { error: 'Insufficient AI credits', code: 'INSUFFICIENT_CREDITS' },
      { status: 402 },
    );
  }

  try {
    // Fetch brand profile for colors (matches [id]/generate-image payload shape)
    const [profile] = await db
      .select({
        brandName: brandProfileSchema.brandName,
        primaryColor: brandProfileSchema.primaryColor,
        secondaryColor: brandProfileSchema.secondaryColor,
        accentColor: brandProfileSchema.accentColor,
        logoUrl: brandProfileSchema.logoUrl,
        industry: brandProfileSchema.industry,
      })
      .from(brandProfileSchema)
      .where(eq(brandProfileSchema.orgId, orgId!))
      .limit(1);

    const prompt = buildInfluencerPrompt(traits, body.regenerationInstructions);
    const caption = buildInfluencerCaption(traits);

    const payload = {
      caption,
      scenePrompt: prompt,
      formats: ['square'],
      imageStyle: 'professional',
      overlayStyle: 'none',
      brandName: profile?.brandName || 'Brand',
      brandPrimary: profile?.primaryColor || '#864FFE',
      brandSecondary: profile?.secondaryColor || '#0D0D0D',
      brandAccent: profile?.accentColor || '#FFFFFF',
      ...(profile?.logoUrl ? { logoUrl: profile.logoUrl } : {}),
      industry: profile?.industry || undefined,
    };

    console.log('[Influencer] Preview face | name:', traits.name || '(unnamed)', '| regen:', !!body.regenerationInstructions);

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
      try {
        await refundCredits(orgId!, reservationId, PREVIEW_FACE_CREDITS, String(fetchErr));
      } catch { /* best effort */ }
      if (isAbort) {
        return NextResponse.json({ error: 'Image generation timed out. Please try again.' }, { status: 503 });
      }
      return NextResponse.json({ error: `Cannot reach image engine: ${String(fetchErr)}` }, { status: 502 });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!renderRes.ok) {
      const errText = await renderRes.text();
      console.error('[Influencer] Preview engine error:', renderRes.status, errText);
      try {
        await refundCredits(orgId!, reservationId, PREVIEW_FACE_CREDITS, errText);
      } catch { /* best effort */ }
      return NextResponse.json({ error: 'Image generation failed.', detail: errText }, { status: 502 });
    }

    const renderData = await renderRes.json() as {
      square?: string | { url: string };
      vertical?: string | { url: string };
      promptUsed?: string;
      modelUsed?: string;
      totalMs?: number;
    };

    const rawUrl = renderData.square || renderData.vertical;
    // /render/scene returns the full CloudinaryUploadResult object per format
    const imageUrl = typeof rawUrl === 'string' ? rawUrl : rawUrl?.url;

    if (!imageUrl) {
      try {
        await refundCredits(orgId!, reservationId, PREVIEW_FACE_CREDITS, 'No image returned');
      } catch { /* best effort */ }
      return NextResponse.json({ error: 'Image engine returned no image' }, { status: 502 });
    }

    await commitCredits(orgId!, reservationId, PREVIEW_FACE_CREDITS, 'Preview face generation');
    return NextResponse.json({
      success: true,
      imageUrl,
      promptUsed: renderData.promptUsed,
      modelUsed: renderData.modelUsed,
      totalMs: renderData.totalMs,
    });
  } catch (err) {
    console.error('[Influencer] preview-face failed:', err);
    try {
      await refundCredits(orgId!, reservationId, PREVIEW_FACE_CREDITS, String(err));
    } catch { /* best effort */ }
    return NextResponse.json({ error: `Preview generation failed: ${String(err)}` }, { status: 500 });
  }
}
