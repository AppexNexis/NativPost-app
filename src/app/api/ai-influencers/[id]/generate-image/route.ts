import { eq, and } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { aiInfluencerSchema, brandProfileSchema } from '@/models/Schema';

const IMAGE_ENGINE_URL = process.env.NATIVPOST_IMAGE_URL || 'http://localhost:4000';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

type RouteParams = { params: Promise<{ id: string }> };

// -----------------------------------------------------------
// POST /api/ai-influencers/[id]/generate-image
// Generate a base reference image for an AI influencer
// -----------------------------------------------------------
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

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

    // Build detailed prompt from traits
    const prompt = buildInfluencerPrompt(influencer);

    const payload = {
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

    console.log('[Influencer] Generating base image for:', id, '| name:', influencer.name);

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
        return NextResponse.json({ error: 'Image generation timed out. Please try again.' }, { status: 503 });
      }
      return NextResponse.json({ error: `Cannot reach image engine: ${String(fetchErr)}` }, { status: 502 });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!renderRes.ok) {
      const errText = await renderRes.text();
      console.error('[Influencer] Engine error:', renderRes.status, errText);
      return NextResponse.json({ error: 'Image generation failed.', detail: errText }, { status: 502 });
    }

    const renderData = await renderRes.json() as {
      square?: string;
      vertical?: string;
      promptUsed?: string;
      modelUsed?: string;
      totalMs?: number;
    };

    const imageUrl = renderData.square || renderData.vertical;

    if (!imageUrl) {
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
    return NextResponse.json({ error: `Image generation failed: ${String(err)}` }, { status: 500 });
  }
}

// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------

function buildInfluencerPrompt(influencer: {
  name: string;
  description: string | null;
  gender: string | null;
  ageRange: string | null;
  ethnicity: string | null;
  hairStyle: string | null;
  hairColor: string | null;
  bodyType: string | null;
  fashionStyle: string | null;
  poseStyle: string | null;
  backgroundPreference: string | null;
}): string {
  const parts: string[] = [];

  parts.push('A photorealistic portrait photograph of the same person, consistent facial features, consistent skin tone, high detail, studio lighting, 8k quality.');

  if (influencer.gender) {
    parts.push(`${influencer.gender}`);
  }
  if (influencer.ageRange) {
    parts.push(`aged ${influencer.ageRange}`);
  }
  if (influencer.ethnicity) {
    parts.push(`of ${influencer.ethnicity} ethnicity`);
  }
  if (influencer.bodyType) {
    parts.push(`with a ${influencer.bodyType} build`);
  }
  if (influencer.hairStyle && influencer.hairColor) {
    parts.push(`${influencer.hairColor} ${influencer.hairStyle} hair`);
  } else if (influencer.hairColor) {
    parts.push(`${influencer.hairColor} hair`);
  } else if (influencer.hairStyle) {
    parts.push(`${influencer.hairStyle} hair`);
  }
  if (influencer.fashionStyle) {
    parts.push(`wearing ${influencer.fashionStyle} clothing`);
  }
  if (influencer.poseStyle) {
    parts.push(`in a ${influencer.poseStyle} pose`);
  }
  if (influencer.backgroundPreference) {
    parts.push(`with a ${influencer.backgroundPreference} background`);
  }

  parts.push('Front-facing, clear face, sharp eyes, natural expression, professional photography, neutral background, consistent across all generations.');

  return parts.join('. ');
}
