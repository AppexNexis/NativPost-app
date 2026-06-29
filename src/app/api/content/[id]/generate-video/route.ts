import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { applyRemixEdits, getRemixEditsFromGenerationParams } from '@/lib/remix-edits';
import { getDb } from '@/libs/DB';
import { brandProfileSchema, contentItemSchema, contentTemplateSchema } from '@/models/Schema';

const VIDEO_RENDERER_URL = process.env.NATIVPOST_VIDEO_URL || 'http://localhost:3001';
const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

type RouteParams = { params: Promise<{ id: string }> };

type TemplateContentType =
  | 'wall_of_text'
  | 'talking_head'
  | 'video_hook_demo'
  | 'green_screen_meme'
  | 'slideshow';

interface TemplateScript {
  hook_text?: string;
  body_text?: string;
  cta_text?: string;
  wall_text?: string;
  spoken_script?: string;
  visual_direction?: string;
  suggested_audio_mood?: string;
  slides?: Array<Record<string, unknown> | string>;
}

function isTemplateContentType(value: string): value is TemplateContentType {
  return ['wall_of_text', 'talking_head', 'video_hook_demo', 'green_screen_meme', 'slideshow'].includes(value);
}

function getSlideUrls(template: typeof contentTemplateSchema.$inferSelect): string[] {
  const thumbs = template.thumbnailUrls;
  if (Array.isArray(thumbs)) return thumbs.filter((u): u is string => typeof u === 'string');
  if (thumbs && typeof thumbs === 'object') {
    return Object.values(thumbs as Record<string, unknown>)
      .filter((u): u is string => typeof u === 'string');
  }
  return [];
}

function normalizeSlideCopy(slides?: TemplateScript['slides']): Array<{ text: string; durationSeconds?: number } | string> {
  if (!Array.isArray(slides)) return [];
  return slides.map((slide) => {
    if (typeof slide === 'string') return slide;
    if (slide && typeof slide === 'object') {
      const text =
        (slide.text as string) ||
        (slide.narration as string) ||
        (slide.headline as string) ||
        (slide.caption as string) ||
        (slide.body as string) ||
        '';
      const duration = typeof slide.durationSeconds === 'number' ? slide.durationSeconds : undefined;
      return duration ? { text, durationSeconds: duration } : text;
    }
    return String(slide);
  });
}

type BrandProfileFields = {
  brandName: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  logoUrl: string | null;
  industry: string | null;
  imageStyle: string | null;
  toneFormality: number | null;
  toneHumor: number | null;
  toneEnergy: number | null;
  communicationStyle: string | null;
  targetAudience: string | null;
  growthStage: string | null;
};

function buildTemplateVideoPayload(
  template: typeof contentTemplateSchema.$inferSelect,
  script: TemplateScript,
  profile: BrandProfileFields | undefined,
  remixEdits?: import('@/lib/remix-edits').RemixEdits | null,
): Record<string, unknown> {
  const contentType = isTemplateContentType(template.contentType) ? template.contentType : 'talking_head';
  const slideMediaUrls = getSlideUrls(template);

  let hookText = script.hook_text || '';
  let bodyText = script.body_text || '';
  let ctaText = script.cta_text || '';
  let wallText = script.wall_text || '';

  // Apply remix text overrides
  if (remixEdits?.structure?.hook?.text) hookText = remixEdits.structure.hook.text;
  if (remixEdits?.structure?.body?.text) bodyText = remixEdits.structure.body.text;
  if (remixEdits?.structure?.cta?.text) ctaText = remixEdits.structure.cta.text;

  // Apply media replacements if provided
  const replacementUrls = remixEdits?.mediaReplacements
    ?.filter((r) => r.newUrl && ['background', 'slide', 'hook_video', 'b_roll'].includes(r.slot))
    .map((r) => r.newUrl!)
    .filter(Boolean) || [];

  const backgroundMediaUrl = replacementUrls[0] || template.mediaUrl || null;
  const slideReplacements = replacementUrls.slice(1).length > 0 ? replacementUrls.slice(1) : slideMediaUrls;

  return {
    contentType,
    backgroundMediaUrl,
    slideMediaUrls: ['carousel', 'slideshow'].includes(contentType) ? slideReplacements : undefined,
    script: {
      hookText,
      bodyText,
      ctaText,
      wallText,
      slideCopy: normalizeSlideCopy(script.slides),
    },
    brandPrimary: profile?.primaryColor || '#864FFE',
    brandSecondary: profile?.secondaryColor || '#1A1A1C',
    brandAccent: profile?.accentColor || undefined,
    brandName: profile?.brandName || 'NativPost',
    logoUrl: profile?.logoUrl || undefined,
    soundtrackUrl: remixEdits?.audioTrack?.url || undefined,
    durationSeconds: template.durationSeconds || undefined,
    keepBackgroundAudio: !remixEdits?.audioTrack,
    formats: ['vertical', 'square'],
  };
}

