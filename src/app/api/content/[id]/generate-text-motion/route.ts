/**
 * POST /api/content/[id]/generate-text-motion
 *
 * Generates a Text Motion Card video from a content item.
 * Calls /render/text-motion on the video renderer.
 *
 * The text motion card is a pure branded animation — no photos needed.
 * Perfect for:
 *   - Thought leadership quotes
 *   - Stats / milestones ("We hit 10K customers")
 *   - Tips / industry insights
 *   - LinkedIn text posts turned into video
 *
 * The headline is auto-extracted from the caption using the same
 * logic as the image engine (punchiest sentence, max ~52 chars).
 * Subtext is the supporting line.
 *
 * Request body (all optional):
 *   style    — "dark" | "light" | "brand"  (default: "dark")
 *   formats  — ["vertical","square","landscape"]  (default: ["vertical","square"])
 *   headline — override the auto-extracted headline
 *   subtext  — override the auto-extracted subtext
 *   eyebrow  — small label above headline e.g. "HOT TAKE"
 *   cta      — outro call-to-action line e.g. "Follow for more"
 */

import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { applyRemixEdits, getRemixEditsFromGenerationParams } from '@/lib/remix-edits';
import { getDb } from '@/libs/DB';
import { brandProfileSchema, contentItemSchema } from '@/models/Schema';

const VIDEO_RENDERER_URL = process.env.NATIVPOST_VIDEO_URL || 'http://localhost:3001';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

type RouteParams = { params: Promise<{ id: string }> };

// ── Text extraction (mirrors image engine logic) ───────────────────────────────

