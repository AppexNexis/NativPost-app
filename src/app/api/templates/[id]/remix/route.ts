import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { brandProfileSchema, contentItemSchema, contentTemplateSchema } from '@/models/Schema';

const ENGINE_URL = process.env.NATIVPOST_ENGINE_URL || 'http://localhost:8000';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// -----------------------------------------------------------
// Template contentType → NativPost contentType + generator
// -----------------------------------------------------------
const TEMPLATE_TYPE_MAP: Record<string, { contentType: string; generatorEndpoint: string; defaultAspectRatio: string }> = {
  slideshow: { contentType: 'reel', generatorEndpoint: 'generate-video', defaultAspectRatio: '9:16' },
  wall_of_text: { contentType: 'text_only', generatorEndpoint: 'generate-text-motion', defaultAspectRatio: '9:16' },
  talking_head: { contentType: 'ugc_ad', generatorEndpoint: 'generate-ugc-ad', defaultAspectRatio: '9:16' },
  green_screen_meme: { contentType: 'single_image', generatorEndpoint: 'generate-scene', defaultAspectRatio: '9:16' },
  video_hook_demo: { contentType: 'reel', generatorEndpoint: 'generate-video', defaultAspectRatio: '9:16' },
  carousel: { contentType: 'carousel', generatorEndpoint: 'generate-carousel', defaultAspectRatio: '1:1' },
  ugc: { contentType: 'ugc_ad', generatorEndpoint: 'generate-ugc-ad', defaultAspectRatio: '9:16' },
  custom: { contentType: 'reel', generatorEndpoint: 'generate-video', defaultAspectRatio: '9:16' },
};

const DEFAULT_TEMPLATE_MAPPING = TEMPLATE_TYPE_MAP.custom!;

const CUSTOM_GENERATOR_MAP: Record<string, string> = {
  reel: 'generate-video',
  text_only: 'generate-text-motion',
  ugc_ad: 'generate-ugc-ad',
  single_image: 'generate-image',
  carousel: 'generate-carousel',
  data_story: 'generate-data-story',
  scene: 'generate-scene',
};

// -----------------------------------------------------------
// Build engine payload (mirrors /api/content/generate)
// -----------------------------------------------------------
function buildEnginePayload(profile: any, payload: Record<string, unknown>) {
  const platforms: string[] = Array.isArray(payload.targetPlatforms)
    ? payload.targetPlatforms
    : ['instagram', 'linkedin'];

  return {
    platforms,
    payload: {
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
      topic: payload.topic || null,
      content_type: payload.contentType || 'text_only',
      target_platforms: platforms,
      num_variants: payload.numVariants || 3,
      content_mode: payload.contentMode || 'normal',
      enrichment: payload.enrichment || null,
    },
  };
}

// -----------------------------------------------------------
// Save a single variant to the DB with v2 fields
// -----------------------------------------------------------
async function saveVariant(
  db: any,
  orgId: string,
  profile: any,
  variant: any,
  variantGroupId: string,
  platforms: string[],
  body: Record<string, unknown>,
  templateId: string,
  aspectRatio: string,
  contentFormat: string,
) {
  const { contentType, topic, contentMode, enrichment } = body;
  const platformSpecific: Record<string, unknown> = variant.platform_specific || {};

  const values: Record<string, unknown> = {
    orgId,
    brandProfileId: profile.id,
    caption: variant.caption,
    hashtags: variant.hashtags || [],
    contentType: contentType || 'text_only',
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
    // v2 fields
    templateId,
    aspectRatio,
    generationParams: {
      templateId,
      aspectRatio,
      contentFormat,
      remixSource: body.sourceUrl,
      remixEdits: body.remixEdits,
    } as any,
    contentFormat: contentFormat || null,
  };

  const [saved] = await db
    .insert(contentItemSchema)
    .values(values as any)
    .returning();

  return saved;
}

