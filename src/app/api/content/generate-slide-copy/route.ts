import Anthropic from '@anthropic-ai/sdk';
import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { brandProfileSchema } from '@/models/Schema';

/**
 * POST /api/content/generate-slide-copy
 *
 * Writes ONE short slide caption given the slide image + the org's brand
 * profile + continuity from previous slides. Used by the image editor when
 * the user adds a slide via the "+" tile or the Media tab picker.
 *
 * Body:
 *   imageUrl        — HTTPS URL of the slide image (required)
 *   contentType     — 'slideshow' | 'carousel' | 'data_story' | etc
 *   slideIndex      — position of the new slide (0-based)
 *   contextCaption? — overall caption context (hook/body/CTA joined)
 *   previousSlides? — captions for slides that come before this one
 *
 * Response:
 *   { caption: string }
 *
 * Never returns 5xx to the client — falls back to a derived caption on any
 * Claude / auth failure so the editor UX never breaks.
 */

type Body = {
  imageUrl?: string;
  contentType?: string;
  slideIndex?: number;
  contextCaption?: string;
  previousSlides?: string[];
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

function fallbackCaption(body: Body): string {
  const lines = (body.contextCaption || '').split(/\n+/).map(l => l.trim()).filter(Boolean);
  const idx = Math.max(0, body.slideIndex ?? 0);
  if (lines[idx]) return lines[idx].slice(0, 90);
  if (lines[0]) return lines[0].slice(0, 90);
  return 'Add your caption here.';
}

export async function POST(request: NextRequest) {
  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    // ignore — treat as empty
  }

  const { imageUrl, contentType = 'slideshow', slideIndex = 0, contextCaption, previousSlides } = body;

  if (!imageUrl || typeof imageUrl !== 'string') {
    return NextResponse.json({ caption: fallbackCaption(body) });
  }

  try {
    const { error, orgId } = await getAuthContext();
    if (error) {
      return NextResponse.json({ caption: fallbackCaption(body) });
    }

    const db = await getDb();
    const [profile] = await db
      .select({
        brandName: brandProfileSchema.brandName,
        industry: brandProfileSchema.industry,
        toneFormality: brandProfileSchema.toneFormality,
        toneHumor: brandProfileSchema.toneHumor,
        toneEnergy: brandProfileSchema.toneEnergy,
      })
      .from(brandProfileSchema)
      .where(eq(brandProfileSchema.orgId, orgId!))
      .limit(1);

    const brandName = profile?.brandName || 'the brand';
    const industry = profile?.industry || 'general';
    const brandTone = deriveBrandTone(
      profile?.toneFormality ?? 5,
      profile?.toneHumor ?? 5,
      profile?.toneEnergy ?? 5,
    );

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ caption: fallbackCaption(body) });
    }

    const previousLines = (previousSlides || [])
      .map((s, i) => `Slide ${i + 1}: ${s}`)
      .join('\n');

    const prompt = `You write short-form social captions for ${brandName} (industry: ${industry}, tone: ${brandTone}).

Task: Write ONE caption for slide ${slideIndex + 1} of a ${contentType} post. The caption sits over the image shown.

Overall post context:
${contextCaption || '(no context provided)'}

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

    const client = new Anthropic({ apiKey });
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
              source: { type: 'url', url: imageUrl },
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

    if (!text) {
      return NextResponse.json({ caption: fallbackCaption(body) });
    }

    // Strip surrounding quotes / trailing punctuation clutter, cap to 90 chars.
    const clean = text
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/^Slide\s*\d+:\s*/i, '')
      .trim()
      .slice(0, 90);

    return NextResponse.json({ caption: clean || fallbackCaption(body) });
  } catch (err) {
    console.error('[generate-slide-copy] failed:', err);
    return NextResponse.json({ caption: fallbackCaption(body) });
  }
}