/**
 * Maps brand tone sliders + content mode to a FLUX/Unsplash style preset.
 *
 * The brand profile imageStyle field ("minimal", "vibrant", "professional") is
 * the first source. If not set, we derive a style from the tone sliders:
 *   - High energy + low formality  → "bold"
 *   - High formality + low energy  → "professional"
 *   - Low humor + high formality   → "minimal"
 *   - High humor + high energy     → "vibrant"
 *   - Controversial content mode   → "bold" (amplifies the drama)
 *   - Default                      → "cinematic"
 *
 * This ensures the Unsplash/FLUX query mood matches the brand's actual personality.
 */
function deriveStylePreset(params: {
  imageStyle?: string | null;
  toneFormality?: number | null;
  toneHumor?: number | null;
  toneEnergy?: number | null;
  contentMode?: string | null;
}): string {
  // Explicit imageStyle from brand profile always wins
  const explicit = params.imageStyle?.toLowerCase().trim();
  if (explicit && ['minimal', 'vibrant', 'professional', 'cinematic', 'bold', 'dark'].includes(explicit)) {
    // Controversial mode amplifies any style toward bold
    if (params.contentMode === 'controversial' && explicit !== 'minimal') {
      return 'bold';
    }
    return explicit;
  }

  const energy   = params.toneEnergy   ?? 5;
  const formality = params.toneFormality ?? 5;
  const humor    = params.toneHumor    ?? 5;
  const mode     = params.contentMode  || 'normal';

  // Controversial posts → bold, dramatic visuals regardless of tone
  if (mode === 'controversial') return 'bold';

  // High formality, low energy → clean professional
  if (formality >= 7 && energy <= 4) return 'professional';

  // High energy, high humor → vibrant
  if (energy >= 7 && humor >= 7) return 'vibrant';

  // Very minimal brands (low energy, low humor, high formality)
  if (energy <= 3 && formality >= 7) return 'minimal';

  // High energy but serious → cinematic drama
  if (energy >= 7 && humor <= 4) return 'cinematic';

  // Default — cinematic works universally as a safe choice
  return 'cinematic';
}

