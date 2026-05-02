/**
 * GET  /api/calendar/plan?month=YYYY-MM
 *   Returns the current plan for the org/month, or null if none exists.
 *   Also returns billing state so the client knows regeneration limits.
 *
 * POST /api/calendar/plan
 *   Generates a new plan (or regenerates an existing one) for the org/month.
 *   Body: { month: "YYYY-MM" }
 *   Calls the engine, persists the result, and returns the full plan.
 *
 * PATCH /api/calendar/plan
 *   Dismisses or restores a single topic within the plan.
 *   Body: { month: "YYYY-MM", position: number, dismissed: boolean }
 *   Updates the topics JSONB array in-place — no row delete.
 */

import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getOrgBillingState } from '@/lib/billing';
import { getAllowedContentTypes, canRegeneratePlan } from '@/lib/plans';
import { getDb } from '@/libs/DB';
import {
  brandProfileSchema,
  contentPlanSchema,
  socialAccountSchema,
} from '@/models/Schema';

const ENGINE_URL = process.env.NATIVPOST_ENGINE_URL || 'http://localhost:8000';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

// -----------------------------------------------------------
// GET /api/calendar/plan
// -----------------------------------------------------------
export async function GET(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month') || _currentMonth();

  if (!_isValidMonth(month)) {
    return NextResponse.json({ error: 'Invalid month format. Use YYYY-MM.' }, { status: 400 });
  }

  try {
    const billing = await getOrgBillingState(orgId!);
    if (!billing) {
      return NextResponse.json({ error: 'Organisation not found.' }, { status: 404 });
    }

    const { monthlyPlanTopics, monthlyPlanRegenerations } = billing.features;

    // Trial users and inactive orgs: return locked state
    if (monthlyPlanTopics === 0 || !billing.isActive) {
      return NextResponse.json({
        plan: null,
        locked: true,
        lockedReason: billing.isTrialing
          ? 'Subscribe to unlock your Monthly Plan.'
          : 'Your subscription has expired.',
        month,
      });
    }

    const [plan] = await db
      .select()
      .from(contentPlanSchema)
      .where(
        and(
          eq(contentPlanSchema.orgId, orgId!),
          eq(contentPlanSchema.month, month),
        ),
      )
      .limit(1);

    const regenerationsAllowed = monthlyPlanRegenerations === -1
      ? null // unlimited
      : monthlyPlanRegenerations;
    const regenerationsUsed = plan?.regenerationCount ?? 0;
    const canRegenerate = canRegeneratePlan(billing.features, regenerationsUsed);

    return NextResponse.json({
      plan: plan ?? null,
      locked: false,
      month,
      meta: {
        topicsAllowed: monthlyPlanTopics,
        regenerationsAllowed,
        regenerationsUsed,
        canRegenerate,
      },
    });
  } catch (err) {
    console.error('[Plan] GET failed:', err);
    return NextResponse.json({ error: 'Failed to fetch plan.' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// POST /api/calendar/plan — Generate or regenerate
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  let body: { month?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const month = body.month || _currentMonth();
  if (!_isValidMonth(month)) {
    return NextResponse.json({ error: 'Invalid month format. Use YYYY-MM.' }, { status: 400 });
  }

  try {
    // --- Billing & access checks ---
    const billing = await getOrgBillingState(orgId!);
    if (!billing || !billing.isActive) {
      return NextResponse.json(
        { error: 'An active subscription is required to use Monthly Plan.' },
        { status: 403 },
      );
    }

    const { monthlyPlanTopics } = billing.features;
    if (monthlyPlanTopics === 0) {
      return NextResponse.json(
        { error: 'Monthly Plan is not available on your current plan. Please upgrade.' },
        { status: 403 },
      );
    }

    // --- Regeneration limit check ---
    const [existingPlan] = await db
      .select()
      .from(contentPlanSchema)
      .where(
        and(
          eq(contentPlanSchema.orgId, orgId!),
          eq(contentPlanSchema.month, month),
        ),
      )
      .limit(1);

    const currentRegenCount = existingPlan?.regenerationCount ?? 0;
    const isRegeneration = !!existingPlan;

    if (isRegeneration && !canRegeneratePlan(billing.features, currentRegenCount)) {
      const limit = billing.features.monthlyPlanRegenerations;
      return NextResponse.json(
        {
          error: `You've used all ${limit} regeneration${limit === 1 ? '' : 's'} for ${month}. Upgrade your plan for more.`,
          upgradeRequired: true,
        },
        { status: 403 },
      );
    }

    // --- Brand profile ---
    const [profile] = await db
      .select()
      .from(brandProfileSchema)
      .where(eq(brandProfileSchema.orgId, orgId!))
      .limit(1);

    if (!profile) {
      return NextResponse.json(
        { error: 'Complete your Brand Profile before generating a Monthly Plan.' },
        { status: 400 },
      );
    }

    // --- Connected platforms ---
    const connectedAccounts = await db
      .select({ platform: socialAccountSchema.platform })
      .from(socialAccountSchema)
      .where(
        and(
          eq(socialAccountSchema.orgId, orgId!),
          eq(socialAccountSchema.isActive, true),
        ),
      );

    const targetPlatforms = connectedAccounts.length > 0
      ? [...new Set(connectedAccounts.map(a => a.platform))]
      : ['instagram', 'linkedin'];

    const allowedContentTypes = getAllowedContentTypes(billing.features);

    // --- Call engine ---
    const enginePayload = {
      brand_profile: _buildEngineBrandProfile(profile),
      month,
      num_topics: monthlyPlanTopics === -1 ? 30 : monthlyPlanTopics,
      allowed_content_types: allowedContentTypes,
      target_platforms: targetPlatforms,
    };

    const engineRes = await fetch(`${ENGINE_URL}/api/plan/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': ENGINE_API_KEY,
      },
      body: JSON.stringify(enginePayload),
      signal: AbortSignal.timeout(60_000), // 60s timeout for plan generation
    });

    if (!engineRes.ok) {
      const engineErr = await engineRes.json().catch(() => ({}));
      console.error('[Plan] Engine error:', engineErr);
      return NextResponse.json(
        { error: (engineErr as any).detail || 'Plan generation failed. Please try again.' },
        { status: 502 },
      );
    }

    const engineData = await engineRes.json();
    const topics = engineData.topics ?? [];

    // --- Persist to DB ---
    // Use upsert: insert on first generation, update on regeneration.
    // onConflictDoUpdate targets the unique (org_id, month) index.
    const [savedPlan] = await db
      .insert(contentPlanSchema)
      .values({
        orgId: orgId!,
        month,
        topics,
        regenerationCount: 0,
        generatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [contentPlanSchema.orgId, contentPlanSchema.month],
        set: {
          topics,
          regenerationCount: currentRegenCount + (isRegeneration ? 1 : 0),
          generatedAt: new Date(),
        },
      })
      .returning();

    const newRegenCount = savedPlan!.regenerationCount;
    const regenerationsAllowed = billing.features.monthlyPlanRegenerations === -1
      ? null
      : billing.features.monthlyPlanRegenerations;

    return NextResponse.json({
      plan: savedPlan,
      month,
      meta: {
        topicsAllowed: monthlyPlanTopics,
        regenerationsAllowed,
        regenerationsUsed: newRegenCount,
        canRegenerate: canRegeneratePlan(billing.features, newRegenCount),
      },
    });
  } catch (err) {
    console.error('[Plan] POST failed:', err);
    return NextResponse.json({ error: 'Failed to generate plan. Please try again.' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// PATCH /api/calendar/plan — Dismiss or restore a topic
// -----------------------------------------------------------
export async function PATCH(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  let body: { month?: string; position?: number; dismissed?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { month, position, dismissed } = body;
  if (!month || position === undefined || dismissed === undefined) {
    return NextResponse.json(
      { error: 'month, position, and dismissed are required.' },
      { status: 400 },
    );
  }

  if (!_isValidMonth(month)) {
    return NextResponse.json({ error: 'Invalid month format. Use YYYY-MM.' }, { status: 400 });
  }

  try {
    const [plan] = await db
      .select()
      .from(contentPlanSchema)
      .where(
        and(
          eq(contentPlanSchema.orgId, orgId!),
          eq(contentPlanSchema.month, month),
        ),
      )
      .limit(1);

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found.' }, { status: 404 });
    }

    // Update the dismissed flag on the matching topic
    const updatedTopics = (plan.topics as any[]).map((t: any) =>
      t.position === position ? { ...t, dismissed } : t,
    );

    await db
      .update(contentPlanSchema)
      .set({ topics: updatedTopics })
      .where(
        and(
          eq(contentPlanSchema.orgId, orgId!),
          eq(contentPlanSchema.month, month),
        ),
      );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[Plan] PATCH failed:', err);
    return NextResponse.json({ error: 'Failed to update topic.' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------

function _currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function _isValidMonth(month: string): boolean {
  return /^\d{4}-\d{2}$/.test(month);
}

function _buildEngineBrandProfile(profile: any) {
  return {
    brand_name: profile.brandName,
    industry: profile.industry,
    target_audience: profile.targetAudience,
    company_description: profile.companyDescription,
    tone_formality: profile.toneFormality,
    tone_humor: profile.toneHumor,
    tone_energy: profile.toneEnergy,
    vocabulary: profile.vocabulary,
    forbidden_words: profile.forbiddenWords,
    communication_style: profile.communicationStyle,
    primary_color: profile.primaryColor,
    image_style: profile.imageStyle,
    content_examples: profile.contentExamples,
    anti_patterns: profile.antiPatterns,
    hashtag_strategy: profile.hashtagStrategy,
    linkedin_voice: profile.linkedinVoice,
    instagram_voice: profile.instagramVoice,
    twitter_voice: profile.twitterVoice,
    facebook_voice: profile.facebookVoice,
    tiktok_voice: profile.tiktokVoice,
    mission: profile.mission,
    values: profile.values,
    products_services: profile.productsServices,
    key_differentiators: profile.keyDifferentiators,
    growth_stage: profile.growthStage || 'early',
  };
}
