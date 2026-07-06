import React, { useState } from 'react';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';

import { useEditor } from './EditorContext';
import { RemotionPreviewPlayer } from './RemotionPreviewPlayer';

async function regenerateScript(
  state: ReturnType<typeof useEditor>['state'],
  mode: 'improve' | 'regenerate',
): Promise<{ hookText?: string; bodyText?: string; ctaText?: string } | null> {
  const caption = [state.script.hookText, state.script.bodyText, state.script.ctaText]
    .filter(Boolean)
    .join('\n\n');

  const topic = mode === 'improve'
    ? `Improve and sharpen this content:\n${caption}`
    : caption || 'General content';

  const res = await fetch('/api/content/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic,
      contentType: state.edit?.contentType || 'text_only',
      targetPlatforms: state.targetPlatforms?.length ? state.targetPlatforms : ['instagram'],
      numVariants: 1,
      contentMode: state.contentMode || 'normal',
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const variant = data.variants?.[0];
  if (!variant) return null;

  // Split the caption back into hook/body/cta by newlines or sentence structure
  const full: string = variant.caption || '';
  const lines = full.split('\n').filter((l: string) => l.trim());
  return {
    hookText: lines[0] || state.script.hookText,
    bodyText: lines.slice(1, -1).join('\n') || state.script.bodyText,
    ctaText: lines[lines.length - 1] || state.script.ctaText,
  };
}

export function EditorPreview() {
  const { state, dispatch } = useEditor();
  const [aiWorking, setAiWorking] = useState<'improve' | 'regenerate' | null>(null);

  const contentType = state.edit?.contentType || 'text';
  const aspectRatio = state.aspectRatio || '9:16';
  const isPortrait = aspectRatio === '9:16';

  const handleAiAction = async (mode: 'improve' | 'regenerate') => {
    setAiWorking(mode);
    try {
      const result = await regenerateScript(state, mode);
      if (result) {
        dispatch({ type: 'UPDATE_SCRIPT', payload: result });
      }
    } finally {
      setAiWorking(null);
    }
  };

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br from-muted/50 via-background to-muted/30">
      {/* Floating AI action buttons */}
      <div className="absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2">
        <button
          type="button"
          onClick={() => handleAiAction('improve')}
          disabled={aiWorking !== null}
          title="Improve with AI"
          className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card/90 px-2.5 py-2.5 text-[10px] font-medium text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
        >
          {aiWorking === 'improve' ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          Improve
        </button>
        <button
          type="button"
          onClick={() => handleAiAction('regenerate')}
          disabled={aiWorking !== null}
          title="Regenerate"
          className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card/90 px-2.5 py-2.5 text-[10px] font-medium text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-muted disabled:opacity-50"
        >
          {aiWorking === 'regenerate' ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Regen
        </button>
      </div>
      {/* Subtle dot-grid background pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'radial-gradient(circle, currentColor 0.5px, transparent 0.5px)',
          backgroundSize: '20px 20px',
        }}
      />

      {isPortrait ? (
        <div className="flex h-full w-full items-center justify-center px-6 py-6">
          {/* Phone mockup — scales with available height, no harsh black */}
          <div className="flex h-full max-h-[780px] w-auto flex-col justify-center">
            <div className="flex h-full max-h-full flex-col overflow-hidden rounded-[2rem] border-[1.5px] border-white/[0.06] bg-neutral-900/40 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_8px_32px_-12px_rgba(0,0,0,0.3)]"
              style={{ aspectRatio: '9 / 16' }}
            >
              {/* Notch / Dynamic Island */}
              <div className="relative flex shrink-0 items-center justify-center py-1">
                <div className="h-1 w-12 rounded-full bg-white/8" />
              </div>

              {/* Screen — Remotion player with compiled preview */}
              <div className="relative flex flex-1 items-center justify-center overflow-hidden">
                <RemotionPreviewPlayer
                  contentType={contentType}
                  inputProps={{
                    // Flat shape for the universal EditorComposition (reel /
                    // single_image); nested mediaSlots shape for every
                    // per-type composition (ugc, talking_head, green_screen,
                    // video_hook, slideshow, carousel, data_story). Passing
                    // both keeps every dispatch target happy.
                    backgroundUrl: state.mediaSlots?.background?.url,
                    hookVideoUrl: state.mediaSlots?.hookVideo?.url,
                    slides: state.mediaSlots?.slides,
                    mediaSlots: state.mediaSlots,
                    script: state.script,
                    style: state.style,
                    layout: state.layout,
                    aspectRatio: state.aspectRatio,
                    contentType,
                    audioTrack: state.audioTrack ?? null,
                  }}
                />
                {state.isSaving && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[11px] text-white/70">
                    Saving&hellip;
                  </div>
                )}
              </div>

              {/* Home Indicator */}
              <div className="flex shrink-0 items-center justify-center py-1.5">
                <div className="h-1 w-[88px] rounded-full bg-white/10" />
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Wide / square content — clean, no dark backgrounds */
        <div className="flex h-full w-full items-center justify-center px-6 py-6">
          <div className="relative flex h-full w-full max-w-4xl items-center justify-center overflow-hidden">
            <RemotionPreviewPlayer
              contentType={contentType}
              inputProps={{
                backgroundUrl: state.mediaSlots?.background?.url,
                hookVideoUrl: state.mediaSlots?.hookVideo?.url,
                slides: state.mediaSlots?.slides,
                mediaSlots: state.mediaSlots,
                script: state.script,
                style: state.style,
                layout: state.layout,
                aspectRatio: state.aspectRatio,
                contentType,
                audioTrack: state.audioTrack ?? null,
              }}
            />
            {state.isSaving && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[11px] text-white/70">
                Saving&hellip;
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
