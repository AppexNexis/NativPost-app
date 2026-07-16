'use client';

// AudioTrackPanel — picks narration voice (ElevenLabs via /voices proxy) and
// background music track (AudioSelectModal on top of /api/audio-library).
// Reads current selection from project.metadata and calls onChange with
// partial metadata patches for the orchestrator to persist via PATCH.

import { Loader2, Mic, Music2, Pause, Play, Volume2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AudioSelectModal, type AudioSelection } from '@/components/media/AudioSelectModal';
import { cn } from '@/utils/Helpers';
import type { LongFormProjectMetadata } from '@/types/longform';

type Voice = {
  voiceId: string;
  name: string;
  category?: string;
  accent?: string;
  previewUrl?: string;
};

type Props = {
  metadata: LongFormProjectMetadata;
  onChange: (patch: Partial<LongFormProjectMetadata>) => void;
  disabled?: boolean;
};

export function AudioTrackPanel({ metadata, onChange, disabled }: Props) {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [bgPickerOpen, setBgPickerOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingVoices(true);
      try {
        const res = await fetch('/api/ai-studio/longform/voices', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setVoices(Array.isArray(data.voices) ? data.voices : []);
      } catch {
        // fallback list served by API; nothing to do
      } finally {
        if (!cancelled) setLoadingVoices(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const stopPreview = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setPreviewingVoice(null);
  }, []);

  useEffect(() => () => stopPreview(), [stopPreview]);

  const previewVoice = useCallback((voice: Voice) => {
    if (!voice.previewUrl) return;
    if (previewingVoice === voice.voiceId) {
      stopPreview();
      return;
    }
    stopPreview();
    const el = new Audio(voice.previewUrl);
    audioRef.current = el;
    el.onended = () => setPreviewingVoice(null);
    el.play().then(() => setPreviewingVoice(voice.voiceId)).catch(() => setPreviewingVoice(null));
  }, [previewingVoice, stopPreview]);

  const selectVoice = (voice: Voice) => {
    onChange({ voiceId: voice.voiceId, voiceName: voice.name });
  };

  const clearVoice = () => {
    onChange({ voiceId: undefined, voiceName: undefined });
  };

  const handleBgSelect = (track: AudioSelection) => {
    onChange({ bgMusicUrl: track.url, bgMusicName: track.name });
    setBgPickerOpen(false);
  };

  const clearBg = () => {
    onChange({ bgMusicUrl: undefined, bgMusicName: undefined });
  };

  const currentVoice = voices.find(v => v.voiceId === metadata.voiceId);

  return (
    <div className="flex flex-col gap-4">
      {/* Narration voice */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Mic className="h-3.5 w-3.5 text-muted-foreground" />
          <label className="text-xs text-muted-foreground uppercase tracking-wider">Narration Voice</label>
          {loadingVoices && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto" />}
        </div>

        {metadata.voiceId && (
          <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-2 py-1.5">
            <Volume2 className="h-3 w-3 text-primary" />
            <span className="text-xs text-foreground truncate flex-1">
              {metadata.voiceName || currentVoice?.name || metadata.voiceId}
            </span>
            <button
              type="button"
              onClick={clearVoice}
              disabled={disabled}
              className="text-muted-foreground hover:text-destructive transition-colors"
              title="Clear voice selection"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        <div className="max-h-44 overflow-y-auto rounded-md border">
          {voices.length === 0 && !loadingVoices ? (
            <p className="p-3 text-[11px] text-muted-foreground text-center">No voices available.</p>
          ) : (
            <ul className="divide-y divide-border">
              {voices.map(v => {
                const active = metadata.voiceId === v.voiceId;
                const playing = previewingVoice === v.voiceId;
                return (
                  <li key={v.voiceId} className={cn('flex items-center gap-2 px-2 py-1.5', active && 'bg-primary/10')}>
                    <button
                      type="button"
                      onClick={() => selectVoice(v)}
                      disabled={disabled}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className="text-xs text-foreground truncate">{v.name}</p>
                      {(v.category || v.accent) && (
                        <p className="text-[10px] text-muted-foreground truncate">
                          {[v.category, v.accent].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </button>
                    {v.previewUrl && (
                      <button
                        type="button"
                        onClick={() => previewVoice(v)}
                        disabled={disabled}
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        title={playing ? 'Stop preview' : 'Preview voice'}
                      >
                        {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* BGM */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Music2 className="h-3.5 w-3.5 text-muted-foreground" />
          <label className="text-xs text-muted-foreground uppercase tracking-wider">Background Music</label>
        </div>

        {metadata.bgMusicUrl ? (
          <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-2 py-1.5">
            <Music2 className="h-3 w-3 text-primary" />
            <span className="text-xs text-foreground truncate flex-1">
              {metadata.bgMusicName || 'Selected track'}
            </span>
            <button
              type="button"
              onClick={() => setBgPickerOpen(true)}
              disabled={disabled}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Change
            </button>
            <button
              type="button"
              onClick={clearBg}
              disabled={disabled}
              className="text-muted-foreground hover:text-destructive transition-colors"
              title="Remove background music"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setBgPickerOpen(true)}
            disabled={disabled}
            className="inline-flex items-center justify-center gap-2 rounded-md border bg-background px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors disabled:opacity-40"
          >
            <Music2 className="h-3.5 w-3.5" />
            Select background music
          </button>
        )}
      </div>

      {bgPickerOpen && (
        <AudioSelectModal
          onSelect={handleBgSelect}
          onClose={() => setBgPickerOpen(false)}
          title="Select background music"
        />
      )}
    </div>
  );
}
