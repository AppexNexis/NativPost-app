/**
 * GET /api/ai-studio/models
 *
 * Returns the catalog of available AI models, formats, voices, and durations
 * for the AI Studio UI. Sourced from src/lib/ai-studio.ts so the client and
 * server share a single source of truth.
 *
 * This lets the UI render model pickers without hard-coding lists, and lets
 * future plan-gating (e.g. premium models locked behind Pro plan) be applied
 * server-side without shipping a new client build.
 */

import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import {
  DURATIONS,
  FORMATS,
  IMAGE_MODELS,
  IMAGE_QUANTITY,
  IMAGE_TEMPLATES,
  LANGUAGES,
  VIDEO_MODELS,
  VIDEO_TEMPLATES,
} from '@/lib/ai-studio';

// Voices supported by the video-renderer /render/voiceover endpoint (OpenAI TTS).
const VOICES = [
  { id: 'alloy', label: 'Alloy', description: 'Neutral, versatile' },
  { id: 'echo', label: 'Echo', description: 'Warm, conversational' },
  { id: 'fable', label: 'Fable', description: 'Expressive, storytelling' },
  { id: 'onyx', label: 'Onyx', description: 'Deep, authoritative' },
  { id: 'nova', label: 'Nova', description: 'Bright, energetic' },
  { id: 'shimmer', label: 'Shimmer', description: 'Soft, friendly' },
];

export async function GET() {
  const { error } = await getAuthContext();
  if (error) return error;

  return NextResponse.json({
    imageModels: IMAGE_MODELS,
    videoModels: VIDEO_MODELS,
    formats: FORMATS,
    durations: DURATIONS,
    imageQuantities: IMAGE_QUANTITY,
    imageTemplates: IMAGE_TEMPLATES,
    videoTemplates: VIDEO_TEMPLATES,
    languages: LANGUAGES,
    voices: VOICES,
  });
}
