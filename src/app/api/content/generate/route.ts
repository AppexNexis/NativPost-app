import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { db } from '@/libs/DB';
import { brandProfileSchema, contentItemSchema } from '@/models/Schema';

const ENGINE_URL = process.env.NATIVPOST_ENGINE_URL || 'http://localhost:8000';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

// -----------------------------------------------------------
// POST /api/content/generate
// Sends brand profile + request to Python engine, saves results
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  try {
    const body = await request.json();
    const { topic, contentType, targetPlatforms, numVariants } = body;

    // 1. Fetch the org's brand profile
    const [profile] = await db
      .select()
      .from(brandProfileSchema)
      .where(eq(brandProfileSchema.orgId, orgId!))
      .limit(1);

    if (!profile) {
      return NextResponse.json(
        { error: 'No Brand Profile found. Complete your Brand Profile first.' },
        { status: 400 },
      );
    }

    // 2. Call the Python content engine
    const engineResponse = await fetch(`${ENGINE_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ENGINE_API_KEY}`,
      },
      body: JSON.stringify({
        brand_profile: {
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
        },
        topic: topic || null,
        content_type: contentType || 'single_image',
        target_platforms: targetPlatforms || ['instagram', 'linkedin'],
        num_variants: numVariants || 3,
      }),
    });

    if (!engineResponse.ok) {
      const err = await engineResponse.text();
      console.error('Engine error:', err);
      return NextResponse.json(
        { error: 'Content engine failed. Please try again.' },
        { status: 502 },
      );
    }

    const engineData = await engineResponse.json();
    const variants = engineData.variants || [];

    // 3. Save all variants to database
    const variantGroupId = crypto.randomUUID();
    const savedItems = [];

    for (const variant of variants) {
      const [saved] = await db
        .insert(contentItemSchema)
        .values({
          orgId: orgId!,
          brandProfileId: profile.id,
          caption: variant.caption,
          hashtags: variant.hashtags || [],
          contentType: contentType || 'single_image',
          topic: topic || null,
          graphicUrls: variant.graphic_urls || [],
          variantGroupId,
          variantNumber: variant.variant_number || 1,
          isSelectedVariant: false,
          targetPlatforms: targetPlatforms || ['instagram', 'linkedin'],
          platformSpecific: variant.platform_specific || {},
          status: 'pending_review',
          antiSlopScore: variant.anti_slop_score || null,
          qualityFlags: variant.quality_flags || [],
        })
        .returning();

      savedItems.push(saved);
    }

    return NextResponse.json(
      {
        variantGroupId,
        variants: savedItems,
        count: savedItems.length,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('Failed to generate content:', err);
    return NextResponse.json(
      { error: 'Failed to generate content' },
      { status: 500 },
    );
  }
}
