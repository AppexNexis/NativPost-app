import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { brandProfileSchema, contentItemSchema } from '@/models/Schema';

const VIDEO_RENDERER_URL = process.env.NATIVPOST_VIDEO_URL || 'http://localhost:3001';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const { id } = await params;

  console.log('[Video] VIDEO_RENDERER_URL:', VIDEO_RENDERER_URL);
  console.log('[Video] ENGINE_API_KEY set:', !!ENGINE_API_KEY);

  try {
    const [item] = await db
      .select()
      .from(contentItemSchema)
      .where(eq(contentItemSchema.id, id))
      .limit(1);

    if (!item || item.orgId !== orgId) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
    }

    if (item.contentType !== 'reel') {
      return NextResponse.json(
        { error: 'Video generation only available for reel content type' },
        { status: 400 },
      );
    }

    const imageUrls = (item.graphicUrls as string[]) || [];

    // Fetch brand profile
    const [profile] = await db
      .select({
        brandName:      brandProfileSchema.brandName,
        primaryColor:   brandProfileSchema.primaryColor,
        secondaryColor: brandProfileSchema.secondaryColor,
        logoUrl:        brandProfileSchema.logoUrl,
        industry:       brandProfileSchema.industry,
      })
      .from(brandProfileSchema)
      .where(eq(brandProfileSchema.orgId, orgId!))
      .limit(1);

    // Parse photoTier from request body (dashboard sends this)
    let requestBody: { photoTier?: string } = {};
    try { requestBody = await request.json(); } catch { /* no body */ }

    const payload = {
      images: imageUrls,
      caption: item.caption,
      brandPrimary:   profile?.primaryColor   || '#864FFE',
      brandSecondary: profile?.secondaryColor || '#1A1A1C',
      brandName:      profile?.brandName      || 'NativPost',
      logoUrl:        profile?.logoUrl        || undefined,
      // Use Unsplash when no images provided — auto-fetches studio photos
      photoTier: requestBody.photoTier || (imageUrls.length === 0 ? 'unsplash' : 'none'),
      industry:  profile?.industry || undefined,
    };

    console.log('[Video] Calling renderer at:', `${VIDEO_RENDERER_URL}/render`);
    console.log('[Video] Payload images count:', imageUrls.length);
    console.log('[Video] Logo URL set:', !!payload.logoUrl);

    // 180s timeout — generous for large slideshows
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180_000);

    let renderRes: Response;
    try {
      renderRes = await fetch(`${VIDEO_RENDERER_URL}/render`, {
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
      console.error('[Video] Fetch error:', fetchErr);
      if (isAbort) {
        return NextResponse.json(
          { error: 'Video renderer timed out after 3 minutes. Try again.' },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { error: `Cannot reach video renderer: ${String(fetchErr)}` },
        { status: 502 },
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!renderRes.ok) {
      const errText = await renderRes.text();
      console.error('[Video] Renderer returned error:', renderRes.status, errText);
      return NextResponse.json(
        { error: 'Video generation failed.', detail: errText, rendererStatus: renderRes.status },
        { status: 502 },
      );
    }

    const renderData = await renderRes.json() as {
      vertical?: string;
      square?: string;
      durationSeconds?: number;
      imageCount?: number;
      renderSeconds?: number;
      photoTier?: string;
      photoCount?: number;
      credits?: Array<{ name: string; link: string }>;
    };

    console.log('[Video] Render success:', renderData.vertical, renderData.square);
    console.log(`[Video] Render time: ${renderData.renderSeconds}s | Images: ${renderData.imageCount}`);

    const vertical = renderData.vertical;
    const square = renderData.square;

    if (!vertical || !square) {
      console.error('[Video] Renderer returned undefined URLs:', renderData);
      return NextResponse.json(
        { error: 'Video generation failed — renderer returned empty URLs. Please try again.' },
        { status: 502 },
      );
    }

    const videoUrls = [vertical, square];

    await db
      .update(contentItemSchema)
      .set({
        graphicUrls: videoUrls,
        platformSpecific: {
          ...(item.platformSpecific as object),
          sourceImages: imageUrls,
          videoDurationSeconds: renderData.durationSeconds ?? 0,
          photoTier: renderData.photoTier ?? 'none',
          unsplashCredits: renderData.credits ?? [],
          // Mark as generated so hasGeneratedVideo stays true even with empty sourceImages
          videoGenerated: true,
        },
        updatedAt: new Date(),
      })
      .where(eq(contentItemSchema.id, id));

    return NextResponse.json({
      success: true,
      vertical,
      square,
      durationSeconds: renderData.durationSeconds ?? 0,
      imageCount: renderData.imageCount ?? imageUrls.length,
      renderSeconds: renderData.renderSeconds ?? 0,
      photoTier: renderData.photoTier ?? 'none',
      credits: renderData.credits ?? [],
    });
  } catch (err) {
    console.error('[Video] generate-video failed:', err);
    return NextResponse.json(
      { error: `Video generation failed: ${String(err)}` },
      { status: 500 },
    );
  }
}