/**
 * POST /api/content/[id]/generate-thumbnail
 *
 * Generates a YouTube thumbnail for any content type.
 * This is separate from generate-image which is restricted to single_image posts.
 *
 * The thumbnail is generated via the image engine (announcement-card template,
 * 16:9 aspect — YouTube standard), uploaded to Uploadcare, then saved to
 * platformSpecific.youtube.thumbnailUrl on the content item.
 *
 * Body (all optional):
 *   style    — "dark" | "light" | "brand" (default: "brand")
 *   headline — override headline text on the thumbnail
 *   eyebrow  — small label above the headline
 */

import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { brandProfileSchema, contentItemSchema } from '@/models/Schema';

const IMAGE_ENGINE_URL = process.env.NATIVPOST_IMAGE_URL || 'http://localhost:4000';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /* no body is fine */ }

  try {
    // Load content item — no content type restriction here
    const [item] = await db
      .select()
      .from(contentItemSchema)
      .where(and(eq(contentItemSchema.id, id), eq(contentItemSchema.orgId, orgId!)))
      .limit(1);

    if (!item) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
    }

    // Load brand profile
    const [profile] = await db
      .select({
        brandName:      brandProfileSchema.brandName,
        primaryColor:   brandProfileSchema.primaryColor,
        secondaryColor: brandProfileSchema.secondaryColor,
        logoUrl:        brandProfileSchema.logoUrl,
      })
      .from(brandProfileSchema)
      .where(eq(brandProfileSchema.orgId, orgId!))
      .limit(1);

    const caption = item.caption || '';
    const topic = item.topic || '';

    // Build a clean headline for the thumbnail
    // Prefer the YouTube title if already set, then first line of caption, then topic
    const existingYoutubeTitle = (item.platformSpecific as Record<string, Record<string, string>>)?.youtube?.title;
    const autoHeadline = existingYoutubeTitle
      || (body.headline as string)
      || topic
      || caption.split('\n')[0]?.slice(0, 80)
      || caption.slice(0, 80);

    const style = (body.style as string) || 'brand';
    const eyebrow = (body.eyebrow as string) || undefined;

    // Call image engine — announcement-card as a thumbnail
    // The image engine only supports 'square' (1:1) and 'vertical' (9:16).
    // We use square — it crops cleanly to YouTube's 16:9 thumbnail requirement
    // and renders at full quality. The user can also upload their own 16:9 image.
    const payload = {
      template: 'announcement-card',
      style,
      formats: ['square'],
      brandName:      profile?.brandName      || 'Brand',
      brandPrimary:   profile?.primaryColor   || '#864FFE',
      brandSecondary: profile?.secondaryColor || '#0D0D0D',
      ...(profile?.logoUrl ? { logoUrl: profile.logoUrl } : {}),
      headline: autoHeadline,
      ...(eyebrow ? { eyebrow } : {}),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    let engineRes: Response;
    try {
      engineRes = await fetch(`${IMAGE_ENGINE_URL}/render/image`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ENGINE_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (fetchErr) {
      clearTimeout(timeout);
      return NextResponse.json(
        { error: 'Image engine unavailable. Please try again.' },
        { status: 503 },
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!engineRes.ok) {
      const detail = await engineRes.text();
      return NextResponse.json({ error: 'Thumbnail generation failed.', detail }, { status: 502 });
    }

    const engineData = await engineRes.json() as { square?: string; vertical?: string };

    // We requested 'square' — use it as the thumbnail
    const thumbnailUrl = engineData.square || engineData.vertical;

    if (!thumbnailUrl) {
      return NextResponse.json({ error: 'Image engine returned no URL.' }, { status: 502 });
    }

    // Save the thumbnail URL to platformSpecific.youtube.thumbnailUrl
    const existingPs = (item.platformSpecific as Record<string, unknown>) || {};
    const existingYt = (existingPs.youtube as Record<string, string>) || {};

    await db
      .update(contentItemSchema)
      .set({
        platformSpecific: {
          ...existingPs,
          youtube: {
            ...existingYt,
            thumbnailUrl,
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(contentItemSchema.id, id));

    return NextResponse.json({
      success: true,
      thumbnailUrl,
      headlineUsed: autoHeadline,
    });
  } catch (err) {
    console.error('[generate-thumbnail] failed:', err);
    return NextResponse.json({ error: `Thumbnail generation failed: ${String(err)}` }, { status: 500 });
  }
}