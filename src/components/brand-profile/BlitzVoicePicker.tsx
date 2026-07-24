'use client';

import { Check, Loader2, Pause, Play, Sparkles, Volume2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { BrandProfileData } from '@/features/brand-profile/useBrandProfile';

// Shape returned by /api/ai-studio/longform/voices
type Voice = {
  voiceId: string;
  name: string;
  category: string;
  accent: string;
  previewUrl?: string;
};

type Props = {
  data: BrandProfileData;
  updateData: (updates: Partial<BrandProfileData>) => void;
  save: () => Promise<boolean>;
  isSaving: boolean;
};

// Heuristic default picker — matches persona knobs to a curated voice.
// Real AI-recommend endpoint deferred to Phase A.1.
function recommendVoiceId(data: BrandProfileData, voices: Voice[]): string | null {
  if (voices.length === 0) {
    return null;
  }
  const { toneFormality = 5, toneEnergy = 5 } = data;
  // Formal + calm → Rachel (professional). Casual + energetic → Josh.
  // Balanced → Sarah (multipurpose default).
  const preferred = toneFormality >= 7
    ? 'Rachel'
    : toneEnergy >= 7
      ? 'Josh'
      : 'Sarah';
  const match = voices.find(v => v.name === preferred);
  return match?.voiceId || voices[0]!.voiceId;
}

export function BlitzVoicePicker({ data, updateData, save, isSaving }: Props) {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/ai-studio/longform/voices', { cache: 'force-cache' });
        if (!res.ok) {
          throw new Error(`Failed to load voices (${res.status})`);
        }
        const json = await res.json() as { voices: Voice[] };
        if (!cancelled) {
          setVoices(json.voices || []);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load voices');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const stopPreview = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingId(null);
  }, []);

  const playPreview = useCallback((voice: Voice) => {
    stopPreview();
    if (!voice.previewUrl) {
      return;
    }
    const audio = new Audio(voice.previewUrl);
    audio.onended = () => {
      setPlayingId(null);
      audioRef.current = null;
    };
    audio.onerror = () => {
      setPlayingId(null);
      audioRef.current = null;
    };
    audioRef.current = audio;
    setPlayingId(voice.voiceId);
    void audio.play().catch(() => {
      setPlayingId(null);
      audioRef.current = null;
    });
  }, [stopPreview]);

  useEffect(() => stopPreview, [stopPreview]);

  const selectVoice = useCallback(async (voiceId: string) => {
    updateData({ elevenlabsVoiceId: voiceId });
    // Save is called synchronously so status flips immediately in the UI.
    const ok = await save();
    if (ok) {
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    }
  }, [updateData, save]);

  const handleRecommend = useCallback(() => {
    const recommended = recommendVoiceId(data, voices);
    if (recommended) {
      void selectVoice(recommended);
    }
  }, [data, voices, selectVoice]);

  const selectedVoice = voices.find(v => v.voiceId === data.elevenlabsVoiceId);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-meta text-muted-foreground">
            Pick an ElevenLabs voice for Blitz video posts. It plays over generated video content when the killswitch is on.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRecommend}
          disabled={isLoading || isSaving || voices.length === 0}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          title="Suggest a voice based on your Voice & tone settings"
        >
          <Sparkles className="size-3.5" />
          Suggest for me
        </button>
      </div>

      {selectedVoice && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <Volume2 className="size-4 text-primary" />
          <span className="text-sm font-medium">
            Current:
            {' '}
            {selectedVoice.name}
          </span>
          {selectedVoice.accent && (
            <span className="text-xs text-muted-foreground">
              ·
              {' '}
              {selectedVoice.accent}
            </span>
          )}
          {showSaved && (
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-green-600">
              <Check className="size-3" />
              Saved
            </span>
          )}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading voice library
        </div>
      )}

      {loadError && (
        <p className="text-xs text-destructive">
          Couldn&rsquo;t load ElevenLabs voices:
          {' '}
          {loadError}
        </p>
      )}

      {!isLoading && !loadError && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {voices.map((voice) => {
            const isSelected = voice.voiceId === data.elevenlabsVoiceId;
            const isPlaying = playingId === voice.voiceId;
            return (
              <li
                key={voice.voiceId}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                  isSelected ? 'border-primary bg-primary/5' : 'border-border bg-background hover:bg-muted/50'
                }`}
              >
                <button
                  type="button"
                  onClick={() => (isPlaying ? stopPreview() : playPreview(voice))}
                  disabled={!voice.previewUrl}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted disabled:opacity-40"
                  title={voice.previewUrl ? 'Preview' : 'No preview available'}
                >
                  {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{voice.name}</p>
                  {voice.accent && (
                    <p className="truncate text-xs text-muted-foreground">{voice.accent}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void selectVoice(voice.voiceId)}
                  disabled={isSaving || isSelected}
                  className={`shrink-0 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    isSelected
                      ? 'border border-primary/30 bg-primary/10 text-primary'
                      : 'border border-border bg-background text-foreground hover:bg-muted'
                  } disabled:opacity-60`}
                >
                  {isSelected ? 'Selected' : 'Use'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
