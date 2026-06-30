import React from 'react';

import { useEditor } from './EditorContext';
import { SimpleVideoPreview } from './SimpleVideoPreview';

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
        <div className="flex h-full w-full items-center justify-center px-8 py-6">
          {/* Phone mockup — scales with available height */}
          <div className="flex h-full max-h-[780px] w-auto flex-col justify-center">
            <div className="flex h-full max-h-full flex-col overflow-hidden rounded-[2rem] border-[2px] border-foreground/8 bg-neutral-950 shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_20px_60px_-15px_rgba(0,0,0,0.4)]"
              style={{ aspectRatio: '9 / 16' }}
            >
              {/* Notch / Dynamic Island */}
              <div className="relative flex shrink-0 items-center justify-center py-1.5">
                <div className="h-1 w-12 rounded-full bg-white/10" />
                <div className="absolute right-4 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-white/8" />
                <div className="absolute right-2 top-1/2 size-1 -translate-y-1/2 rounded-full bg-white/8" />
              </div>

              {/* Screen */}
              <div className="relative flex flex-1 items-center justify-center bg-neutral-950 overflow-hidden">
                <SimpleVideoPreview
                  contentType={contentType}
                  script={state.script}
                  style={state.style}
                  mediaSlots={state.mediaSlots}
                  aspectRatio={aspectRatio}
                  layout={state.layout}
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
        /* Wide / square content — full-width without phone frame */
        <div className="flex h-full w-full items-center justify-center px-8 py-6">
          <div className="relative h-full w-full max-w-5xl overflow-hidden rounded-2xl bg-neutral-950/80 shadow-2xl ring-1 ring-white/5">
            <SimpleVideoPreview
              contentType={contentType}
              script={state.script}
              style={state.style}
              mediaSlots={state.mediaSlots}
              aspectRatio={aspectRatio}
              layout={state.layout}
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
