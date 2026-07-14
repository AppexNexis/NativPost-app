import Anthropic from '@anthropic-ai/sdk';
import { and, eq, or } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { aiInfluencerSchema, contentAngleSchema, influencerAngleSchema } from '@/models/Schema';

type RouteParams = { params: Promise<{ id: string }> };

const VALID_DURATIONS = [5, 8, 10] as const;

const ARCHETYPE_DEFAULT_ANGLES: Record<string, Array<{ name: string; description: string }>> = {
  journey: [
    { name: 'Behind the scenes', description: 'A candid look at process, setup, or daily workflow.' },
    { name: 'Day in the life', description: 'A chronological walkthrough of a typical day or routine.' },
    { name: 'Transformation', description: 'Before/after, journey milestones, or personal growth arc.' },
  ],
  theme: [
    { name: 'Educational breakdown', description: 'Teaches a concept, framework, or skill in under 60s.' },
    { name: 'Trending topic', description: 'Hot take or reaction to a current industry/niche topic.' },
    { name: 'Hot take / opinion', description: 'Strong, polarizing viewpoint designed to spark debate.' },
  ],
  spinoff: [
    { name: 'Reaction / duet', description: 'Reacting to or building on someone else\'s content.' },
    { name: 'Remix', description: 'Reinterpreting a popular format or trend with your own spin.' },
    { name: 'Reply to comment', description: 'Turning a viewer comment or question into a full post.' },
  ],
};

function wordTarget(duration: number): number {
  switch (duration) {
    case 5: return 13;
    case 8: return 20;
    case 10: return 25;
    default: return 20;
  }
}

// -----------------------------------------------------------
// POST /api/ai-influencers/[id]/generate-scripts
// Batch-generate persona-aware scripts for all (or specified)
// assigned content angles. One Claude call per angle.
//
// Body:
//   angleIds? — subset of assigned angle IDs (default: all assigned)
//   duration? — 5 | 8 | 10 seconds (default 5)
//   topic?    — optional override topic
//
// Response:
//   { scripts: [{ angleId, angleName, hookText, bodyText, ctaText, script }] }
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
  const requestedAngleIds = (body.angleIds as string[] | undefined) || [];
  const duration = VALID_DURATIONS.includes(body.duration as typeof VALID_DURATIONS[number])
    ? (body.duration as typeof VALID_DURATIONS[number])
    : 5;

  // ── Fetch assigned angles ───────────────────────────────────────
  const angleRows = await db
    .select({
      angleId: influencerAngleSchema.contentAngleId,
      name: contentAngleSchema.name,
      description: contentAngleSchema.description,
    })
    .from(influencerAngleSchema)
    .leftJoin(contentAngleSchema, eq(influencerAngleSchema.contentAngleId, contentAngleSchema.id))
    .where(eq(influencerAngleSchema.influencerId, id))
    .orderBy(influencerAngleSchema.weight);

  const angles = angleRows
    .filter(r => r.angleId && r.name)
    .filter(r => requestedAngleIds.length === 0 || requestedAngleIds.includes(r.angleId!));

  // Fall back to archetype-default angles when no angles are assigned
  // but the influencer has an archetype (journey|theme|spinoff).
  if (angles.length === 0 && influencer.archetype) {
    const defaults = ARCHETYPE_DEFAULT_ANGLES[influencer.archetype];
    if (defaults) {
      angles.push(...defaults.map((d, i) => ({
        angleId: `__archetype_${influencer.archetype}_${i}`,
        name: d.name,
        description: d.description,
      })));
    }
  }

  if (angles.length === 0) {
    return NextResponse.json(
      { error: 'No assigned angles found. Assign angles first.' },
      { status: 400 },
    );
  }

  // ── Build trait context ─────────────────────────────────────────
  const traitParts: string[] = [];
  if (influencer.gender) traitParts.push(influencer.gender);
  if (influencer.ageRange) traitParts.push(`age ${influencer.ageRange}`);
  if (influencer.ethnicity) traitParts.push(influencer.ethnicity);
  const traits = traitParts.join(', ');
  const wordCount = wordTarget(duration);

  // ── Claude config ───────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 500 });
  }
  const client = new Anthropic({ apiKey });

  const personaBlock = influencer.personaPrompt
    ? `\nVOICE & STYLE:\n${influencer.personaPrompt}`
    : '';

  // ── Generate one script per angle ───────────────────────────────
  const scripts: Array<{
    angleId: string;
    angleName: string;
    hookText: string;
    bodyText: string;
    ctaText: string;
    script: string;
  }> = [];

  for (const angle of angles) {
    const subject = topic || angle.name || 'a relevant topic';
    const angleBlock = angle.description
      ? `\nCONTENT ANGLE: "${angle.name}" — ${angle.description}`
      : `\nCONTENT ANGLE: "${angle.name}"`;

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

    try {
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

      const jsonStr = text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      let parsed: { hookText?: string; bodyText?: string; ctaText?: string };
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
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

      scripts.push({
        angleId: angle.angleId!,
        angleName: angle.name!,
        hookText,
        bodyText,
        ctaText,
        script,
      });
    } catch (err) {
      // One angle fails → skip it, continue with others
      console.error(`[Influencer] Batch script failed for angle ${angle.name}:`, err);
    }
  }

  return NextResponse.json({ scripts });
}
