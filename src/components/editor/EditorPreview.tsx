import React from 'react';

import { useEditor } from './EditorContext';
import { RemotionPreviewPlayer } from './RemotionPreviewPlayer';

export function EditorPreview() {
  const { state } = useEditor();

  const contentType = state.edit?.contentType || 'text';
  const aspectRatio = state.aspectRatio || '9:16';
  const isPortrait = aspectRatio === '9:16';

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br from-muted/50 via-background to-muted/30">
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
                    backgroundUrl: state.mediaSlots?.background?.url,
                    hookVideoUrl: state.mediaSlots?.hookVideo?.url,
                    slides: state.mediaSlots?.slides,
                    script: state.script,
                    style: state.style,
                    layout: state.layout,
                    aspectRatio: state.aspectRatio,
                    contentType,
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
                script: state.script,
                style: state.style,
                layout: state.layout,
                aspectRatio: state.aspectRatio,
                contentType,
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
