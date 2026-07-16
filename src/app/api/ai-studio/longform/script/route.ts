import Anthropic from '@anthropic-ai/sdk';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getDb } from '@/libs/DB';
import { longFormProjectSchema } from '@/models/Schema';

export const dynamic = 'force-dynamic';

const STYLE_LABELS: Record<string, string> = {
  cinematic: 'Cinematic — dramatic lighting, film-like composition, slow camera movements',
  documentary: 'Documentary — natural lighting, observational style, handheld feel',
  social_media: 'Social Media — fast-paced, vertical format, attention-grabbing transitions',
  corporate: 'Corporate — clean, professional, polished presentation style',
  educational: 'Educational — clear visuals, instructional tone, step-by-step structure',
};

// ── Struct shared across providers ──

type ParsedScript = {
  title?: string;
  narrationText?: string;
  scenes?: Array<{
    description?: string;
    visualPrompt?: string;
    cameraDirection?: string;
    durationSec?: number;
    transition?: string;
  }>;
};

function buildSystemPrompt(clampedDuration: number, targetWords: number, styleDesc: string): string {
  return `You are a professional video director and scriptwriter. Create a detailed video script and scene breakdown for the given topic.

RULES:
- The final video should be approximately ${clampedDuration} minutes long.
- Narration should be ~${targetWords} words (spoken at ~150 words/minute).
- Break the video into 8–20 scenes. Each scene should be 5–15 seconds.
- Every scene must have a distinct visual that can be generated as a keyframe image.
- Camera directions must be one of: static, pan_left, pan_right, zoom_in, zoom_out, dolly.
- Transitions must be: cut, fade, or dissolve.
- Style: ${styleDesc}

Return ONLY valid JSON (no markdown wrapping) with exactly this structure:
{
  "title": "compelling video title",
  "narrationText": "full voiceover narration script, ~${targetWords} words",
  "scenes": [
    {
      "description": "what happens in this scene",
      "visualPrompt": "detailed keyframe image generation prompt with lighting, composition, color palette, subject",
      "cameraDirection": "static",
      "durationSec": 8,
      "transition": "cut"
    }
  ]
}`;
}

function parseTextResponse(raw: string): ParsedScript {
  const jsonStr = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(jsonStr);
}

// ── Provider helpers ──

async function callClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    temperature: 0.7,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  return response.content
    .filter(c => c.type === 'text')
    .map(c => (c as { text: string }).text)
    .join(' ')
    .trim();
}

async function callDeepSeek(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not configured');
  const baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

  const res = await fetch(`${baseURL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DeepSeek API error (${res.status}): ${text}`);
  }

  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content?.trim() || '';
}

