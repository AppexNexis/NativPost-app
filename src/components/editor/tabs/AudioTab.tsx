import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Music, Volume2, X, Play, Pause } from 'lucide-react';

import { useEditor } from '../EditorContext';

// ---------------------------------------------------------------------------
// Types — mirrors /api/audio-library response
// ---------------------------------------------------------------------------
type AudioAsset = {
  publicId: string;
  title: string;
  url: string;
  durationSeconds: number | null;
  mimeType: string;
  tags: string[];
};

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// AudioSelectModal
// ---------------------------------------------------------------------------
function AudioSelectModal({
  onSelect,
  onClose,
}: {
  onSelect: (track: { name: string; url: string; publicId?: string; source: 'original' | 'library' | 'upload' }) => void;
  onClose: () => void;
}) {
  const [assets, setAssets] = useState<AudioAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const fetchAudio = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/audio-library?limit=50');
      if (!res.ok) throw new Error('Failed to load audio library');
      const data = await res.json();
      setAssets(data.assets || []);
    } catch {
      setError('Could not load audio library.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAudio();
  }, [fetchAudio]);

  // Clean up on close: pause any playing preview.
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const togglePreview = (asset: AudioAsset) => {
    if (previewId === asset.publicId) {
      audioRef.current?.pause();
      setPreviewId(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = asset.url;
      audioRef.current.play().catch(() => {
        setPreviewId(null);
      });
    } else {
      const el = new Audio(asset.url);
      el.addEventListener('ended', () => setPreviewId(null));
      audioRef.current = el;
      el.play().catch(() => setPreviewId(null));
    }
    setPreviewId(asset.publicId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[80vh] w-full flex-col rounded-t-2xl border border-border bg-card shadow-2xl sm:max-w-lg sm:rounded-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Select Audio</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Curated royalty-free background tracks
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
          )}
          {!loading && !error && assets.length === 0 && (
            <div className="py-12 text-center">
              <Music className="mx-auto mb-2 size-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No audio tracks available yet.</p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Upload royalty-free tracks to Cloudinary folder{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-[10px]">nativpost/audio/</code>{' '}
                — set the display name in context.custom.title.
              </p>
            </div>
          )}
          <div className="space-y-2">
            {assets.map(a => {
              const isPlaying = previewId === a.publicId;
              const duration = formatDuration(a.durationSeconds);
              return (
                <div
                  key={a.publicId}
                  className="flex items-center gap-3 rounded-xl border border-border bg-background p-3 transition-colors hover:border-primary/40 hover:bg-muted/30"
                >
                  <button
                    type="button"
                    onClick={() => togglePreview(a)}
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 transition-colors hover:bg-primary/20"
                    aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
                  >
                    {isPlaying
                      ? <Pause className="size-4 text-primary" />
                      : <Play className="size-4 translate-x-[1px] text-primary" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{a.title}</p>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      {duration && <span>{duration}</span>}
                      {a.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => onSelect({ name: a.title, url: a.url, publicId: a.publicId, source: 'library' })}
                    className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Select
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AudioTab
// ---------------------------------------------------------------------------
export function AudioTab() {
  const { state, dispatch } = useEditor();
  const [showModal, setShowModal] = useState(false);

  const handleSelect = (track: { name: string; url: string; publicId?: string; source: 'original' | 'library' | 'upload' }) => {
    dispatch({ type: 'SET_AUDIO_TRACK', payload: { ...track, volume: 80 } });
    setShowModal(false);
  };

  const handleClear = () => {
    dispatch({ type: 'SET_AUDIO_TRACK', payload: null });
  };

  const handleVolumeChange = (vol: number) => {
    if (!state.audioTrack) return;
    dispatch({ type: 'SET_AUDIO_TRACK', payload: { ...state.audioTrack, volume: vol } });
  };

  return (
    <div className="space-y-5">
      {/* Current track */}
      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-foreground">BACKGROUND AUDIO</label>
        <div className="rounded-xl border border-border bg-background">
          {state.audioTrack ? (
            <div className="p-3">
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Music className="size-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{state.audioTrack.name}</p>
                  <p className="text-xs capitalize text-muted-foreground">{state.audioTrack.source}</p>
                </div>
                <button
                  onClick={handleClear}
                  className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Volume */}
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Volume2 className="size-3.5" />
                    Volume
                  </div>
                  <span className="text-xs font-medium text-foreground">{state.audioTrack.volume ?? 80}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={state.audioTrack.volume ?? 80}
                  onChange={e => handleVolumeChange(parseInt(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>

              <button
                onClick={() => setShowModal(true)}
                className="mt-3 w-full rounded-lg border border-border py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Change track
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowModal(true)}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl py-10 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50"
            >
              <Music className="size-7 text-muted-foreground/40" strokeWidth={1.2} />
              Select audio
            </button>
          )}
        </div>
      </div>

      {showModal && (
        <AudioSelectModal
          onSelect={handleSelect}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
