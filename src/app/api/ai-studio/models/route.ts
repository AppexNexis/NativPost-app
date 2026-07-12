/**
 * GET /api/ai-studio/models
 *
 * Returns the AI Studio catalog: the model registry (single source of truth
 * for FLUX, GPT Image 2, Pixverse, Kling, Seedance, Veed lipsync), templates,
 * aspects, durations, voices, and languages.
 */

import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import {
  AI_STUDIO_MODELS,
  AI_STUDIO_TEMPLATES,
  DURATIONS,
  FORMATS,
  IMAGE_QUANTITY,
  LANGUAGES,
} from '@/lib/ai-studio';

// Voices supported by veed/lipsync (client-provided audio) and future TTS pipeline.
const VOICES = [
  { id: 'alloy', label: 'Alloy', description: 'Neutral, versatile' },
  { id: 'echo', label: 'Echo', description: 'Warm, conversational' },
  { id: 'fable', label: 'Fable', description: 'Expressive, storytelling' },
  { id: 'onyx', label: 'Onyx', description: 'Deep, authoritative' },
  { id: 'nova', label: 'Nova', description: 'Bright, energetic' },
  { id: 'shimmer', label: 'Shimmer', description: 'Soft, friendly' },
];

export const dynamic = 'force-dynamic';

export async function GET() {
  const { error } = await getAuthContext();
  if (error) return error;

  const res = NextResponse.json({
    models: AI_STUDIO_MODELS,
    templates: AI_STUDIO_TEMPLATES,
    formats: FORMATS,
    durations: DURATIONS,
    imageQuantities: IMAGE_QUANTITY,
    languages: LANGUAGES,
    voices: VOICES,
  });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
