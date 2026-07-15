import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { aiInfluencerSchema, brandProfileSchema } from '@/models/Schema';

const IMAGE_ENGINE_URL = process.env.NATIVPOST_IMAGE_URL || 'http://localhost:4000';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

type RouteParams = { params: Promise<{ id: string }> };

type GenerationVariant = {
  setting: string;
  pose: string;
  background: string;
};

const CONSISTENCY_VARIANTS: GenerationVariant[] = [
  { setting: 'a modern office with city skyline view', pose: 'standing confidently', background: 'professional office' },
  { setting: 'a cozy coffee shop with warm ambient lighting', pose: 'sitting relaxed', background: 'warm cafe interior' },
  { setting: 'an outdoor urban park with golden hour sunlight', pose: 'walking casually', background: 'sunny park with trees' },
];

// -----------------------------------------------------------
// POST /api/ai-influencers/[id]/test-consistency
// Generate 3 images to test influencer consistency
// -----------------------------------------------------------
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const { id } = await params;

  try {
    const [influencer] = await db
      .select()
      .from(aiInfluencerSchema)
      .where(and(eq(aiInfluencerSchema.id, id), eq(aiInfluencerSchema.orgId, orgId!)))
      .limit(1);

    if (!influencer) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }

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

    const baseDescription = buildInfluencerBaseDescription(influencer);

    // Generate 3 images in parallel
    const results = await Promise.all(
      CONSISTENCY_VARIANTS.map(async (variant, index) => {
        const prompt = `${baseDescription}. ${variant.pose} in ${variant.setting}. ${variant.background}. Same exact person, same facial features, same skin tone, same hair, consistent identity across all shots. Photorealistic, high detail, professional photography.`;

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

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120_000);

        try {
          const renderRes = await fetch(`${IMAGE_ENGINE_URL}/render/scene`, {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${ENGINE_API_KEY}`,
            },
            body: JSON.stringify(payload),
          });
          clearTimeout(timeoutId);

          if (!renderRes.ok) {
            const errText = await renderRes.text();
            console.error(`[Consistency] Variant ${index + 1} engine error:`, renderRes.status, errText);
            return { index: index + 1, variant, error: `Engine error: ${renderRes.status}` };
          }

          const renderData = await renderRes.json() as {
            square?: string | { url: string };
            vertical?: string | { url: string };
            promptUsed?: string;
            modelUsed?: string;
          };

          const rawUrl = renderData.square || renderData.vertical;
          const imageUrl = typeof rawUrl === 'string' ? rawUrl : rawUrl?.url;

          return {
            index: index + 1,
            variant,
            imageUrl: imageUrl || null,
            promptUsed: renderData.promptUsed,
            modelUsed: renderData.modelUsed,
          };
        } catch (fetchErr: unknown) {
          clearTimeout(timeoutId);
          const isAbort = fetchErr instanceof Error && fetchErr.name === 'AbortError';
          return {
            index: index + 1,
            variant,
            error: isAbort ? 'Generation timed out' : `Network error: ${String(fetchErr)}`,
          };
        }
      }),
    );

    // Check if any succeeded
    const successes = results.filter(r => r.imageUrl);
    if (successes.length === 0) {
      return NextResponse.json({ error: 'All consistency test generations failed', results }, { status: 502 });
    }

    // Append generated images to referenceImageUrls
    const newUrls = successes.map(r => r.imageUrl!).filter(Boolean);
    const existingRefs = (influencer.referenceImageUrls as string[]) || [];
    const updatedRefs = [...existingRefs, ...newUrls];

    await db
      .update(aiInfluencerSchema)
      .set({
        referenceImageUrls: updatedRefs,
        updatedAt: new Date(),
      })
      .where(and(eq(aiInfluencerSchema.id, id), eq(aiInfluencerSchema.orgId, orgId!)));

    return NextResponse.json({
      success: true,
      results,
      generatedCount: successes.length,
    });
  } catch (err) {
    console.error('[Consistency] test-consistency failed:', err);
    return NextResponse.json({ error: `Consistency test failed: ${String(err)}` }, { status: 500 });
  }
}

function buildInfluencerBaseDescription(influencer: {
  gender: string | null;
  ageRange: string | null;
  ethnicity: string | null;
  hairStyle: string | null;
  hairColor: string | null;
  bodyType: string | null;
  fashionStyle: string | null;
}): string {
  const parts: string[] = ['A photorealistic photograph of the same person'];

  if (influencer.gender) {
    parts.push(influencer.gender);
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
    parts.push(`with ${influencer.hairColor} ${influencer.hairStyle} hair`);
  } else if (influencer.hairColor) {
    parts.push(`with ${influencer.hairColor} hair`);
  } else if (influencer.hairStyle) {
    parts.push(`with ${influencer.hairStyle} hair`);
  }
  if (influencer.fashionStyle) {
    parts.push(`wearing ${influencer.fashionStyle} clothing`);
  }

  return parts.join(', ');
}
