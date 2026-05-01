/**
 * POST /api/content/[id]/generate-ugc-ad
 *
 * Calls the video renderer's /render/ugc-ad endpoint.
 *
 * The UGC ad requires four text sections pulled from the content item:
 *   hook      — item.platformSpecific.ugc_hook     (set during content creation)
 *   problem   — item.platformSpecific.ugc_problem
 *   solution  — item.platformSpecific.ugc_solution
 *   cta       — item.platformSpecific.ugc_cta
 *
 * Falls back to splitting the caption into sections if the ugc_* fields
 * aren't present (for backwards compatibility).
 *
 * Images (optional, 0–4): item.graphicUrls used as per-section backgrounds.
 * If fewer than 4 images are provided, the renderer uses brand color cards
 * as fallback backgrounds for missing sections.
 *
 * Output: 9:16 vertical only (UGC ads are always vertical).
 * Stored in item.graphicUrls[0] as the vertical MP4 URL.
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

/**
 * Split a caption into 4 roughly equal sections for ugc fallback.
 * Not as good as explicit ugc_* fields but workable.
 */
function splitCaptionIntoSections(caption: string): {
  hook: string;
  problem: string;
  solution: string;
  cta: string;
} {
  const sentences = caption
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);

  const total = sentences.length;
  const q = Math.ceil(total / 4);

  return {
    hook: sentences.slice(0, q).join(' ') || caption.slice(0, 80),
    problem: sentences.slice(q, q * 2).join(' ') || 'We noticed a real problem.',
    solution: sentences.slice(q * 2, q * 3).join(' ') || 'Here is our solution.',
    cta: sentences.slice(q * 3).join(' ') || 'Learn more.',
  };
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const { id } = await params;

  try {
    const [item] = await db
      .select()
      .from(contentItemSchema)
      .where(eq(contentItemSchema.id, id))
      .limit(1);

    if (!item || item.orgId !== orgId) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
    }

    if (item.contentType !== 'ugc_ad') {
      return NextResponse.json(
        { error: 'UGC ad generation only available for ugc_ad content type' },
        { status: 400 },
      );
    }

    const ps = (item.platformSpecific as Record<string, string>) || {};

    // Use explicit ugc_* fields if present, otherwise split caption
    let hook = ps.ugc_hook;
    let problem = ps.ugc_problem;
    let solution = ps.ugc_solution;
    let cta = ps.ugc_cta;

    if (!hook || !problem || !solution || !cta) {
      const sections = splitCaptionIntoSections(item.caption);
      hook = hook || sections.hook;
      problem = problem || sections.problem;
      solution = solution || sections.solution;
      cta = cta || sections.cta;
    }

    const imageUrls = (item.graphicUrls as string[]) || [];

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
      hook,
      problem,
      solution,
      cta,
      images: imageUrls.slice(0, 4),
      brandPrimary: profile?.primaryColor || '#864FFE',
      brandSecondary: profile?.secondaryColor || '#1A1A1C',
      brandName: profile?.brandName || 'NativPost',
      ...(profile?.logoUrl ? { logoUrl: profile.logoUrl } : {}),
      // Auto-fetch per-section photos when none pre-provided
      photoTier: imageUrls.length < 4 ? 'unsplash' : 'none',
      industry: (profile as any)?.industry || undefined,
    };

    console.log('[UGCAd] Calling renderer for item:', id);
    console.log('[UGCAd] Sections:', { hook: hook.slice(0, 40), problem: problem.slice(0, 40) });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000);

    let renderRes: Response;
    try {
      renderRes = await fetch(`${VIDEO_RENDERER_URL}/render/ugc-ad`, {
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
      console.error('[UGCAd] Renderer error:', renderRes.status, errText);
      return NextResponse.json(
        { error: 'UGC ad generation failed.', detail: errText },
        { status: 502 },
      );
    }

    const renderData = await renderRes.json() as {
      vertical?: string;
      durationSeconds?: number;
      photoTier?: string;
      credits?: Array<{ name: string; link: string }>;
    };

    const vertical = renderData.vertical;
    if (!vertical) {
      return NextResponse.json(
        { error: 'Renderer returned empty video URL. Please try again.' },
        { status: 502 },
      );
    }

    // Build Unsplash attribution for caption — required by Unsplash API guidelines
    const unsplashCredits = renderData.credits ?? [];
    const isUnsplash = (renderData.photoTier ?? 'none') === 'unsplash';
    let captionWithAttribution = item.caption;
    if (isUnsplash && unsplashCredits.length > 0) {
      const names = (unsplashCredits as Array<{ name: string; link: string }>)
        .slice(0, 3)
        .map(c => c.name)
        .join(', ');
      captionWithAttribution = `${item.caption}\n\n📷 Photo by ${names} on Unsplash (unsplash.com)`;
    }

    await db
      .update(contentItemSchema)
      .set({
        graphicUrls: [vertical],
        caption: captionWithAttribution,
        platformSpecific: {
          ...(item.platformSpecific as object),
          videoDurationSeconds: renderData.durationSeconds ?? 10,
          ugcHook: hook,
          ugcProblem: problem,
          ugcSolution: solution,
          ugcCta: cta,
          photoTier: renderData.photoTier ?? 'none',
          unsplashCredits: renderData.credits ?? [],
          captionOriginal: item.caption,
        },
        updatedAt: new Date(),
      })
      .where(eq(contentItemSchema.id, id));

    return NextResponse.json({
      success: true,
      vertical,
      durationSeconds: renderData.durationSeconds ?? 10,
      photoTier: renderData.photoTier ?? 'none',
      credits: renderData.credits ?? [],
    });
  } catch (err) {
    console.error('[UGCAd] generate-ugc-ad failed:', err);
    return NextResponse.json(
      { error: `UGC ad generation failed: ${String(err)}` },
      { status: 500 },
    );
  }
}
