// Curated ElevenLabs stock voices exposed through the Influencer wizard and
// detail page. previewUrl is populated at request time by
// /api/ai-influencers/voices (see elevenlabs-voices.fetchVoicePreviewUrl).

export type CuratedVoice = {
  id: string;
  name: string;
  gender: 'female' | 'male' | 'non-binary';
  accent: string;
  vibe: string;
};

export const CURATED_VOICES: readonly CuratedVoice[] = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', gender: 'female', accent: 'american', vibe: 'warm' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', gender: 'female', accent: 'american', vibe: 'soft' },
  { id: 'ThT5KcBeYPX3keUQqHPh', name: 'Dorothy', gender: 'female', accent: 'american', vibe: 'friendly' },
  { id: 'LcfcDJNUP1GQjkzn1xUU', name: 'Emily', gender: 'female', accent: 'american', vibe: 'calm' },
  { id: 'jsCqWAovK2LkecY7zXl4', name: 'Freya', gender: 'female', accent: 'american', vibe: 'expressive' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', gender: 'female', accent: 'british', vibe: 'confident' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', gender: 'female', accent: 'british', vibe: 'sweet' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', gender: 'female', accent: 'american', vibe: 'warm' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', gender: 'male', accent: 'american', vibe: 'natural' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', gender: 'male', accent: 'american', vibe: 'deep' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', gender: 'male', accent: 'american', vibe: 'crisp' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', gender: 'male', accent: 'american', vibe: 'youthful' },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', gender: 'male', accent: 'american', vibe: 'raspy' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', gender: 'male', accent: 'british', vibe: 'authoritative' },
  { id: 'GBv7mTt0atIp3Br8iCZE', name: 'Thomas', gender: 'male', accent: 'american', vibe: 'meditative' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', gender: 'male', accent: 'american', vibe: 'gravelly' },
  { id: 'SOYHLrjzK2X1ezoPC6cr', name: 'Harry', gender: 'male', accent: 'american', vibe: 'anxious' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', gender: 'male', accent: 'american', vibe: 'articulate' },
  { id: 'D38z5RcWu1voky8WS1ja', name: 'Fin', gender: 'male', accent: 'irish', vibe: 'sailor' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', gender: 'male', accent: 'australian', vibe: 'chill' },
] as const;

export function findCuratedVoice(voiceId: string): CuratedVoice | undefined {
  return CURATED_VOICES.find(v => v.id === voiceId);
}
