import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { checkFeatureAccess, checkPlatformsPerPost, checkPostLimit, hasActiveSubscription } from '@/lib/billing';
import { TITLE_PLATFORMS } from '@/lib/title-platforms';
import { getDb } from '@/libs/DB';
import { brandProfileSchema, contentItemSchema } from '@/models/Schema';

const ENGINE_URL = process.env.NATIVPOST_ENGINE_URL || 'http://localhost:8000';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

// -----------------------------------------------------------
// Shared: build the engine request body from a DB profile + request body
// Extracted so both POST and the stream GET share the same mapping logic.
// -----------------------------------------------------------
function buildEnginePayload(profile: any, body: Record<string, any>) {
  const {
    topic,
    contentType,
    targetPlatforms,
    numVariants,
    contentMode,
    enrichment,
  } = body;

  const platforms: string[] = Array.isArray(targetPlatforms) ? targetPlatforms : ['instagram', 'linkedin'];

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
      topic: topic || null,
      content_type: contentType || 'text_only',
      target_platforms: platforms,
      num_variants: numVariants || 3,
      content_mode: contentMode || 'normal',
      enrichment: enrichment || null,
    },
  };
}

// -----------------------------------------------------------
// Shared: subscription + quota + feature enforcement
// Returns a NextResponse error if any check fails, null if all pass.
// -----------------------------------------------------------
async function enforceAccessChecks(
  orgId: string,
  body: Record<string, any>,
  platforms: string[],
): Promise<NextResponse | null> {
  const { contentType, contentMode, enrichment } = body;

  const active = await hasActiveSubscription(orgId);
  if (!active) {
    return NextResponse.json(
      { error: 'Your subscription has expired. Please subscribe to continue generating content.' },
      { status: 403 },
    );
  }

  const postLimit = await checkPostLimit(orgId);
  if (!postLimit.allowed) {
    return NextResponse.json({ error: postLimit.reason }, { status: 403 });
  }

  const platformLimit = await checkPlatformsPerPost(orgId, platforms);
  if (!platformLimit.allowed) {
    return NextResponse.json({ error: platformLimit.reason }, { status: 403 });
  }

  if (contentType === 'single_image' || contentType === 'image') {
    const imageCheck = await checkFeatureAccess(orgId, 'imagePosts');
    if (!imageCheck.allowed) {
      return NextResponse.json({ error: imageCheck.reason }, { status: 403 });
    }
  }
  if (contentType === 'carousel' || contentType === 'carousel_image') {
    const carouselCheck = await checkFeatureAccess(orgId, 'carouselPosts');
    if (!carouselCheck.allowed) {
      return NextResponse.json({ error: carouselCheck.reason }, { status: 403 });
    }
  }
  if (contentType === 'reel' || contentType === 'video') {
    const videoCheck = await checkFeatureAccess(orgId, 'videoGeneration');
    if (!videoCheck.allowed) {
      return NextResponse.json({ error: videoCheck.reason }, { status: 403 });
    }
  }
  if (contentMode && contentMode !== 'normal' && contentType !== 'text_only') {
    const modeCheck = await checkFeatureAccess(orgId, 'contentModes');
    if (!modeCheck.allowed) {
      return NextResponse.json({ error: modeCheck.reason }, { status: 403 });
    }
  }
  if (enrichment && Object.keys(enrichment).filter(k => enrichment[k as keyof typeof enrichment]).length > 0) {
    const enrichmentCheck = await checkFeatureAccess(orgId, 'postEnrichment');
    if (!enrichmentCheck.allowed) {
      return NextResponse.json({ error: enrichmentCheck.reason }, { status: 403 });
    }
  }

  return null;
}

// -----------------------------------------------------------
// Shared: save a single engine variant to the DB and return the saved row
// -----------------------------------------------------------
async function saveVariant(
  db: any,
  orgId: string,
  profile: any,
  variant: any,
  variantGroupId: string,
  platforms: string[],
  body: Record<string, any>,
) {
  const { contentType, topic, contentMode, enrichment } = body;
  const needsTitle = platforms.some((p: string) => TITLE_PLATFORMS.includes(p as any));

  const platformSpecific: Record<string, unknown> = variant.platform_specific || {};
  if (needsTitle && variant.title) {
    platformSpecific.title = variant.title;
  }

  const [saved] = await db
    .insert(contentItemSchema)
    .values({
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
    })
    .returning();

  return saved;
}

