/**
 * POST /api/content/[id]/edit
 *
 * Calls the engine's /api/edit endpoint with the existing caption,
 * brand profile, and a user-supplied instruction.
 *
 * Does NOT save the result — the client decides whether to accept.
 * Saving is handled by the existing PATCH /api/content/[id] route.
 */

import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { brandProfileSchema, contentItemSchema } from '@/models/Schema';

type RouteParams = { params: Promise<{ id: string }> };

const ENGINE_URL = process.env.NATIVPOST_ENGINE_URL || 'http://localhost:8000';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

  let body: { instruction?: string; platform?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.instruction || body.instruction.trim().length < 5) {
    return NextResponse.json(
      { error: 'instruction must be at least 5 characters' },
      { status: 400 },
    );
  }

  const db = await getDb();

  try {
    // Fetch content item
    const [item] = await db
      .select()
      .from(contentItemSchema)
      .where(and(eq(contentItemSchema.id, id), eq(contentItemSchema.orgId, orgId!)))
      .limit(1);

    if (!item) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
    }

    // Fetch brand profile
    const [profile] = await db
      .select()
      .from(brandProfileSchema)
      .where(eq(brandProfileSchema.orgId, orgId!))
      .limit(1);

    if (!profile) {
      return NextResponse.json({ error: 'Brand profile not found' }, { status: 404 });
    }

    // Determine platform — use first target platform or fallback to instagram
    const platform = body.platform
      || (item.targetPlatforms as string[])?.[0]
      || 'instagram';

    // Build brand profile payload for the engine
    const brandPayload = {
      brand_name: profile.brandName,
      industry: profile.industry,
      target_audience: profile.targetAudience,
      company_description: profile.companyDescription,
      tone_formality: profile.toneFormality ?? 5,
      tone_humor: profile.toneHumor ?? 5,
      tone_energy: profile.toneEnergy ?? 5,
      vocabulary: (profile.vocabulary as string[]) ?? [],
      forbidden_words: (profile.forbiddenWords as string[]) ?? [],
      communication_style: profile.communicationStyle,
      linkedin_voice: profile.linkedinVoice,
      instagram_voice: profile.instagramVoice,
      twitter_voice: profile.twitterVoice,
      facebook_voice: profile.facebookVoice,
      tiktok_voice: profile.tiktokVoice,
      mission: profile.mission,
      values: (profile.values as string[]) ?? [],
      key_differentiators: profile.keyDifferentiators,
      growth_stage: profile.growthStage ?? 'early',
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    let engineRes: Response;
    try {
      engineRes = await fetch(`${ENGINE_URL}/api/edit`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ENGINE_API_KEY}`,
        },
        body: JSON.stringify({
          caption: item.caption,
          instruction: body.instruction.trim(),
          brand_profile: brandPayload,
          platform,
        }),
      });
    } catch (fetchErr) {
      clearTimeout(timeout);
      const isAbort = fetchErr instanceof Error && fetchErr.name === 'AbortError';
      return NextResponse.json(
        { error: isAbort ? 'Edit request timed out. Please try again.' : 'Content engine unavailable.' },
        { status: 503 },
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!engineRes.ok) {
      const detail = await engineRes.text();
      return NextResponse.json(
        { error: 'Edit failed.', detail },
        { status: 502 },
      );
    }

    const result = await engineRes.json() as {
      revised_caption: string;
      anti_slop_score: number;
      quality_flags: string[];
      instruction_applied: string;
    };

    return NextResponse.json({
      revisedCaption: result.revised_caption,
      antiSlopScore: result.anti_slop_score,
      qualityFlags: result.quality_flags,
      instructionApplied: result.instruction_applied,
    });
  } catch (err) {
    console.error('[content/edit] failed:', err);
    return NextResponse.json({ error: 'Edit request failed.' }, { status: 500 });
  }
}