async function renderVideoWithFallback(
  url: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ENGINE_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `Renderer returned ${res.status}: ${errText}` };
    }

    return { ok: true, data: (await res.json()) as Record<string, unknown> };
  } catch (fetchErr: unknown) {
    const isAbort = fetchErr instanceof Error && fetchErr.name === 'AbortError';
    return { ok: false, error: isAbort ? 'Renderer timed out' : String(fetchErr) };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

  console.log('[Video] VIDEO_RENDERER_URL:', VIDEO_RENDERER_URL);
  console.log('[Video] ENGINE_API_KEY set:', !!ENGINE_API_KEY);

  try {
    const [item] = await db
      .select()
      .from(contentItemSchema)
      .where(eq(contentItemSchema.id, id))
      .limit(1);

    if (!item || item.orgId !== orgId) {
      return NextResponse.json({ error: 'Content item not found' }, { status: 404 });
    }

    const imageUrls = (item.graphicUrls as string[]) || [];

    // Fetch full brand profile — every field that influences visual generation
    const [profile] = await db
      .select({
        brandName:         brandProfileSchema.brandName,
        primaryColor:      brandProfileSchema.primaryColor,
        secondaryColor:    brandProfileSchema.secondaryColor,
        accentColor:       brandProfileSchema.accentColor,
        logoUrl:           brandProfileSchema.logoUrl,
        industry:          brandProfileSchema.industry,
        imageStyle:        brandProfileSchema.imageStyle,
        toneFormality:     brandProfileSchema.toneFormality,
        toneHumor:         brandProfileSchema.toneHumor,
        toneEnergy:        brandProfileSchema.toneEnergy,
        communicationStyle: brandProfileSchema.communicationStyle,
        targetAudience:    brandProfileSchema.targetAudience,
        growthStage:       brandProfileSchema.growthStage,
      })
      .from(brandProfileSchema)
      .where(eq(brandProfileSchema.orgId, orgId!))
      .limit(1);

    // Parse request body — dashboard can override photoTier
    let requestBody: { photoTier?: string; forceLegacy?: boolean } = {};
    try { requestBody = await request.json(); } catch { /* no body */ }

    // Derive the visual style preset from brand personality
    const stylePreset = deriveStylePreset({
      imageStyle:    profile?.imageStyle,
      toneFormality: profile?.toneFormality,
      toneHumor:     profile?.toneHumor,
      toneEnergy:    profile?.toneEnergy,
      contentMode:   item.contentMode,
    });

    const remixEdits = getRemixEditsFromGenerationParams(item.generationParams);

    // ── Template-driven rendering (Phase 3) ───────────────────────────────────
    // When a content item was remixed from a template and has a generated script,
    // use Shotstack to render the source template media + script instead of a
    // generic stock-photo slideshow. This path is allowed for any content item
    // that carries a video-capable template.
    const generationParams = (item.generationParams || {}) as Record<string, unknown>;
    const script = (generationParams.script || null) as TemplateScript | null;

    if (item.templateId && script && !requestBody.forceLegacy) {
      const [template] = await db
        .select()
        .from(contentTemplateSchema)
        .where(eq(contentTemplateSchema.id, item.templateId))
        .limit(1);

      if (template) {
        const hasMedia = template.mediaUrl || getSlideUrls(template).length > 0;
        if (hasMedia) {
          const templatePayload = buildTemplateVideoPayload(template, script, profile, remixEdits);

          console.log('[Video] Template-driven render:', template.contentType, '| templateId:', template.id);
          console.log('[Video] Calling renderer at:', `${VIDEO_RENDERER_URL}/render/template`);

          const templateResult = await renderVideoWithFallback(
            `${VIDEO_RENDERER_URL}/render/template`,
            templatePayload,
            300_000,
          );

          if (templateResult.ok && templateResult.data) {
            const renderData = templateResult.data as {
              vertical?: string;
              verticalPublicId?: string;
              square?: string;
              squarePublicId?: string;
              durationSeconds?: number;
            };

            const vertical = renderData.vertical;
            const square = renderData.square;

            if (vertical && square) {
              const videoUrls = [vertical, square];
              const videoPublicIds = [renderData.verticalPublicId, renderData.squarePublicId].filter(
                (pid): pid is string => typeof pid === 'string' && pid.length > 0,
              );

              await db
                .update(contentItemSchema)
                .set({
                  graphicUrls: videoUrls,
                  platformSpecific: {
                    ...(item.platformSpecific as object),
                    sourceImages:         getSlideUrls(template),
                    sourceTemplateMedia:  template.mediaUrl,
                    videoDurationSeconds: renderData.durationSeconds ?? template.durationSeconds ?? 0,
                    renderer:             'shotstack',
                    videoGenerated:       true,
                    cloudinaryPublicIds:  videoPublicIds,
                    templateId:           template.id,
                  },
                  updatedAt: new Date(),
                })
                .where(eq(contentItemSchema.id, id));

              return NextResponse.json({
                success: true,
                vertical,
                square,
                verticalPublicId: renderData.verticalPublicId,
                squarePublicId:   renderData.squarePublicId,
                durationSeconds:  renderData.durationSeconds ?? template.durationSeconds ?? 0,
                renderer:         'shotstack',
                templateId:       template.id,
              });
            }
          }

          console.warn('[Video] Template render failed or returned incomplete URLs; falling back to legacy slideshow renderer');
        }
      }
    }

    // Legacy path: generic stock-photo slideshow — only available for reels.
    if (item.contentType !== 'reel') {
      return NextResponse.json(
        { error: 'Video generation only available for reel content type' },
        { status: 400 },
      );
    }

    const basePayload = {
      // Content
      images:      imageUrls,
      caption:     item.caption,
      topic:       item.topic     || undefined,
      contentMode: item.contentMode || 'normal',

      // Brand identity — visual rendering
      brandPrimary:   profile?.primaryColor   || '#864FFE',
      brandSecondary: profile?.secondaryColor || '#1A1A1C',
      brandAccent:    profile?.accentColor    || undefined,
      brandName:      profile?.brandName      || 'NativPost',
      logoUrl:        profile?.logoUrl        || undefined,

      // Brand personality — drives photo selection
      industry:       profile?.industry       || undefined,
      imageStyle:     stylePreset,

      // Photo tier
      photoTier: requestBody.photoTier || (imageUrls.length === 0 ? 'unsplash' : 'none'),
    };

    const payload = applyRemixEdits(basePayload, remixEdits, 'slideshow');

    console.log('[Video] Brand context → industry:', payload.industry, '| style:', payload.imageStyle, '| mode:', payload.contentMode);
    console.log('[Video] Calling renderer at:', `${VIDEO_RENDERER_URL}/render`);
    console.log('[Video] Payload images count:', imageUrls.length);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180_000);

    let renderRes: Response;
    try {
      renderRes = await fetch(`${VIDEO_RENDERER_URL}/render`, {
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
      console.error('[Video] Fetch error:', fetchErr);
      if (isAbort) {
        return NextResponse.json(
          { error: 'Video renderer timed out after 3 minutes. Try again.' },
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
      console.error('[Video] Renderer returned error:', renderRes.status, errText);
      return NextResponse.json(
        { error: 'Video generation failed.', detail: errText, rendererStatus: renderRes.status },
        { status: 502 },
      );
    }

    const renderData = await renderRes.json() as {
      vertical?: string;
      verticalPublicId?: string;
      square?: string;
      squarePublicId?: string;
      durationSeconds?: number;
      imageCount?: number;
      renderSeconds?: number;
      photoTier?: string;
      photoCount?: number;
      credits?: Array<{ name: string; link: string }>;
    };

    console.log('[Video] Render success:', renderData.vertical, renderData.square);
    console.log(`[Video] Render time: ${renderData.renderSeconds}s | Images: ${renderData.imageCount} | Tier: ${renderData.photoTier}`);

    const vertical = renderData.vertical;
    const square   = renderData.square;

    if (!vertical || !square) {
      console.error('[Video] Renderer returned undefined URLs:', renderData);
      return NextResponse.json(
        { error: 'Video generation failed — renderer returned empty URLs. Please try again.' },
        { status: 502 },
      );
    }

    const videoUrls = [vertical, square];
    const videoPublicIds = [renderData.verticalPublicId, renderData.squarePublicId].filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    );

    await db
      .update(contentItemSchema)
      .set({
        graphicUrls: videoUrls,
        platformSpecific: {
          ...(item.platformSpecific as object),
          sourceImages:         imageUrls,
          videoDurationSeconds: renderData.durationSeconds ?? 0,
          photoTier:            renderData.photoTier ?? 'none',
          unsplashCredits:      renderData.credits ?? [],
          videoGenerated:       true,
          cloudinaryPublicIds:  videoPublicIds,
          // stylePresetUsed is intentionally not stored in platformSpecific
          // to keep the platform adaptations panel clean
        },
        updatedAt: new Date(),
      })
      .where(eq(contentItemSchema.id, id));

    return NextResponse.json({
      success: true,
      vertical,
      square,
      verticalPublicId: renderData.verticalPublicId,
      squarePublicId:   renderData.squarePublicId,
      durationSeconds:  renderData.durationSeconds ?? 0,
      imageCount:       renderData.imageCount ?? imageUrls.length,
      renderSeconds:    renderData.renderSeconds ?? 0,
      photoTier:        renderData.photoTier ?? 'none',
      credits:          renderData.credits ?? [],
    });
  } catch (err) {
    console.error('[Video] generate-video failed:', err);
    return NextResponse.json(
      { error: `Video generation failed: ${String(err)}` },
      { status: 500 },
    );
  }
}