function extractHeadline(caption: string): string {
  const clean = caption.replace(/#\w+/g, '').trim();
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length >= 12 && s.length <= 200);

  if (!sentences.length) return smartTrim(clean, 52);

  const scored = sentences.map(s => {
    let score = 0;
    const len = s.length;
    if (len <= 52) score += 8;
    else if (len <= 70) score += 4;
    else if (len <= 100) score += 2;
    else score -= 1;
    if (s.includes('?')) score += 4;
    if (/\d/.test(s)) score += 3;
    if (/^(Here's|This|Why|How|What|The|Stop|Never|Always|Most|Your|Don't|Want)/.test(s)) score += 2;
    if (/^(Here is why|Here are|In today)/.test(s)) score -= 5;
    if (s.startsWith('#')) score -= 10;
    return { s, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return smartTrim(scored[0]!.s, 60); // slightly longer cap for text-motion (no font size constraint)
}

function extractSubtext(caption: string, headline: string): string | undefined {
  const clean = caption.replace(/#\w+/g, '').trim();
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length >= 20 && s.length <= 160);

  if (sentences.length < 2) return undefined;

  const headlineNorm = headline.toLowerCase().replace(/[^a-z0-9\s]/g, '').substring(0, 40);
  const weakPatterns = [
    /^click (the link|below|here)/i, /^link in bio/i,
    /^follow (us|me) (for|to)/i, /^drop a comment/i,
    /^save this post/i, /^share this (post|with)/i,
    /^tag (a friend|someone)/i, /^swipe (left|right|up)/i,
  ];

  const candidate = sentences.find(s => {
    if (s.startsWith('#')) return false;
    if (s.length < 20) return false;
    if (s.toLowerCase().replace(/[^a-z0-9\s]/g, '').startsWith(headlineNorm.substring(0, 25))) return false;
    if (s.toLowerCase().includes(headlineNorm.substring(0, 30))) return false;
    if (weakPatterns.some(p => p.test(s.trim()))) return false;
    return true;
  });

  if (!candidate) return undefined;
  return candidate.length <= 100 ? candidate : candidate.substring(0, 97).trim() + '…';
}

function smartTrim(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  const minBreak = Math.floor(maxChars * 0.55);
  const searchWindow = s.substring(0, maxChars + 12);
  const breakWords = [' on ', ' of ', ' for ', ' in ', ' about ', ' with ', ' and ', ' but ', ' that ', ' to ', ' by '];
  let bestBreak = -1;
  for (const word of breakWords) {
    let pos = minBreak;
    while (pos < maxChars + 8) {
      const idx = searchWindow.indexOf(word, pos);
      if (idx === -1 || idx > maxChars + 8) break;
      if (idx >= minBreak) bestBreak = Math.max(bestBreak, idx);
      pos = idx + 1;
    }
  }
  if (bestBreak >= minBreak) return s.substring(0, bestBreak).replace(/[,;:]$/, '').trim() + '…';
  const lastSpace = s.substring(0, maxChars).lastIndexOf(' ');
  if (lastSpace > minBreak) return s.substring(0, lastSpace).replace(/[,;:]$/, '').trim() + '…';
  return s.substring(0, maxChars).trim() + '…';
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

  const body = await request.json().catch(() => ({})) as {
    style?: 'dark' | 'light' | 'brand';
    formats?: string[];
    headline?: string;
    subtext?: string;
    eyebrow?: string;
    cta?: string;
  };

  const style = body.style || 'dark';
  const formats = body.formats || ['vertical', 'square'];

  try {
    const [item] = await db
      .select()
      .from(contentItemSchema)
      .where(eq(contentItemSchema.id, id))
      .limit(1);

    if (!item || item.orgId !== orgId) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
    }

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

    // Extract headline + subtext from caption (or use overrides)
    const headline = body.headline?.trim() || extractHeadline(item.caption);
    const subtext  = body.subtext?.trim()  || extractSubtext(item.caption, headline);
    const eyebrow  = body.eyebrow?.trim()  || undefined;
    const cta      = body.cta?.trim()      || undefined;

    const remixEdits = getRemixEditsFromGenerationParams(item.generationParams);

    const basePayload = {
      headline,
      subtext,
      eyebrow,
      cta,
      brandPrimary:   profile?.primaryColor   || '#864FFE',
      brandSecondary: profile?.secondaryColor || '#1A1A1C',
      brandName:      profile?.brandName      || 'NativPost',
      ...(profile?.logoUrl ? { logoUrl: profile.logoUrl } : {}),
      style,
      formats,
    };

    const payload = applyRemixEdits(basePayload, remixEdits, 'text_motion');

    console.log('[TextMotion] Headline:', headline);
    console.log('[TextMotion] Style:', style, '| Formats:', formats);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000);

    let renderRes: Response;
    try {
      renderRes = await fetch(`${VIDEO_RENDERER_URL}/render/text-motion`, {
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
        return NextResponse.json({ error: 'Video renderer timed out. Please try again.' }, { status: 503 });
      }
      return NextResponse.json({ error: `Cannot reach video renderer: ${String(fetchErr)}` }, { status: 502 });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!renderRes.ok) {
      const errText = await renderRes.text();
      console.error('[TextMotion] Renderer error:', renderRes.status, errText);
      return NextResponse.json({ error: 'Text motion generation failed.', detail: errText }, { status: 502 });
    }

    const renderData = await renderRes.json() as {
      vertical?: string;
      verticalPublicId?: string;
      square?: string;
      squarePublicId?: string;
      landscape?: string;
      landscapePublicId?: string;
      durationSeconds?: number;
    };

    const videoUrls = [renderData.vertical, renderData.square, renderData.landscape]
      .filter((u): u is string => typeof u === 'string' && u.length > 0);

    const videoPublicIds = [
      renderData.verticalPublicId,
      renderData.squarePublicId,
      renderData.landscapePublicId,
    ].filter((id): id is string => typeof id === 'string' && id.length > 0);

    if (videoUrls.length === 0) {
      return NextResponse.json({ error: 'Renderer returned no video URLs. Please try again.' }, { status: 502 });
    }

    // Save to content item — store as graphicUrls + platformSpecific metadata
    await db
      .update(contentItemSchema)
      .set({
        graphicUrls: videoUrls,
        platformSpecific: {
          ...(item.platformSpecific as object),
          videoDurationSeconds: renderData.durationSeconds ?? 0,
          textMotionStyle: style,
          textMotionHeadline: headline,
          videoGenerated: true,
          cloudinaryPublicIds: videoPublicIds,
        },
        updatedAt: new Date(),
      })
      .where(eq(contentItemSchema.id, id));

    return NextResponse.json({
      success: true,
      vertical:  renderData.vertical,
      verticalPublicId: renderData.verticalPublicId,
      square:    renderData.square,
      squarePublicId: renderData.squarePublicId,
      landscape: renderData.landscape,
      landscapePublicId: renderData.landscapePublicId,
      headlineUsed: headline,
      subtextUsed:  subtext,
      durationSeconds: renderData.durationSeconds ?? 0,
    });
  } catch (err) {
    console.error('[TextMotion] generate-text-motion failed:', err);
    return NextResponse.json({ error: `Text motion generation failed: ${String(err)}` }, { status: 500 });
  }
}
