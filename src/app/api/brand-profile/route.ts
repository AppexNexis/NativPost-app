import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
// import { db } from '@/libs/DB';
import { getDb } from '@/libs/DB';
import { brandProfileSchema, organizationSchema } from '@/models/Schema';

// -----------------------------------------------------------
// GET /api/brand-profile
// -----------------------------------------------------------
export async function GET() {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  try {
    const [profile] = await db
      .select()
      .from(brandProfileSchema)
      .where(eq(brandProfileSchema.orgId, orgId!))
      .limit(1);

    if (!profile) {
      return NextResponse.json({ profile: null }, { status: 200 });
    }

    return NextResponse.json({ profile }, { status: 200 });
  } catch (err) {
    console.error('Failed to fetch brand profile:', err);
    return NextResponse.json({ error: 'Failed to fetch brand profile' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// POST /api/brand-profile
// Creates or updates the brand profile for the current org.
//
// Safety net: ensures the organization row exists before any
// FK-dependent insert. The Clerk webhook handles this in production
// but cannot reach localhost during local dev, so the org row never
// gets created there. onConflictDoNothing() makes this fully
// idempotent — if the row already exists, this is a no-op.
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  try {
    const body = await request.json();

    // Ensure org row exists before writing brand profile (FK safety net)
    await db
      .insert(organizationSchema)
      .values({
        id: orgId!,
        plan: 'starter',
        planStatus: 'trialing',
        postsPerMonth: 20,
        platformsLimit: 3,
        setupFeePaid: false,
      })
      .onConflictDoNothing();

    const completeness = calculateCompleteness(body);

    const [existing] = await db
      .select({ id: brandProfileSchema.id })
      .from(brandProfileSchema)
      .where(eq(brandProfileSchema.orgId, orgId!))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(brandProfileSchema)
        .set({
          ...sanitizeProfileData(body),
          profileCompleteness: completeness,
          onboardingCompleted: completeness >= 60,
          updatedAt: new Date(),
        })
        .where(eq(brandProfileSchema.id, existing.id))
        .returning();

      return NextResponse.json({ profile: updated }, { status: 200 });
    }

    const [created] = await db
      .insert(brandProfileSchema)
      .values({
        orgId: orgId!,
        ...sanitizeProfileData(body),
        profileCompleteness: completeness,
        onboardingCompleted: completeness >= 60,
      })
      .returning();

    return NextResponse.json({ profile: created }, { status: 201 });
  } catch (err) {
    console.error('Failed to save brand profile:', err);
    return NextResponse.json({ error: 'Failed to save brand profile' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// HELPERS
// -----------------------------------------------------------

function sanitizeProfileData(body: Record<string, unknown>) {
  return {
    brandName: String(body.brandName || ''),
    industry: body.industry ? String(body.industry) : null,
    targetAudience: body.targetAudience ? String(body.targetAudience) : null,
    companyDescription: body.companyDescription ? String(body.companyDescription) : null,
    websiteUrl: body.websiteUrl ? String(body.websiteUrl) : null,
    toneFormality: Number(body.toneFormality) || 5,
    toneHumor: Number(body.toneHumor) || 5,
    toneEnergy: Number(body.toneEnergy) || 5,
    vocabulary: Array.isArray(body.vocabulary) ? body.vocabulary : [],
    forbiddenWords: Array.isArray(body.forbiddenWords) ? body.forbiddenWords : [],
    communicationStyle: body.communicationStyle ? String(body.communicationStyle) : null,
    primaryColor: body.primaryColor ? String(body.primaryColor) : null,
    secondaryColor: body.secondaryColor ? String(body.secondaryColor) : null,
    accentColor: body.accentColor ? String(body.accentColor) : null,
    fontPreference: body.fontPreference ? String(body.fontPreference) : null,
    imageStyle: body.imageStyle ? String(body.imageStyle) : null,
    logoUrl: body.logoUrl ? String(body.logoUrl) : null,
    contentExamples: Array.isArray(body.contentExamples) ? body.contentExamples : [],
    antiPatterns: Array.isArray(body.antiPatterns) ? body.antiPatterns : [],
    hashtagStrategy: body.hashtagStrategy ? String(body.hashtagStrategy) : null,
    linkedinVoice: body.linkedinVoice ? String(body.linkedinVoice) : null,
    instagramVoice: body.instagramVoice ? String(body.instagramVoice) : null,
    twitterVoice: body.twitterVoice ? String(body.twitterVoice) : null,
    facebookVoice: body.facebookVoice ? String(body.facebookVoice) : null,
    tiktokVoice: body.tiktokVoice ? String(body.tiktokVoice) : null,
    mission: body.mission ? String(body.mission) : null,
    values: Array.isArray(body.values) ? body.values : [],
    productsServices: Array.isArray(body.productsServices) ? body.productsServices : [],
    keyDifferentiators: body.keyDifferentiators ? String(body.keyDifferentiators) : null,
    growthStage: body.growthStage ? String(body.growthStage) : 'early',
  };
}

function calculateCompleteness(body: Record<string, unknown>): number {
  let score = 0;
  const checks = [
    { field: 'brandName', weight: 10 },
    { field: 'industry', weight: 5 },
    { field: 'targetAudience', weight: 5 },
    { field: 'companyDescription', weight: 5 },
    { field: 'communicationStyle', weight: 10 },
    { field: 'vocabulary', weight: 8, isArray: true },
    { field: 'forbiddenWords', weight: 7, isArray: true },
    { field: 'primaryColor', weight: 7 },
    { field: 'imageStyle', weight: 7 },
    { field: 'logoUrl', weight: 6 },
    { field: 'contentExamples', weight: 8, isArray: true },
    { field: 'antiPatterns', weight: 7, isArray: true },
    { field: 'linkedinVoice', weight: 5 },
    { field: 'instagramVoice', weight: 5 },
    { field: 'twitterVoice', weight: 5 },
  ];

  for (const check of checks) {
    const val = body[check.field];
    if (check.isArray) {
      if (Array.isArray(val) && val.length > 0) {
        score += check.weight;
      }
    } else {
      if (val && String(val).trim().length > 0) {
        score += check.weight;
      }
    }
  }

  return Math.min(score, 100);
}
