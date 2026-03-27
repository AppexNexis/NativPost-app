import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { db } from '@/libs/DB';
import { brandProfileSchema, contentItemSchema } from '@/models/Schema';

const VIDEO_RENDERER_URL = process.env.NATIVPOST_VIDEO_URL || 'http://localhost:3001';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const { id } = await params;

  // Debug: log config on every call

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
    if (imageUrls.length === 0) {
      return NextResponse.json(
        { error: 'Add at least one image before generating a video' },
        { status: 400 },
      );
    }

    const [profile] = await db
      .select({
        brandName: brandProfileSchema.brandName,
        primaryColor: brandProfileSchema.primaryColor,
        secondaryColor: brandProfileSchema.secondaryColor,
      })
      .from(brandProfileSchema)
      .where(eq(brandProfileSchema.orgId, orgId!))
      .limit(1);

    const payload = {
      images: imageUrls,
      caption: item.caption,
      brandPrimary: profile?.primaryColor || '#864FFE',
      brandSecondary: profile?.secondaryColor || '#1A1A1C',
      brandName: profile?.brandName || 'NativPost',
    };

    console.log('[Video] Calling renderer at:', `${VIDEO_RENDERER_URL}/render`);

    console.log('[Video] Payload images count:', imageUrls.length);

    // 180s timeout — free tier renders slowly
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
          { error: 'Video renderer timed out after 3 minutes. The free tier may be under load — try again.' },
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
      // Return the actual error from the renderer so we can debug
      return NextResponse.json(
        {
          error: 'Video generation failed.',
          detail: errText,
          rendererStatus: renderRes.status,
        },
        { status: 502 },
      );
    }

    const renderData = await renderRes.json() as {
      vertical: string;
      square: string;
      durationSeconds: number;
    };

    console.log('[Video] Render success:', renderData.vertical, renderData.square);

    const videoUrls = [renderData.vertical, renderData.square];

    await db
      .update(contentItemSchema)
      .set({
        graphicUrls: videoUrls,
        platformSpecific: {
          ...(item.platformSpecific as object),
          sourceImages: imageUrls,
          videoDurationSeconds: renderData.durationSeconds,
        },
        updatedAt: new Date(),
      })
      .where(eq(contentItemSchema.id, id));

    return NextResponse.json({
      success: true,
      vertical: renderData.vertical,
      square: renderData.square,
      durationSeconds: renderData.durationSeconds,
    });
  } catch (err) {
    console.error('[Video] generate-video failed:', err);
    return NextResponse.json({ error: `Video generation failed: ${String(err)}` }, { status: 500 });
  }
}