async function callOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  const model = process.env.OPENAI_FALLBACK_MODEL || 'gpt-4o-mini';

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI API error (${res.status}): ${text}`);
  }

  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content?.trim() || '';
}

// ── Post-processing (same for every provider) ──

function processParsedScript(parsed: ParsedScript) {
  if (!parsed.scenes || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error('AI did not return any scenes. Please try again with a more specific topic.');
  }

  const validCameraDirections = ['static', 'pan_left', 'pan_right', 'zoom_in', 'zoom_out', 'dolly'];
  const validTransitions = ['cut', 'fade', 'dissolve'];

  return parsed.scenes.map((s, i) => ({
    id: crypto.randomUUID(),
    order: i,
    description: (s.description || `Scene ${i + 1}`).trim(),
    visualPrompt: (s.visualPrompt || s.description || `Scene ${i + 1}`).trim(),
    cameraDirection: validCameraDirections.includes(String(s.cameraDirection || ''))
      ? String(s.cameraDirection)
      : 'static',
    durationSec: Math.max(5, Math.min(15, Number(s.durationSec) || 8)),
    transition: validTransitions.includes(String(s.transition || ''))
      ? String(s.transition)
      : 'cut',
    status: 'pending' as const,
  }));
}

// ── Route ──

export async function POST(request: NextRequest) {
  const { error, orgId, userId } = await getAuthContext();
  if (error) return error;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const topic = String(body.topic || '').trim();
  if (!topic || topic.length < 10) {
    return NextResponse.json({ error: 'Topic must be at least 10 characters' }, { status: 400 });
  }
  if (topic.length > 500) {
    return NextResponse.json({ error: 'Topic must be under 500 characters' }, { status: 400 });
  }

  const style = (String(body.style || 'cinematic')).trim();
  const styleDesc = STYLE_LABELS[style] ?? 'Cinematic dramatic lighting, film-like composition, slow camera movements';
  const targetDurationMin = Number(body.targetDurationMin) || 2;
  const clampedDuration = Math.max(1, Math.min(10, targetDurationMin));
  const targetWords = clampedDuration * 150;

  // Optional initial metadata (aspect / models / reference image / voice).
  const rawAspect = String(body.aspectRatio || '9:16');
  const aspectRatio = (rawAspect === '9:16' || rawAspect === '16:9' || rawAspect === '1:1') ? rawAspect : '9:16';
  const initialMetadata: Record<string, unknown> = { aspectRatio };
  if (typeof body.imageModelId === 'string' && body.imageModelId.trim()) initialMetadata.imageModelId = body.imageModelId.trim();
  if (typeof body.videoModelId === 'string' && body.videoModelId.trim()) initialMetadata.videoModelId = body.videoModelId.trim();
  if (typeof body.voiceId === 'string' && body.voiceId.trim()) initialMetadata.voiceId = body.voiceId.trim();
  if (typeof body.referenceImageUrl === 'string' && body.referenceImageUrl.trim()) initialMetadata.referenceImageUrl = body.referenceImageUrl.trim();

  const systemPrompt = buildSystemPrompt(clampedDuration, targetWords, styleDesc);
  const userPrompt = `Create a ${clampedDuration}-minute video script about: ${topic}`;

  // Try providers in order: Claude → DeepSeek → OpenAI
  const errors: string[] = [];
  let rawText = '';

  // 1. Claude
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      rawText = await callClaude(systemPrompt, userPrompt);
    } catch (claudeErr) {
      const msg = claudeErr instanceof Error ? claudeErr.message : String(claudeErr);
      errors.push(`Claude: ${msg}`);
      console.warn('[LongForm Script] Claude failed, trying DeepSeek fallback:', msg);
    }
  } else {
    errors.push('Claude: ANTHROPIC_API_KEY not set');
  }

  // 2. DeepSeek
  if (!rawText && process.env.DEEPSEEK_API_KEY) {
    try {
      rawText = await callDeepSeek(systemPrompt, userPrompt);
      console.info('[LongForm Script] Using DeepSeek fallback');
    } catch (dsErr) {
      const msg = dsErr instanceof Error ? dsErr.message : String(dsErr);
      errors.push(`DeepSeek: ${msg}`);
      console.warn('[LongForm Script] DeepSeek failed, trying OpenAI fallback:', msg);
    }
  }

  // 3. OpenAI
  if (!rawText && process.env.OPENAI_API_KEY) {
    try {
      rawText = await callOpenAI(systemPrompt, userPrompt);
      console.info('[LongForm Script] Using OpenAI fallback');
    } catch (oaErr) {
      const msg = oaErr instanceof Error ? oaErr.message : String(oaErr);
      errors.push(`OpenAI: ${msg}`);
      console.error('[LongForm Script] All providers failed:', msg);
    }
  }

  if (!rawText) {
    const detail = errors.join(' | ');
    return NextResponse.json(
      { error: `Script generation failed. ${detail}` },
      { status: 500 },
    );
  }

  // Parse response
  let parsed: ParsedScript;
  try {
    parsed = parseTextResponse(rawText);
  } catch {
    return NextResponse.json(
      { error: 'Failed to parse script from AI. Please try again.' },
      { status: 500 },
    );
  }

  let scenes: ReturnType<typeof processParsedScript>;
  try {
    scenes = processParsedScript(parsed);
  } catch (procErr) {
    return NextResponse.json(
      { error: procErr instanceof Error ? procErr.message : 'Invalid scene data from AI' },
      { status: 500 },
    );
  }

  const db = await getDb();
  const [project] = await db
    .insert(longFormProjectSchema)
    .values({
      orgId: orgId!,
      userId: userId ?? null,
      title: (parsed.title || topic).slice(0, 80),
      topic,
      script: rawText,
      narrationText: parsed.narrationText || '',
      scenes,
      status: 'script_ready',
      metadata: initialMetadata,
    })
    .returning();

  if (!project) {
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }

  return NextResponse.json({
    project: {
      id: project.id,
      orgId: project.orgId,
      title: project.title,
      topic: project.topic,
      narrationText: project.narrationText,
      scenes,
      status: project.status,
      creditsReserved: project.creditsReserved,
      metadata: project.metadata,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
  });
}
