import Anthropic from '@anthropic-ai/sdk';
import { and, eq, or } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { aiInfluencerSchema, contentAngleSchema } from '@/models/Schema';

type RouteParams = { params: Promise<{ id: string }> };

const VALID_DURATIONS = [5, 8, 10] as const;

// Word targets: ~150 wpm → 5s≈13 words, 8s≈20 words, 10s≈25 words total.
function wordTarget(duration: number): number {
  switch (duration) {
    case 5: return 13;
    case 8: return 20;
    case 10: return 25;
    default: return 20;
  }
}

// -----------------------------------------------------------
// POST /api/ai-influencers/[id]/generate-script
// Generate a persona-aware short-form talking-head script using Claude.
//
// Body:
//   topic?    — what the influencer should talk about
//   angleId?  — content angle ID for additional topic context
//   duration? — 5 | 8 | 10 seconds (default 5)
//
// Response:
//   { script, hookText, bodyText, ctaText }
// -----------------------------------------------------------
export async function POST(request: NextRequest, { params }: RouteParams) {
  const db = await getDb();
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id } = await params;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // ── Influencer lookup ───────────────────────────────────────────
  const [influencer] = await db
    .select()
    .from(aiInfluencerSchema)
    .where(and(
      eq(aiInfluencerSchema.id, id),
      or(eq(aiInfluencerSchema.orgId, orgId!), eq(aiInfluencerSchema.isSystem, true)),
    ))
    .limit(1);

  if (!influencer) {
    return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
  }

  // ── Parse inputs ────────────────────────────────────────────────
  const topic = String(body.topic || '').trim();
  const angleId = String(body.angleId || '').trim();
  const duration = VALID_DURATIONS.includes(body.duration as typeof VALID_DURATIONS[number])
    ? (body.duration as typeof VALID_DURATIONS[number])
    : 5;

  // ── Resolve angle context ───────────────────────────────────────
  let angleTitle = '';
  let angleDescription = '';
  if (angleId) {
    const [angle] = await db
      .select({ name: contentAngleSchema.name, description: contentAngleSchema.description })
      .from(contentAngleSchema)
      .where(and(
        eq(contentAngleSchema.id, angleId),
        or(eq(contentAngleSchema.orgId, orgId!), eq(contentAngleSchema.isSystem, true)),
      ))
      .limit(1);
    if (angle) {
      angleTitle = angle.name;
      angleDescription = angle.description || '';
    }
  }

  const subject = topic || angleTitle || 'a relevant topic for the audience';

  // ── Build persona traits string ─────────────────────────────────
  const traitParts: string[] = [];
  if (influencer.gender) traitParts.push(influencer.gender);
  if (influencer.ageRange) traitParts.push(`age ${influencer.ageRange}`);
  if (influencer.ethnicity) traitParts.push(influencer.ethnicity);
  const traits = traitParts.join(', ');

  const wordCount = wordTarget(duration);

  // ── Build prompt ────────────────────────────────────────────────
  const personaBlock = influencer.personaPrompt
    ? `\nVOICE & STYLE:\n${influencer.personaPrompt}`
    : '';
  const angleBlock = angleTitle
    ? `\nCONTENT ANGLE: "${angleTitle}"${angleDescription ? ` — ${angleDescription}` : ''}`
    : '';

  const prompt = `You write short-form social scripts for a content creator named ${influencer.name}${traits ? ` (${traits})` : ''}.${personaBlock}${angleBlock}

TASK: Write a ${duration}-second talking-head script (~${wordCount} words total) about: ${subject}.

RULES:
- Hook-first: the first sentence must be a scroll-stopper.
- No hashtags, no emojis, no markdown.
- Speak in ${influencer.name}'s natural voice — never corporate or AI-generic.
- Do not use the creator's name in the script.
- The CTA is optional — only include it if it feels natural.

Return ONLY valid JSON with exactly these keys:
{
  "hookText": "short hook (one sentence that grabs attention)",
  "bodyText": "main body (the key point or insight)",
  "ctaText": "call to action or empty string if not needed"
}

Do not wrap the JSON in markdown. Do not add any other text.`;

  // ── Call Claude ─────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 500 });
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      temperature: 0.8,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter(c => c.type === 'text')
      .map(c => (c as { text: string }).text)
      .join(' ')
      .trim();

    if (!text) {
      return NextResponse.json({ error: 'Claude returned empty response' }, { status: 502 });
    }

    // Parse JSON response (strip markdown code fences if present)
    const jsonStr = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let parsed: { hookText?: string; bodyText?: string; ctaText?: string };
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      // Fallback: treat whole text as body
      const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
      parsed = {
        hookText: sentences[0]?.slice(0, 100) || '',
        bodyText: sentences.slice(1).join(' ').slice(0, 300) || '',
        ctaText: '',
      };
    }

    const hookText = (parsed.hookText || '').trim().slice(0, 120);
    const bodyText = (parsed.bodyText || '').trim().slice(0, 400);
    const ctaText = (parsed.ctaText || '').trim().slice(0, 80);
    const script = [hookText, bodyText, ctaText].filter(Boolean).join(' ');

    return NextResponse.json({ script, hookText, bodyText, ctaText });
  } catch (err) {
    console.error('[Influencer] Script generation failed:', err);
    return NextResponse.json(
      { error: `Script generation failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
}
