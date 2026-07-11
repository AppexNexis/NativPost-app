'use client';

// ---------------------------------------------------------------------------
// AudioSelectModal — shared audio picker
// ---------------------------------------------------------------------------
// Lifted from src/components/editor/tabs/AudioTab.tsx so the campaign post
// editor (and any future surface) can pick real audio tracks instead of the
// generic MediaPickerModal (which shows images from the media library).
// Uses the same /api/audio-library endpoint the editor's Audio tab uses.
// ---------------------------------------------------------------------------

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Music, X, Play, Pause } from 'lucide-react';

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

export type AudioSelection = {
  name: string;
  url: string;
  publicId?: string;
  source: 'library';
};

export function AudioSelectModal({
  onSelect,
  onClose,
  title = 'Select Audio Track',
}: {
  onSelect: (track: AudioSelection) => void;
  onClose: () => void;
  title?: string;
}) {
  const [assets, setAssets] = useState<AudioAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause();
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
      audioRef.current.play().catch(() => setPreviewId(null));
    } else {
      const el = new Audio(asset.url);
      el.addEventListener('ended', () => setPreviewId(null));
      audioRef.current = el;
      el.play().catch(() => setPreviewId(null));
    }
    setPreviewId(asset.publicId);
  };

  // Radix Dialog (used by the campaign post editor) applies
  // `pointer-events: none` to <body> when it opens with modal=true. That
  // rule cascades to any inline descendant rendered outside DialogContent,
  // which is why the X button and backdrop were unclickable. Force
  // `pointer-events: auto` on our overlay + card so the audio picker
  // escapes the Dialog's pointer trap without needing a portal
  // (react-dom types aren't installed in this workspace).
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      style={{ pointerEvents: 'auto' }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full flex-col rounded-t-2xl border border-border bg-card shadow-2xl sm:max-w-lg sm:rounded-2xl"
        style={{ pointerEvents: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Curated royalty-free background tracks
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close"
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
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}
          {!loading && !error && assets.length === 0 && (
            <div className="py-12 text-center">
              <Music className="mx-auto mb-2 size-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No audio tracks available yet.</p>
            </div>
          )}
          <div className="space-y-2">
            {assets.map((a) => {
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
                      {a.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onSelect({
                        name: a.title,
                        url: a.url,
                        publicId: a.publicId,
                        source: 'library',
                      })
                    }
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
