import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { buildInfluencerCaption, buildInfluencerPrompt } from '@/lib/ai-influencers/build-prompt';
import { commitCredits, refundCredits, reserveCredits } from '@/lib/ai-studio/server';
import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { aiInfluencerSchema, brandProfileSchema } from '@/models/Schema';

const IMAGE_ENGINE_URL = process.env.NATIVPOST_IMAGE_URL || 'http://localhost:4000';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

const GENERATE_IMAGE_CREDITS_LORA = 3;
const GENERATE_IMAGE_CREDITS_NANO = 5;

type RouteParams = { params: Promise<{ id: string }> };

// -----------------------------------------------------------
// POST /api/ai-influencers/[id]/generate-image
// Generate a base reference image for an AI influencer.
// Costs 3 credits.
// -----------------------------------------------------------
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const { id } = await params;

  const reservationId = `influencer-image-${id}-${Date.now()}`;
  let genCreditsFallback = GENERATE_IMAGE_CREDITS_LORA;
  try {
    // Fetch influencer
    const [influencer] = await db
      .select()
      .from(aiInfluencerSchema)
      .where(and(eq(aiInfluencerSchema.id, id), eq(aiInfluencerSchema.orgId, orgId!)))
      .limit(1);

    if (!influencer) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }

    // Fetch brand profile for colors
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

    const prompt = buildInfluencerPrompt(influencer);
    const caption = buildInfluencerCaption(influencer);

    const isNano = influencer.trainingMode === 'nano_banana';
    const genCredits = isNano ? GENERATE_IMAGE_CREDITS_NANO : GENERATE_IMAGE_CREDITS_LORA;
    genCreditsFallback = genCredits;

    // Reserve credits before calling the engine
    try {
      await reserveCredits(orgId!, reservationId, genCredits);
    } catch {
      return NextResponse.json(
        { error: 'Insufficient AI credits', code: 'INSUFFICIENT_CREDITS' },
        { status: 402 },
      );
    }

    // ── Nano Banana: Instant Identity ──
    if (isNano && influencer.loraStatus === 'ready') {
      console.log('[Influencer] Generating with Nano Banana for:', id, '| name:', influencer.name);
      const refs = (influencer.referenceImageUrls as string[]) || [];

      try {
        const nanoRes = await fetch(`${IMAGE_ENGINE_URL}/render/nano-banana-generate`, {
          method: 'POST',
          signal: AbortSignal.timeout(180_000),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ENGINE_API_KEY}`,
          },
          body: JSON.stringify({
            prompt,
            imageUrls: refs,
            numImages: 1,
            aspectRatio: '1:1',
            resolution: '1K',
          }),
        });

        if (nanoRes.ok) {
          const nanoData = await nanoRes.json() as { imageUrl: string; seed: number; generationMs: number };
          const imageUrl = nanoData.imageUrl;
          if (imageUrl) {
            const existingRefs = (influencer.referenceImageUrls as string[]) || [];
            const updatedRefs = [...existingRefs, imageUrl];

            await db
              .update(aiInfluencerSchema)
              .set({ baseImageUrl: imageUrl, referenceImageUrls: updatedRefs, updatedAt: new Date() })
              .where(and(eq(aiInfluencerSchema.id, id), eq(aiInfluencerSchema.orgId, orgId!)));

            await commitCredits(orgId!, reservationId, genCredits, 'Generate influencer image (Instant Identity)');
            return NextResponse.json({ success: true, imageUrl, seed: nanoData.seed, generationMs: nanoData.generationMs, method: 'nano_banana' });
          }
        }
        console.warn('[Influencer] Nano Banana failed, falling back to /render/scene:', nanoRes.status);
      } catch (err) {
        console.warn('[Influencer] Nano Banana error, falling back to /render/scene:', String(err));
      }
    }

    // ── Identity path (face-locked, FLUX.2 LoRA) ──
    if (influencer.loraStatus === 'ready' && influencer.loraModelId) {
      console.log('[Influencer] Generating with identity model for:', id, '| name:', influencer.name);

      try {
        const loraRes = await fetch(`${IMAGE_ENGINE_URL}/render/lora-inference`, {
          method: 'POST',
          signal: AbortSignal.timeout(180_000),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ENGINE_API_KEY}`,
          },
          body: JSON.stringify({
            loraUrl: influencer.loraModelId,
            prompt,
            uploadToCloudinary: true,
          }),
        });

        if (loraRes.ok) {
          const loraData = await loraRes.json() as { imageUrl: string; seed: number; generationMs: number };
          const imageUrl = loraData.imageUrl;
          if (imageUrl) {
            const existingRefs = (influencer.referenceImageUrls as string[]) || [];
            const updatedRefs = [...existingRefs, imageUrl];

            await db
              .update(aiInfluencerSchema)
              .set({ baseImageUrl: imageUrl, referenceImageUrls: updatedRefs, updatedAt: new Date() })
              .where(and(eq(aiInfluencerSchema.id, id), eq(aiInfluencerSchema.orgId, orgId!)));

            await commitCredits(orgId!, reservationId, genCredits, 'Generate influencer base image');
            return NextResponse.json({ success: true, imageUrl, seed: loraData.seed, generationMs: loraData.generationMs, method: 'lora' });
          }
        }
        console.warn('[Influencer] Identity inference failed, falling back to /render/scene:', loraRes.status);
      } catch (err) {
        console.warn('[Influencer] Identity inference error, falling back to /render/scene:', String(err));
      }
    }

    // ── Fallback: generic scene endpoint ──
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

    console.log('[Influencer] Generating base image (scene) for:', id, '| name:', influencer.name);

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
      try {
        await refundCredits(orgId!, reservationId, genCredits, String(fetchErr));
      } catch { /* best effort */ }
      const isAbort = fetchErr instanceof Error && fetchErr.name === 'AbortError';
      if (isAbort) {
        return NextResponse.json({ error: 'Image generation timed out. Please try again.' }, { status: 503 });
      }
      return NextResponse.json({ error: `Cannot reach image engine: ${String(fetchErr)}` }, { status: 502 });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!renderRes.ok) {
      const errText = await renderRes.text();
      console.error('[Influencer] Engine error:', renderRes.status, errText);
      try {
        await refundCredits(orgId!, reservationId, genCredits, errText);
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
    const imageUrl = typeof rawUrl === 'string' ? rawUrl : rawUrl?.url;

    if (!imageUrl) {
      try {
        await refundCredits(orgId!, reservationId, genCredits, 'No image returned');
      } catch { /* best effort */ }
      return NextResponse.json({ error: 'Image engine returned no image' }, { status: 502 });
    }

    // Update influencer with new base image and append to reference images
    const existingRefs = (influencer.referenceImageUrls as string[]) || [];
    const updatedRefs = [...existingRefs, imageUrl];

    const [updated] = await db
      .update(aiInfluencerSchema)
      .set({
        baseImageUrl: imageUrl,
        referenceImageUrls: updatedRefs,
        updatedAt: new Date(),
      })
      .where(and(eq(aiInfluencerSchema.id, id), eq(aiInfluencerSchema.orgId, orgId!)))
      .returning();

    await commitCredits(orgId!, reservationId, genCredits, 'Generate influencer base image');
    return NextResponse.json({
      success: true,
      imageUrl,
      promptUsed: renderData.promptUsed,
      modelUsed: renderData.modelUsed,
      totalMs: renderData.totalMs,
      influencer: updated,
    });
  } catch (err) {
    console.error('[Influencer] generate-image failed:', err);
    try {
      await refundCredits(orgId!, reservationId, genCreditsFallback, String(err));
    } catch { /* best effort */ }
    return NextResponse.json({ error: `Image generation failed: ${String(err)}` }, { status: 500 });
  }
}
