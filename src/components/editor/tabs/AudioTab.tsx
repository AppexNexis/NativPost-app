import { Loader2, Music, Pause, Play, Upload, Video as VideoIcon, Volume2, VolumeX, X } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Slider } from '@/components/ui/slider';
import { DEFAULT_MUSIC_VOLUME, DEFAULT_ORIGINAL_AUDIO_VOLUME } from '@/lib/editor-constants';
import { isVideoUrl } from '@/components/editor/compositions/media-detect';
import { cn } from '@/utils/Helpers';

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

type LibraryTab = 'default' | 'mine';

type SelectedTrack = {
  name: string;
  url: string;
  publicId?: string;
  source: 'original' | 'library' | 'upload';
  durationSeconds?: number;
};

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) {
    return '';
  }
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// AudioSelectModal — Default Audio + My Library
// ---------------------------------------------------------------------------
function AudioSelectModal({
  onSelect,
  onClose,
}: {
  onSelect: (track: SelectedTrack) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<LibraryTab>('default');
  // Cached per tab so switching back and forth doesn't refetch.
  const [assetsByTab, setAssetsByTab] = useState<Record<LibraryTab, AudioAsset[] | null>>({
    default: null,
    mine: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const assets = assetsByTab[tab];

  const fetchAudio = useCallback(async (which: LibraryTab) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/audio-library?limit=100&scope=${which === 'mine' ? 'mine' : 'default'}`);
      if (!res.ok) {
        throw new Error('Failed to load audio library');
      }
      const data = await res.json();
      setAssetsByTab(prev => ({ ...prev, [which]: data.assets || [] }));
    } catch {
      setError('Could not load audio.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (assetsByTab[tab] === null) {
      void fetchAudio(tab);
    }
  }, [tab, assetsByTab, fetchAudio]);

  // Stop playback when the modal closes — an orphaned <audio> keeps playing.
  useEffect(() => () => {
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  const togglePreview = (asset: AudioAsset) => {
    if (previewId === asset.publicId) {
      audioRef.current?.pause();
      setPreviewId(null);
      return;
    }
    audioRef.current?.pause();
    const el = new Audio(asset.url);
    el.volume = 0.8;
    el.onended = () => setPreviewId(null);
    void el.play().catch(() => setPreviewId(null));
    audioRef.current = el;
    setPreviewId(asset.publicId);
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/audio-library/upload', { method: 'POST', body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'Upload failed.');
      }
      // Prepend so the new track is the first thing the user sees.
      setAssetsByTab(prev => ({ ...prev, mine: [data.asset, ...(prev.mine ?? [])] }));
      setTab('mine');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const emptyCopy = tab === 'default'
    ? 'No audio tracks available yet.'
    : 'You haven’t uploaded any audio yet.';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[80vh] w-full flex-col rounded-t-2xl border border-border bg-card shadow-2xl sm:max-w-lg sm:rounded-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Select Audio</h2>
            <p className="text-xs text-muted-foreground">Music is mixed under your video&rsquo;s own sound</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 border-b border-border">
          {(['default', 'mine'] as LibraryTab[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 py-2.5 text-xs font-medium transition-colors',
                tab === t
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t === 'default' ? 'Default Audio' : 'My Library'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {error && (
            <p className="mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
          )}

          {tab === 'mine' && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) {
                    void handleUpload(file);
                  }
                }}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-60"
              >
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                {uploading ? 'Uploading…' : 'Upload audio (MP3, WAV, M4A — max 25 MB)'}
              </button>
            </>
          )}

          {loading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && assets && assets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Music className="mb-2 size-7 text-muted-foreground/30" strokeWidth={1.2} />
              <p className="text-xs text-muted-foreground">{emptyCopy}</p>
            </div>
          )}

          {!loading && assets && assets.length > 0 && (
            <div className="space-y-1">
              {assets.map((asset) => {
                const isPreviewing = previewId === asset.publicId;
                return (
                  <div
                    key={asset.publicId}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60"
                  >
                    <button
                      type="button"
                      onClick={() => togglePreview(asset)}
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary/20"
                      title={isPreviewing ? 'Pause' : 'Preview'}
                    >
                      {isPreviewing ? <Pause className="size-4" /> : <Play className="ml-0.5 size-4" />}
                    </button>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">{asset.title}</p>
                      <p className="text-xs text-muted-foreground">{formatDuration(asset.durationSeconds)}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelect({
                        name: asset.title,
                        url: asset.url,
                        publicId: asset.publicId,
                        source: tab === 'mine' ? 'upload' : 'library',
                        ...(asset.durationSeconds ? { durationSeconds: asset.durationSeconds } : {}),
                      })}
                      className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                      Select
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A labelled volume row with an independent mute toggle.
// ---------------------------------------------------------------------------
function VolumeRow({
  label,
  icon,
  subtitle,
  volume,
  muted,
  onVolumeChange,
  onToggleMute,
}: {
  label: string;
  icon: React.ReactNode;
  subtitle?: string;
  volume: number;
  muted: boolean;
  onVolumeChange: (v: number) => void;
  onToggleMute: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center gap-3">
        <div className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full',
          muted ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary',
        )}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{label}</p>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={onToggleMute}
          title={muted ? 'Unmute' : 'Mute'}
          className={cn(
            'shrink-0 rounded-lg p-2 transition-colors',
            muted
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </button>
      </div>

      <div className={cn('mt-3 transition-opacity', muted && 'pointer-events-none opacity-40')}>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Volume</span>
          <span className="text-xs font-medium text-foreground">
            {muted ? 'Muted' : `${volume}%`}
          </span>
        </div>
        <Slider
          min={0}
          max={100}
          step={1}
          value={[volume]}
          onValueChange={vals => onVolumeChange(vals[0] ?? 0)}
        />
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

  const background = state.mediaSlots?.background;
  // Only a VIDEO carries its own audio — an image background has nothing to
  // control, so the row is hidden rather than shown as a dead slider.
  const hasOriginalAudio = Boolean(background?.url && isVideoUrl(background.url));

  const originalVolume = background?.volume ?? DEFAULT_ORIGINAL_AUDIO_VOLUME;
  const originalMuted = background?.muted ?? false;

  const patchBackground = (patch: { volume?: number; muted?: boolean }) => {
    if (!background) {
      return;
    }
    dispatch({
      type: 'UPDATE_MEDIA_SLOTS',
      payload: { background: { ...background, ...patch } },
    });
  };

  const handleSelect = (track: SelectedTrack) => {
    dispatch({
      type: 'SET_AUDIO_TRACK',
      payload: { ...track, volume: DEFAULT_MUSIC_VOLUME, muted: false },
    });
    setShowModal(false);
  };

  const patchTrack = (patch: { volume?: number; muted?: boolean }) => {
    if (!state.audioTrack) {
      return;
    }
    dispatch({ type: 'SET_AUDIO_TRACK', payload: { ...state.audioTrack, ...patch } });
  };

  return (
    <div className="space-y-5">
      {/* ── The video's own audio ─────────────────────────────────────── */}
      {hasOriginalAudio && (
        <div>
          <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-foreground">
            Original video audio
          </label>
          <VolumeRow
            label="From your video"
            subtitle="Plays by default — music is added on top"
            icon={<VideoIcon className="size-4" />}
            volume={originalVolume}
            muted={originalMuted}
            onVolumeChange={v => patchBackground({ volume: v })}
            onToggleMute={() => patchBackground({ muted: !originalMuted })}
          />
        </div>
      )}

      {/* ── Background music ──────────────────────────────────────────── */}
      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-foreground">
          Background music
        </label>

        {state.audioTrack
          ? (
              <div className="space-y-2">
                <VolumeRow
                  label={state.audioTrack.name}
                  subtitle={state.audioTrack.source === 'upload' ? 'Your upload' : 'Library track'}
                  icon={<Music className="size-4" />}
                  volume={state.audioTrack.volume ?? DEFAULT_MUSIC_VOLUME}
                  muted={state.audioTrack.muted ?? false}
                  onVolumeChange={v => patchTrack({ volume: v })}
                  onToggleMute={() => patchTrack({ muted: !(state.audioTrack?.muted ?? false) })}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(true)}
                    className="flex-1 rounded-lg border border-border py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    Change track
                  </button>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'SET_AUDIO_TRACK', payload: null })}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    Remove
                  </button>
                </div>
              </div>
            )
          : (
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-border bg-background py-10 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50"
              >
                <Music className="size-7 text-muted-foreground/40" strokeWidth={1.2} />
                Select audio
              </button>
            )}

        {state.audioTrack && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Music is trimmed to the length of your video.
          </p>
        )}
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