// -----------------------------------------------------------
// POST /api/templates/[id]/remix
// -----------------------------------------------------------
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

  try {
    const body = await request.json();

    // 1. Fetch template
    const [template] = await db
      .select()
      .from(contentTemplateSchema)
      .where(eq(contentTemplateSchema.id, id))
      .limit(1);

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // 2. Map template contentType
    const mapping = TEMPLATE_TYPE_MAP[template.contentType] || DEFAULT_TEMPLATE_MAPPING;
    let contentType = mapping.contentType;
    let generatorEndpoint = mapping.generatorEndpoint;
    let aspectRatio = (body.aspectRatio as string) || mapping.defaultAspectRatio;

    if (template.contentType === 'custom' && body.contentType) {
      contentType = body.contentType as string;
      generatorEndpoint = CUSTOM_GENERATOR_MAP[contentType] || 'generate-video';
    }

    // 3. Apply user remix edits if provided
    const remixEdits = body.remixEdits as Record<string, any> | undefined;
    const userStructure = (remixEdits?.structure || {}) as Record<string, any>;
    const templateStructure = (template.structure || {}) as Record<string, any>;
    const structure = {
      ...templateStructure,
      ...userStructure,
      hook: userStructure.hook ? { ...templateStructure.hook, ...userStructure.hook } : templateStructure.hook,
      body: userStructure.body ? { ...templateStructure.body, ...userStructure.body } : templateStructure.body,
      cta: userStructure.cta ? { ...templateStructure.cta, ...userStructure.cta } : templateStructure.cta,
    };

    const topic = [
      structure.hook?.text,
      structure.body?.text,
      structure.cta?.text,
    ].filter(Boolean).join(' — ') || template.sourceCreator || 'Remixed content';

    // 4. Build enrichment from template
    const enrichment: Record<string, unknown> = {};
    if (structure.cta?.text) {
      enrichment.cta_label = structure.cta.text;
    }
    if (template.sourceUrl) {
      enrichment.reference_links = [template.sourceUrl];
    }
    if (body.enrichment) {
      Object.assign(enrichment, body.enrichment);
    }

    // 5. Target platforms
    const targetPlatforms: string[] = Array.isArray(body.targetPlatforms)
      ? body.targetPlatforms
      : [template.sourcePlatform === 'tiktok' ? 'tiktok' : 'instagram'];

    // 6. Fetch brand profile
    const [profile] = await db
      .select()
      .from(brandProfileSchema)
      .where(eq(brandProfileSchema.orgId, orgId!))
      .limit(1);

    if (!profile) {
      return NextResponse.json({ error: 'No Brand Profile found. Complete your Brand Profile first.' }, { status: 400 });
    }

    // 7. Call engine for text generation
    const { payload } = buildEnginePayload(profile, {
      topic,
      contentType,
      targetPlatforms,
      numVariants: body.numVariants || 3,
      contentMode: body.contentMode || 'normal',
      enrichment: Object.keys(enrichment).length > 0 ? enrichment : null,
    });

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
        body: JSON.stringify(payload),
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        return NextResponse.json(
          { error: 'The content engine is warming up. Please wait 30 seconds and try again.' },
          { status: 503 },
        );
      }
      throw fetchErr;
    } finally {
      clearTimeout(timeoutId);
    }

    if (engineResponse.status === 503) {
      return NextResponse.json(
        { error: 'Content engine temporarily unavailable. Please try again in a moment.' },
        { status: 503 },
      );
    }

    if (!engineResponse.ok) {
      const err = await engineResponse.text();
      console.error('[Remix] Engine error:', err);
      return NextResponse.json({ error: 'Content engine failed. Please try again.' }, { status: 502 });
    }

    const engineData = await engineResponse.json();
    const variants = engineData.variants || [];

    // 8. Save variants to DB
    const variantGroupId = crypto.randomUUID();
    const savedItems = await Promise.all(
      variants.map((v: any) =>
        saveVariant(db, orgId!, profile, v, variantGroupId, targetPlatforms, {
          topic,
          contentType,
          contentMode: body.contentMode || 'normal',
          enrichment: Object.keys(enrichment).length > 0 ? enrichment : null,
          sourceUrl: template.sourceUrl,
          remixEdits,
        }, template.id, aspectRatio, template.contentType),
      ),
    );

    // 9. Call media generator for the first (selected) variant
    const firstVariant = savedItems[0];
    if (firstVariant && generatorEndpoint) {
      try {
        const mediaRes = await fetch(
          `${APP_BASE_URL}/api/content/${firstVariant.id}/${generatorEndpoint}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              aspectRatio,
              ...(body.mediaOptions || {}),
            }),
          },
        );

        if (mediaRes.ok) {
          const [refreshed] = await db
            .select()
            .from(contentItemSchema)
            .where(eq(contentItemSchema.id, firstVariant.id))
            .limit(1);
          if (refreshed) {
            savedItems[0] = refreshed;
          }
        } else {
          console.error('[Remix] Media generation failed:', await mediaRes.text());
        }
      } catch (mediaErr) {
        console.error('[Remix] Media generation error:', mediaErr);
        // Don't fail the whole request — text is already saved
      }
    }

    // 10. Increment remix count on template
    await db
      .update(contentTemplateSchema)
      .set({
        remixCount: (template.remixCount || 0) + 1,
        updatedAt: new Date(),
      })
      .where(eq(contentTemplateSchema.id, template.id));

    return NextResponse.json({
      variantGroupId,
      variants: savedItems,
      templateId: template.id,
      contentType,
      aspectRatio,
      count: savedItems.length,
    }, { status: 201 });
  } catch (err) {
    console.error('[Remix] Failed:', err);
    return NextResponse.json({ error: 'Remix failed. Please try again.' }, { status: 500 });
  }
}
