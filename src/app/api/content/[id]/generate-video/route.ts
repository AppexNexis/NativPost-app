import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { db } from '@/libs/DB';
import { brandProfileSchema, contentItemSchema } from '@/models/Schema';

const VIDEO_RENDERER_URL = process.env.NATIVPOST_VIDEO_URL || 'http://localhost:3001';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

// -----------------------------------------------------------
// POST /api/content/[id]/generate-video
//
// Calls the Remotion renderer to produce two MP4 versions:
//   - 9:16 vertical  (Instagram Reels, TikTok)
//   - 1:1 square     (LinkedIn, Facebook)
//
// Stores both URLs in graphicUrls:
//   graphicUrls[0] = vertical (9:16)
//   graphicUrls[1] = square   (1:1)
// -----------------------------------------------------------

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const { id } = await params;

  try {
    // 1. Fetch content item
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

    // 2. Fetch brand profile for colors + name
    const [profile] = await db
      .select({
        brandName: brandProfileSchema.brandName,
        primaryColor: brandProfileSchema.primaryColor,
        secondaryColor: brandProfileSchema.secondaryColor,
      })
      .from(brandProfileSchema)
      .where(eq(brandProfileSchema.orgId, orgId!))
      .limit(1);

    // 3. Call Remotion renderer
    // 120s timeout — rendering two 15s videos takes ~30-60s
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000);

    let renderRes: Response;
    try {
      renderRes = await fetch(`${VIDEO_RENDERER_URL}/render`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ENGINE_API_KEY}`,
        },
        body: JSON.stringify({
          images: imageUrls,
          caption: item.caption,
          brandPrimary: profile?.primaryColor || '#864FFE',
          brandSecondary: profile?.secondaryColor || '#1A1A1C',
          brandName: profile?.brandName || 'NativPost',
        }),
      });
    } catch (fetchErr: unknown) {
      clearTimeout(timeoutId);
      const isAbort = fetchErr instanceof Error && fetchErr.name === 'AbortError';
      if (isAbort) {
        return NextResponse.json(
          { error: 'Video renderer timed out. Try again in a moment.' },
          { status: 503 },
        );
      }
      throw fetchErr;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!renderRes.ok) {
      const err = await renderRes.text();
      console.error('[Video] Renderer error:', err);
      return NextResponse.json(
        { error: 'Video generation failed. Please try again.' },
        { status: 502 },
      );
    }

    const renderData = await renderRes.json() as {
      vertical: string;
      square: string;
      durationSeconds: number;
    };

    // 4. Store video URLs in graphicUrls
    // Convention: [0] = vertical 9:16, [1] = square 1:1
    // Images that were used as source are stored in platformSpecific.sourceImages
    const videoUrls = [renderData.vertical, renderData.square];

    await db
      .update(contentItemSchema)
      .set({
        graphicUrls: videoUrls,
        // Store source images in platformSpecific for reference
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
    return NextResponse.json({ error: 'Video generation failed' }, { status: 500 });
  }
}
