// Thin ElevenLabs Voice API wrapper: preview URLs + Instant Voice Cloning.
// Kept separate from src/lib/ai-studio/elevenlabs.ts (TTS) so influencer
// features don't depend on the TTS-plus-Cloudinary storage pipeline.

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY || '';
  if (!key) {
    throw new Error('ELEVENLABS_API_KEY is not set');
  }
  return key;
}

/**
 * Fetch the hosted mp3 preview URL for a voice. Free; no TTS credits spent.
 * Returns null on any error so callers can degrade gracefully.
 */
export async function fetchVoicePreviewUrl(voiceId: string): Promise<string | null> {
  try {
    const res = await fetch(`${ELEVENLABS_BASE}/v1/voices/${voiceId}`, {
      method: 'GET',
      headers: { 'xi-api-key': apiKey() },
      // Voice metadata rarely changes; let the CDN cache us.
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) {
      return null;
    }
    const data = await res.json() as { preview_url?: string };
    return data.preview_url || null;
  } catch {
    return null;
  }
}

/**
 * Instant Voice Cloning: download an audio sample, POST it to ElevenLabs,
 * return the new voice_id and preview URL. Requires Starter+ plan.
 */
export async function cloneVoiceFromUrl(opts: {
  name: string;
  audioUrl: string;
  description?: string;
  labels?: Record<string, string>;
}): Promise<{ voiceId: string; previewUrl: string | null }> {
  const { name, audioUrl, description, labels } = opts;

  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) {
    throw new Error(`Failed to download voice sample (${audioRes.status})`);
  }
  const audioBlob = await audioRes.blob();
  const filename = audioUrl.split('/').pop()?.split('?')[0] || 'sample.mp3';

  const form = new FormData();
  form.append('name', name);
  if (description) {
    form.append('description', description);
  }
  form.append('files', audioBlob, filename);
  if (labels) {
    form.append('labels', JSON.stringify(labels));
  }

  const res = await fetch(`${ELEVENLABS_BASE}/v1/voices/add`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey() },
    body: form,
  });

  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    let msg = raw;
    try {
      const parsed = JSON.parse(raw);
      msg = parsed?.detail?.message || parsed?.detail?.status || parsed?.message || raw;
    } catch {
      // keep raw
    }
    throw new Error(`ElevenLabs clone failed (${res.status}): ${msg}`);
  }

  const data = await res.json() as { voice_id?: string };
  const voiceId = data.voice_id;
  if (!voiceId) {
    throw new Error('ElevenLabs did not return a voice_id');
  }

  const previewUrl = await fetchVoicePreviewUrl(voiceId);
  return { voiceId, previewUrl };
}

/**
 * Best-effort delete on ElevenLabs. Swallows 404 so soft-delete rows can be
 * cleaned up even if the upstream voice was already removed.
 */
export async function deleteElevenLabsVoice(voiceId: string): Promise<void> {
  try {
    const res = await fetch(`${ELEVENLABS_BASE}/v1/voices/${voiceId}`, {
      method: 'DELETE',
      headers: { 'xi-api-key': apiKey() },
    });
    if (!res.ok && res.status !== 404) {
      // Non-fatal; log for observability.
      const raw = await res.text().catch(() => '');
      console.warn('[ElevenLabs] delete voice failed:', res.status, raw.slice(0, 200));
    }
  } catch (err) {
    console.warn('[ElevenLabs] delete voice threw:', err);
  }
}
