/**
 * POST /api/content/[id]/generate-data-story
 *
 * Calls the video renderer's /render/data-story endpoint.
 *
 * Stats are stored in item.platformSpecific.data_story_stats as an array:
 *   [{ label: "Happy customers", value: 10000, unit: "", prefix: "" }]
 *
 * The headline comes from item.platformSpecific.data_story_headline.
 * Falls back to item.topic if not set.
 *
 * Renders vertical (9:16), square (1:1), and landscape (16:9) by default.
 * All three URLs are stored in item.graphicUrls[].
 */

import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { brandProfileSchema, contentItemSchema } from '@/models/Schema';

const VIDEO_RENDERER_URL = process.env.NATIVPOST_VIDEO_URL || 'http://localhost:3001';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

type RouteParams = { params: Promise<{ id: string }> };

type StatItem = {
  label: string;
  value: number;
  unit?: string;
  prefix?: string;
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const { id } = await params;

  // Allow formats to be overridden by caller
  const body = await request.json().catch(() => ({})) as {
    formats?: string[];
  };
  const formats = body.formats || ['vertical', 'square', 'landscape'];

  try {
    const [item] = await db
      .select()
      .from(contentItemSchema)
      .where(eq(contentItemSchema.id, id))
      .limit(1);

    if (!item || item.orgId !== orgId) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
    }

    if (item.contentType !== 'data_story') {
      return NextResponse.json(
        { error: 'Data story generation only available for data_story content type' },
        { status: 400 },
      );
    }

    const ps = (item.platformSpecific as Record<string, unknown>) || {};
    const stats = ps.data_story_stats as StatItem[] | undefined;

    if (!stats || stats.length === 0) {
      return NextResponse.json(
        { error: 'No stats found. Add at least one stat in the data story fields before generating.' },
        { status: 400 },
      );
    }

    const headline = (ps.data_story_headline as string) || item.topic || undefined;

    const [profile] = await db
      .select({
        brandName: brandProfileSchema.brandName,
        primaryColor: brandProfileSchema.primaryColor,
        secondaryColor: brandProfileSchema.secondaryColor,
        logoUrl: brandProfileSchema.logoUrl,
      })
      .from(brandProfileSchema)
      .where(eq(brandProfileSchema.orgId, orgId!))
      .limit(1);

    const payload = {
      stats,
      headline,
      caption: item.caption,
      brandPrimary: profile?.primaryColor || '#864FFE',
      brandSecondary: profile?.secondaryColor || '#1A1A1C',
      brandName: profile?.brandName || 'NativPost',
      formats,
      ...(profile?.logoUrl ? { logoUrl: profile.logoUrl } : {}),
    };

    console.log('[DataStory] Calling renderer for item:', id);
    console.log('[DataStory] Stats count:', stats.length, '| Formats:', formats);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180_000);

    let renderRes: Response;
    try {
      renderRes = await fetch(`${VIDEO_RENDERER_URL}/render/data-story`, {
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
          { error: 'Video renderer timed out. Please try again.' },
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
      console.error('[DataStory] Renderer error:', renderRes.status, errText);
      return NextResponse.json(
        { error: 'Data story generation failed.', detail: errText },
        { status: 502 },
      );
    }

    const renderData = await renderRes.json() as {
      vertical?: string;
      square?: string;
      landscape?: string;
      durationSeconds?: number;
      statCount?: number;
    };

    // Collect all returned video URLs
    const videoUrls = [
      renderData.vertical,
      renderData.square,
      renderData.landscape,
    ].filter((u): u is string => typeof u === 'string' && u.length > 0);

    if (videoUrls.length === 0) {
      return NextResponse.json(
        { error: 'Renderer returned no video URLs. Please try again.' },
        { status: 502 },
      );
    }

    await db
      .update(contentItemSchema)
      .set({
        graphicUrls: videoUrls,
        platformSpecific: {
          ...(item.platformSpecific as object),
          videoDurationSeconds: renderData.durationSeconds ?? 0,
          dataStoryStatCount: renderData.statCount ?? stats.length,
          dataStoryFormats: formats,
        },
        updatedAt: new Date(),
      })
      .where(eq(contentItemSchema.id, id));

    return NextResponse.json({
      success: true,
      vertical: renderData.vertical,
      square: renderData.square,
      landscape: renderData.landscape,
      durationSeconds: renderData.durationSeconds ?? 0,
      statCount: renderData.statCount ?? stats.length,
    });
  } catch (err) {
    console.error('[DataStory] generate-data-story failed:', err);
    return NextResponse.json(
      { error: `Data story generation failed: ${String(err)}` },
      { status: 500 },
    );
  }
}
