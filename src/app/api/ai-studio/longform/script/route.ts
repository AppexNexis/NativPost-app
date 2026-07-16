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
  const styleDesc = STYLE_LABELS[style] || STYLE_LABELS.cinematic;
  const targetDurationMin = Number(body.targetDurationMin) || 2;
  const clampedDuration = Math.max(1, Math.min(5, targetDurationMin));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 500 });
  }

  const client = new Anthropic({ apiKey });
  const targetWords = clampedDuration * 150;

  const systemPrompt = `You are a professional video director and scriptwriter. Create a detailed video script and scene breakdown for the given topic.

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

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Create a ${clampedDuration}-minute video script about: ${topic}` }],
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

    let parsed: {
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

    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse script from AI. Please try again.' },
        { status: 500 },
      );
    }

    if (!parsed.scenes || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
      return NextResponse.json(
        { error: 'AI did not return any scenes. Please try again with a more specific topic.' },
        { status: 500 },
      );
    }

    const validCameraDirections = ['static', 'pan_left', 'pan_right', 'zoom_in', 'zoom_out', 'dolly'];
    const validTransitions = ['cut', 'fade', 'dissolve'];

    const scenes = parsed.scenes.map((s, i) => ({
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

    const db = await getDb();
    const [project] = await db
      .insert(longFormProjectSchema)
      .values({
        orgId: orgId!,
        userId: userId ?? null,
        title: parsed.title || topic.slice(0, 80),
        topic,
        script: text,
        narrationText: parsed.narrationText || '',
        scenes,
        status: 'script_ready',
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
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      },
    });
  } catch (err) {
    console.error('[LongForm Script] Claude generation failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Script generation failed' },
      { status: 500 },
    );
  }
}
