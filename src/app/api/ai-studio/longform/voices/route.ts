import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type ElevenLabsVoice = {
  voice_id: string;
  name: string;
  labels?: Record<string, string>;
  preview_url?: string;
  category?: string;
};

// Curated fallback list — used when ELEVENLABS_API_KEY isn't set. Keeps the
// picker usable in dev without network keys.
const FALLBACK_VOICES = [
  { voiceId: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', category: 'premade', accent: 'american' },
  { voiceId: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', category: 'premade', accent: 'american' },
  { voiceId: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', category: 'premade', accent: 'american' },
  { voiceId: 'ErXwobaYiN019PkySvjV', name: 'Antoni', category: 'premade', accent: 'american' },
  { voiceId: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', category: 'premade', accent: 'american' },
  { voiceId: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', category: 'premade', accent: 'american' },
  { voiceId: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', category: 'premade', accent: 'american' },
];

export async function GET(_request: NextRequest) {
  const { error } = await getAuthContext();
  if (error) return error;

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ voices: FALLBACK_VOICES, source: 'fallback' });
  }

  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': apiKey },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return NextResponse.json({ voices: FALLBACK_VOICES, source: 'fallback' });
    }

    const data = await res.json() as { voices?: ElevenLabsVoice[] };
    const voices = (data.voices || []).map(v => ({
      voiceId: v.voice_id,
      name: v.name,
      category: v.category || 'premade',
      accent: v.labels?.accent || v.labels?.language || '',
      previewUrl: v.preview_url,
    }));

    return NextResponse.json({ voices, source: 'live' });
  } catch (err) {
    console.warn('[LongForm Voices] Failed to fetch ElevenLabs voices:', err);
    return NextResponse.json({ voices: FALLBACK_VOICES, source: 'fallback' });
  }
}
