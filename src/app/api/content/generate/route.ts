import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { TITLE_PLATFORMS } from '@/lib/title-platforms';
import { db } from '@/libs/DB';
import { brandProfileSchema, contentItemSchema } from '@/models/Schema';

const ENGINE_URL = process.env.NATIVPOST_ENGINE_URL || 'http://localhost:8000';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

// -----------------------------------------------------------
// POST /api/content/generate
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  try {
    const body = await request.json();
    const {
      topic,
      contentType,
      targetPlatforms,
      numVariants,
      contentMode,
      enrichment,
    } = body;

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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90_000);

    let engineResponse: Response;
    try {
      engineResponse = await fetch(`${ENGINE_URL}/api/generate`, {
        method: 'POST',
        signal: controller.signal,
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
            growth_stage: (profile as any).growthStage || 'early',
          },
          topic: topic || null,
          content_type: contentType || 'single_image',
          target_platforms: targetPlatforms || ['instagram', 'linkedin'],
          num_variants: numVariants || 3,
          content_mode: contentMode || 'normal',
          enrichment: enrichment || null,
        }),
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        return NextResponse.json(
          { error: 'The content engine is warming up (cold start). Please wait 30 seconds and try again.' },
          { status: 503 },
        );
      }
      throw fetchErr;
    } finally {
      clearTimeout(timeoutId);
    }

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

    const platforms: string[] = targetPlatforms || ['instagram', 'linkedin'];
    const needsTitle = platforms.some(p => TITLE_PLATFORMS.includes(p as any));

    for (const variant of variants) {
      // Merge engine-returned platformSpecific with the generated title.
      // The engine returns platform-adapted captions keyed by platform name.
      // We store the title under platformSpecific.title so the UI can
      // surface and edit it without a separate DB column.
      const platformSpecific: Record<string, unknown> = variant.platform_specific || {};

      if (needsTitle && variant.title) {
        platformSpecific.title = variant.title;
      }

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
          targetPlatforms: platforms,
          platformSpecific,
          status: 'pending_review',
          antiSlopScore: variant.anti_slop_score || null,
          qualityFlags: variant.quality_flags || [],
          contentMode: contentMode || 'normal',
          enrichmentData: enrichment || {},
          enrichmentApplied: variant.enrichment_applied || [],
        })
        .returning();

      savedItems.push(saved);
    }

    return NextResponse.json(
      {
        variantGroupId,
        variants: savedItems,
        count: savedItems.length,
        contentMode: contentMode || 'normal',
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
