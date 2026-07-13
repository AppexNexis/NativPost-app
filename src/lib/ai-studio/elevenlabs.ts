// ElevenLabs Text-to-Speech helper.
// Takes a script + voice_id, returns a Cloudinary-hosted audio URL
// that fal.ai lip-sync endpoints can consume.

import { saveMediaAsset } from './server';
import { storeAudioRender } from './cloudinary';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY || '';
  if (!key) {
    throw new Error('ELEVENLABS_API_KEY is not set');
  }
  return key;
}

export type TtsResult = {
  audioUrl: string;
  durationSec: number | null;
  cloudinaryPublicId: string;
  mediaAssetId: string | null;
};

export type ElevenLabsVoiceSettings = {
  stability?: number; // 0-1, default 0.5
  similarity_boost?: number; // 0-1, default 0.75
  style?: number; // 0-1, default 0
  speaker_boost?: boolean;
};

/**
 * Convert text to speech using an ElevenLabs voice.
 *
 * @param text  The script content (up to 5000 chars).
 * @param voiceId  ElevenLabs voice ID (e.g. EXAVITQu4vr4xnSDxMaL for Sarah).
 * @param settings  Optional voice settings overrides.
 * @param modelId  TTS model. Defaults to eleven_multilingual_v2 (best for stock voices).
 * @param orgId  Org ID for Cloudinary folder scoping.
 * @param prefix  Public ID prefix for the Cloudinary asset (default: `tts`).
 */
export async function textToSpeech(opts: {
  text: string;
  voiceId: string;
  settings?: ElevenLabsVoiceSettings;
  modelId?: string;
  orgId: string;
  prefix?: string;
}): Promise<TtsResult> {
  const { text, voiceId, settings, modelId, orgId, prefix = 'tts' } = opts;

  if (!text.trim()) {
    throw new Error('text is required for TTS');
  }
  if (text.length > 5000) {
    throw new Error('text exceeds ElevenLabs 5000-character limit');
  }

  const key = apiKey();
  const model = modelId || 'eleven_multilingual_v2';

  const body: Record<string, unknown> = {
    text: text.trim(),
    model_id: model,
    voice_settings: {
      stability: settings?.stability ?? 0.5,
      similarity_boost: settings?.similarity_boost ?? 0.75,
      style: settings?.style ?? 0,
      speaker_boost: settings?.speaker_boost ?? true,
    },
  };

  const res = await fetch(`${ELEVENLABS_BASE}/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': key,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // ElevenLabs returns { detail: { status, message } } for errors
    let msg = detail;
    try {
      const parsed = JSON.parse(detail);
      msg = parsed?.detail?.message || parsed?.message || detail;
    } catch {
      // keep raw text
    }
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${msg}`);
  }

  const audioBuffer = Buffer.from(await res.arrayBuffer());
  const publicId = `${prefix}_${Date.now()}`;

  const stored = await storeAudioRender(
    audioBuffer,
    publicId,
    {
      source: 'elevenlabs-tts',
      voiceId,
      modelId: model,
      textHash: simpleHash(text),
    },
    orgId,
  );

  let mediaAssetId: string | null = null;
  try {
    const asset = await saveMediaAsset(orgId, {
      url: stored.url,
      thumbnailUrl: stored.url,
      assetType: 'audio',
      source: 'elevenlabs-tts',
      durationSeconds: stored.durationSeconds,
      mimeType: stored.mimeType,
      tags: ['elevenlabs-tts', `voice:${voiceId}`],
      aiMetadata: { voiceId, modelId, textLength: text.length },
    });
    mediaAssetId = asset.id;
  } catch {
    // Non-fatal: the audio URL is still valid without a media_asset row
  }

  return {
    audioUrl: stored.url,
    durationSec: stored.durationSeconds,
    cloudinaryPublicId: stored.publicId,
    mediaAssetId,
  };
}

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return Math.abs(hash).toString(36).slice(0, 8);
}
