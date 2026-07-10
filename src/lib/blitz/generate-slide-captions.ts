/**
 * generateBlitzSlideCaptions
 *
 * Kicks off per-slide caption generation for a newly-inserted Blitz
 * slideshow/carousel item. Each slide gets its OWN caption produced by
 * Claude Sonnet multimodal (image + brand profile + prior slides for
 * continuity), then the item's enrichmentData.editorScript.slideCopy is
 * updated in place so the Blitz card renders unique text per slide.
 *
 * Designed for fire-and-forget invocation via `waitUntil()` from the
 * Phase 1 insert loop in `src/app/api/campaigns/utils.ts`. On any failure
 * (missing API key, Claude error, DB race) it logs and returns silently;
 * the card falls back to hookText, which is the historical behavior.
 *
 * Mirrors the logic of `src/app/api/content/generate-slide-copy/route.ts`
 * but runs in-process against db + Anthropic client (no HTTP round-trip),
 * and processes all slides in one shot.
 */

import Anthropic from '@anthropic-ai/sdk';
import { eq } from 'drizzle-orm';

import { brandProfileSchema, contentItemSchema } from '@/models/Schema';

type Db = any;

export type GenerateBlitzSlideCaptionsOpts = {
  db: Db;
  orgId: string;
  contentItemId: string;
  contentType: string;
  slideUrls: string[];
  hookText?: string;
  contextCaption?: string;
};

function deriveBrandTone(formality: number, humor: number, energy: number): string {
  const tones: string[] = [];
  if (formality >= 7) tones.push('professional');
  else if (formality <= 3) tones.push('casual');
  if (humor >= 7) tones.push('playful');
  else if (humor <= 3) tones.push('serious');
  if (energy >= 7) tones.push('bold');
  else if (energy <= 3) tones.push('calm');
  if (tones.length === 0) return 'balanced';
  return tones.join(' ');
}

async function generateOne(
  client: Anthropic,
  args: {
    imageUrl: string;
    slideIndex: number;
    contentType: string;
    brandName: string;
    industry: string;
    brandTone: string;
    contextCaption: string;
    previousSlides: string[];
  },
): Promise<string | null> {
  const previousLines = args.previousSlides
    .map((s, i) => `Slide ${i + 1}: ${s}`)
    .join('\n');

  const prompt = `You write short-form social captions for ${args.brandName} (industry: ${args.industry}, tone: ${args.brandTone}).

Task: Write ONE caption for slide ${args.slideIndex + 1} of a ${args.contentType} post. The caption sits over the image shown.

Overall post context:
${args.contextCaption || '(no context provided)'}

Previous slides:
${previousLines || '(this is the first slide)'}

Rules:
- Max 90 characters.
- Hook-first: the opening words must earn a scroll-stop.
- No hashtags.
- No emojis unless the tone is playful or bold.
- No quotes, no markdown, no leading "Slide N:" label.
- Continue the narrative from the previous slides — do not restate them.
- Match what the image visually conveys.

Return ONLY the caption text, nothing else.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      temperature: 0.7,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'url', url: args.imageUrl },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    });

    const text = response.content
      .filter(c => c.type === 'text')
      .map(c => (c as { text: string }).text)
      .join(' ')
      .trim();

    if (!text) return null;

    return text
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/^Slide\s*\d+:\s*/i, '')
      .trim()
      .slice(0, 90);
  } catch (err) {
    console.error(`[Blitz slide-cap] slide ${args.slideIndex} gen failed:`, err);
    return null;
  }
}

export async function generateBlitzSlideCaptions(
  opts: GenerateBlitzSlideCaptionsOpts,
): Promise<void> {
  const { db, orgId, contentItemId, contentType, slideUrls, hookText, contextCaption } = opts;

  if (!Array.isArray(slideUrls) || slideUrls.length === 0) return;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[Blitz slide-cap] ANTHROPIC_API_KEY missing, skipping');
    return;
  }

  try {
    const [profile] = await db
      .select({
        brandName: brandProfileSchema.brandName,
        industry: brandProfileSchema.industry,
        toneFormality: brandProfileSchema.toneFormality,
        toneHumor: brandProfileSchema.toneHumor,
        toneEnergy: brandProfileSchema.toneEnergy,
      })
      .from(brandProfileSchema)
      .where(eq(brandProfileSchema.orgId, orgId))
      .limit(1);

    const brandName = profile?.brandName || 'the brand';
    const industry = profile?.industry || 'general';
    const brandTone = deriveBrandTone(
      profile?.toneFormality ?? 5,
      profile?.toneHumor ?? 5,
      profile?.toneEnergy ?? 5,
    );

    const client = new Anthropic({ apiKey });

    // Generate sequentially so each slide sees prior slides for continuity.
    // Also stays within Anthropic per-org rate limits on the Blitz burst.
    const captions: string[] = [];
    for (let i = 0; i < slideUrls.length; i++) {
      const url = slideUrls[i];
      if (!url) {
        captions.push(hookText || '');
        continue;
      }
      const caption = await generateOne(client, {
        imageUrl: url,
        slideIndex: i,
        contentType,
        brandName,
        industry,
        brandTone,
        contextCaption: contextCaption || hookText || '',
        previousSlides: captions.filter(Boolean),
      });
      captions.push(caption || hookText || '');
    }

    // Merge into the existing enrichmentData.editorScript.slideCopy.
    // Re-read the row first so we don't clobber concurrent updates.
    const [row] = await db
      .select({ enrichmentData: contentItemSchema.enrichmentData })
      .from(contentItemSchema)
      .where(eq(contentItemSchema.id, contentItemId))
      .limit(1);

    if (!row) return;

    const enrichment = (row.enrichmentData as Record<string, any>) || {};
    const editorScript = { ...(enrichment.editorScript || {}) };
    editorScript.slideCopy = captions;

    await db
      .update(contentItemSchema)
      .set({
        enrichmentData: {
          ...enrichment,
          editorScript,
        },
      })
      .where(eq(contentItemSchema.id, contentItemId));

    console.log(`[Blitz slide-cap] wrote ${captions.length} captions for ${contentItemId}`);
  } catch (err) {
    console.error('[Blitz slide-cap] failed:', err);
  }
}
