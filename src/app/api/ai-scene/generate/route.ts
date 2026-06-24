import { eq, and } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { aiInfluencerSchema, brandProfileSchema, mediaAssetSchema } from '@/models/Schema';

const IMAGE_ENGINE_URL = process.env.NATIVPOST_IMAGE_URL || 'http://localhost:4000';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

const VALID_FORMATS = ['square', 'vertical', 'landscape', 'portrait'] as const;
const VALID_STYLES = ['minimal', 'vibrant', 'professional', 'elegant', 'bold', 'cinematic'] as const;
const VALID_OVERLAY_STYLES = ['standard', 'minimal', 'none'] as const;

// -----------------------------------------------------------
// POST /api/ai-scene/generate
// Generate an AI scene with optional influencer + brand injection
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Validate required fields
  const prompt = (body.prompt as string) || '';
  if (!prompt.trim()) {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
  }

  const formats = (body.formats as string[]) || ['square', 'vertical'];
  const invalidFormat = formats.find((f) => !VALID_FORMATS.includes(f as typeof VALID_FORMATS[number]));
  if (invalidFormat) {
    return NextResponse.json({ error: `Invalid format: ${invalidFormat}. Valid: ${VALID_FORMATS.join(', ')}` }, { status: 400 });
  }

  const imageStyle = (body.imageStyle as string) || 'professional';
  if (!VALID_STYLES.includes(imageStyle as typeof VALID_STYLES[number])) {
    return NextResponse.json({ error: `Invalid imageStyle. Valid: ${VALID_STYLES.join(', ')}` }, { status: 400 });
  }

  const overlayStyle = (body.overlayStyle as string) || 'standard';
  if (!VALID_OVERLAY_STYLES.includes(overlayStyle as typeof VALID_OVERLAY_STYLES[number])) {
    return NextResponse.json({ error: `Invalid overlayStyle. Valid: ${VALID_OVERLAY_STYLES.join(', ')}` }, { status: 400 });
  }

  const aspectRatio = (body.aspectRatio as string) || '9:16';
  const includeInfluencer = (body.includeInfluencer as string) || null;
  const overlayHeadline = (body.overlayHeadline as string) || undefined;
  const overlaySubtext = (body.overlaySubtext as string) || undefined;
  const saveToMediaLibrary = (body.saveToMediaLibrary as boolean) ?? true;

  try {
    // Fetch brand profile
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

    // Build scene prompt
    let scenePrompt = prompt;

    // If influencer is included, fetch and prepend their description
    if (includeInfluencer) {
      const [influencer] = await db
        .select()
        .from(aiInfluencerSchema)
        .where(and(eq(aiInfluencerSchema.id, includeInfluencer), eq(aiInfluencerSchema.orgId, orgId!)))
        .limit(1);

      if (influencer) {
        const influencerDesc = buildInfluencerDescription(influencer);
        scenePrompt = `${prompt}. Featuring ${influencerDesc}. Maintain consistent facial features and identity.`;
      }
    }

    const payload = {
      scenePrompt,
      formats,
      imageStyle,
      overlayStyle,
      brandName: profile?.brandName || 'Brand',
      brandPrimary: profile?.primaryColor || '#864FFE',
      brandSecondary: profile?.secondaryColor || '#0D0D0D',
      brandAccent: profile?.accentColor || '#FFFFFF',
      ...(profile?.logoUrl ? { logoUrl: profile.logoUrl } : {}),
      industry: profile?.industry || undefined,
      ...(overlayHeadline ? { overlayHeadline } : {}),
      ...(overlaySubtext ? { overlaySubtext } : {}),
    };

    console.log('[AI Scene] Generating scene | prompt:', scenePrompt.slice(0, 100), '| formats:', formats, '| style:', imageStyle);

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
      console.error('[AI Scene] Engine error:', renderRes.status, errText);
      return NextResponse.json({ error: 'Scene generation failed.', detail: errText }, { status: 502 });
    }

    const renderData = await renderRes.json() as {
      square?: string;
      vertical?: string;
      landscape?: string;
      portrait?: string;
      promptUsed?: string;
      modelUsed?: string;
      totalMs?: number;
    };

    const imageUrls: Record<string, string> = {};
    if (renderData.square) imageUrls.square = renderData.square;
    if (renderData.vertical) imageUrls.vertical = renderData.vertical;
    if (renderData.landscape) imageUrls.landscape = renderData.landscape;
    if (renderData.portrait) imageUrls.portrait = renderData.portrait;

    const urlEntries = Object.entries(imageUrls);
    if (urlEntries.length === 0) {
      return NextResponse.json({ error: 'Scene engine returned no images' }, { status: 502 });
    }

    // Save to media library if requested
    const savedAssets: { id: string; url: string; format: string }[] = [];

   if (saveToMediaLibrary) {
      for (const [format, url] of urlEntries) {
        const [created] = await db
          .insert(mediaAssetSchema)
          .values({
            orgId: orgId!,
            url,
            thumbnailUrl: url,
            assetType: 'ai_scene',
            aspectRatio: aspectRatio || '9:16',
            source: 'flux',
            description: prompt,
            aiMetadata: {
              prompt: renderData.promptUsed || prompt,
              model: renderData.modelUsed || 'flux',
              stylePreset: imageStyle,
            },
            tags: ['ai-generated', 'scene', format, ...(includeInfluencer ? ['influencer'] : [])],
          })
          .returning();

        if (!created) {
          console.error('[AI Scene] Insert returned no row for media asset, format:', format);
          continue;
        }

        savedAssets.push({ id: created.id, url, format });
      }
    }

    return NextResponse.json({
      success: true,
      images: imageUrls,
      promptUsed: renderData.promptUsed,
      modelUsed: renderData.modelUsed,
      totalMs: renderData.totalMs,
      savedAssets,
    });
  } catch (err) {
    console.error('[AI Scene] generate-scene failed:', err);
    return NextResponse.json({ error: `Scene generation failed: ${String(err)}` }, { status: 500 });
  }
}

function buildInfluencerDescription(influencer: {
  gender: string | null;
  ageRange: string | null;
  ethnicity: string | null;
  hairStyle: string | null;
  hairColor: string | null;
  bodyType: string | null;
  fashionStyle: string | null;
}): string {
  const parts: string[] = [];

  if (influencer.gender) parts.push(influencer.gender);
  if (influencer.ageRange) parts.push(`aged ${influencer.ageRange}`);
  if (influencer.ethnicity) parts.push(`of ${influencer.ethnicity} ethnicity`);
  if (influencer.bodyType) parts.push(`with a ${influencer.bodyType} build`);
  if (influencer.hairStyle && influencer.hairColor) {
    parts.push(`with ${influencer.hairColor} ${influencer.hairStyle} hair`);
  } else if (influencer.hairColor) {
    parts.push(`with ${influencer.hairColor} hair`);
  } else if (influencer.hairStyle) {
    parts.push(`with ${influencer.hairStyle} hair`);
  }
  if (influencer.fashionStyle) parts.push(`wearing ${influencer.fashionStyle} clothing`);

  return parts.join(', ');
}