// -----------------------------------------------------------
// POST /api/content/generate
// Standard JSON response — all variants returned at once.
// -----------------------------------------------------------
export async function POST(request: NextRequest) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) {
    return error;
  }

  try {
    const body = await request.json();
    const platforms: string[] = Array.isArray(body.targetPlatforms)
      ? body.targetPlatforms
      : ['instagram', 'linkedin'];

    // Access checks
    const accessError = await enforceAccessChecks(orgId!, body, platforms);
    if (accessError) {
      return accessError;
    }

    // Fetch brand profile
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

    // Call the engine (standard JSON endpoint)
    const { payload } = buildEnginePayload(profile, body);
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

    // Engine returned a transient error — 503 means retry
    if (engineResponse.status === 503) {
      return NextResponse.json(
        { error: 'Content engine temporarily unavailable. Please try again in a moment.' },
        { status: 503 },
      );
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

    // Save all variants to DB
    const variantGroupId = crypto.randomUUID();
    const savedItems = await Promise.all(
      variants.map((v: any) => saveVariant(db, orgId!, profile, v, variantGroupId, platforms, body)),
    );

    return NextResponse.json(
      {
        variantGroupId,
        variants: savedItems,
        count: savedItems.length,
        contentMode: body.contentMode || 'normal',
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('Failed to generate content:', err);
    return NextResponse.json({ error: 'Failed to generate content' }, { status: 500 });
  }
}

// -----------------------------------------------------------
// GET /api/content/generate/stream
// SSE endpoint — streams each variant as it completes from the engine.
// The frontend connects via EventSource/fetch streaming and renders
// variants progressively instead of waiting for all 3 to finish.
//
// Query params (same shape as POST body, passed as JSON in ?body=...):
//   ?body=<URL-encoded JSON of the same payload as POST>
//
// SSE event format (mirrors the Python engine's stream format):
//   data: {"type":"variant", "index":0, "variant":{...savedDbRow}}
//   data: {"type":"progress", "completed":1, "total":3, "percent":33}
//   data: {"type":"done", "variantGroupId":"...", "total":3}
//   data: {"type":"error", "detail":"..."}
// -----------------------------------------------------------
export async function GET(request: NextRequest) {
  const { error, orgId } = await getAuthContext();
  if (error) {
    // Can't return a NextResponse from SSE easily — send an error event
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', detail: 'Unauthorized' })}\n\n`));
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  }

  const db = await getDb();
  const rawBody = request.nextUrl.searchParams.get('body');

  if (!rawBody) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', detail: 'Missing body param' })}\n\n`));
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  }

  let body: Record<string, any>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', detail: 'Invalid body JSON' })}\n\n`));
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  }

  const platforms: string[] = Array.isArray(body.targetPlatforms)
    ? body.targetPlatforms
    : ['instagram', 'linkedin'];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Access checks
        const accessError = await enforceAccessChecks(orgId!, body, platforms);
        if (accessError) {
          const errData = await accessError.json();
          send({ type: 'error', detail: errData.error });
          controller.close();
          return;
        }

        // Fetch brand profile
        const [profile] = await db
          .select()
          .from(brandProfileSchema)
          .where(eq(brandProfileSchema.orgId, orgId!))
          .limit(1);

        if (!profile) {
          send({ type: 'error', detail: 'No Brand Profile found. Complete your Brand Profile first.' });
          controller.close();
          return;
        }

        const { payload } = buildEnginePayload(profile, body);
        const numVariants = body.numVariants || 3;
        const variantGroupId = crypto.randomUUID();

        // Connect to the Python engine's SSE stream
        const engineRes = await fetch(`${ENGINE_URL}/api/generate/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ENGINE_API_KEY}`,
          },
          body: JSON.stringify(payload),
        });

        if (!engineRes.ok || !engineRes.body) {
          // Fall back: send a progress event and call the standard endpoint
          send({ type: 'progress', completed: 0, total: numVariants, percent: 5 });
          const fallbackRes = await fetch(`${ENGINE_URL}/api/generate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${ENGINE_API_KEY}`,
            },
            body: JSON.stringify(payload),
          });
          if (!fallbackRes.ok) {
            send({ type: 'error', detail: 'Content engine failed. Please try again.' });
            controller.close();
            return;
          }
          const fallbackData = await fallbackRes.json();
          const fallbackVariants = fallbackData.variants || [];
          let completed = 0;
          for (const v of fallbackVariants) {
            const saved = await saveVariant(db, orgId!, profile, v, variantGroupId, platforms, body);
            completed++;
            send({ type: 'variant', index: completed - 1, variant: saved });
            send({ type: 'progress', completed, total: numVariants, percent: Math.round((completed / numVariants) * 100) });
          }
          send({ type: 'done', variantGroupId, total: completed });
          controller.close();
          return;
        }

        // Read the SSE stream from the engine
        const reader = engineRes.body.getReader();
        const dec = new TextDecoder();
        let buffer = '';
        let completed = 0;

        // Send an initial progress heartbeat so the UI shows activity immediately
        send({ type: 'progress', completed: 0, total: numVariants, percent: 5 });

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += dec.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) {
              continue;
            }
            let event: any;
            try {
              event = JSON.parse(line.slice(6));
            } catch {
              continue;
            }

            if (event.type === 'variant') {
              // Save this variant to the DB immediately
              const saved = await saveVariant(db, orgId!, profile, event.variant, variantGroupId, platforms, body);
              completed++;
              const percent = Math.round((completed / numVariants) * 100);
              // Send the saved DB row (has the real ID the frontend needs)
              send({ type: 'variant', index: event.index ?? completed - 1, variant: saved });
              send({ type: 'progress', completed, total: numVariants, percent });
            } else if (event.type === 'done') {
              send({ type: 'done', variantGroupId, total: completed });
            } else if (event.type === 'error') {
              send({ type: 'error', detail: event.detail });
            }
          }
        }

        // Ensure done is always sent even if the engine didn't send it
        if (completed > 0) {
          send({ type: 'done', variantGroupId, total: completed });
        }
      } catch (err: any) {
        console.error('Stream error:', err);
        send({ type: 'error', detail: 'An unexpected error occurred. Please try again.' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
