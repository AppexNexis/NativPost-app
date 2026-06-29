import React from 'react';

import { useEditor } from './EditorContext';
import { SimpleVideoPreview } from './SimpleVideoPreview';

export function EditorPreview() {
  const { state } = useEditor();

  const contentType = state.edit?.contentType || 'text';
  const aspectRatio = state.aspectRatio || '9:16';
  const isPortrait = aspectRatio === '9:16';

  if (state.isDirty) {
    // Will trigger a save on next debounce tick — preview always reflects live state
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-muted/40 to-muted/20 p-4">
      {/* Phone mockup frame for 9:16 */}
      {isPortrait ? (
        <div className="relative mx-auto max-h-full max-w-[320px] flex-1">
          {/* Phone body */}
          <div className="flex h-full flex-col overflow-hidden rounded-[2.5rem] border-[3px] border-foreground/10 bg-black shadow-2xl">
            {/* Notch / Dynamic Island */}
            <div className="relative flex shrink-0 items-center justify-center py-2">
              <div className="h-1.5 w-16 rounded-full bg-foreground/5" />
              <div className="absolute right-6 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-foreground/5" />
              <div className="absolute right-3 top-1/2 size-1 -translate-y-1/2 rounded-full bg-foreground/5" />
            </div>

            {/* Screen */}
            <div className="relative flex flex-1 items-center justify-center bg-black">
              <SimpleVideoPreview
                contentType={contentType}
                script={state.script}
                style={state.style}
                mediaSlots={state.mediaSlots}
                aspectRatio={aspectRatio}
                layout={state.layout}
              />
              {state.isSaving && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs text-white/80">
                  Saving&hellip;
                </div>
              )}
            </div>

            {/* Bottom bar / Home indicator */}
            <div className="flex shrink-0 items-center justify-center py-2">
              <div className="h-1 w-24 rounded-full bg-foreground/10" />
            </div>
          </div>
        </div>
      ) : (
        /* Wide / square content — no phone frame */
        <div className="relative flex max-h-full w-full items-center justify-center">
          <SimpleVideoPreview
            contentType={contentType}
            script={state.script}
            style={state.style}
            mediaSlots={state.mediaSlots}
            aspectRatio={aspectRatio}
            layout={state.layout}
          />
          {state.isSaving && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs text-white/80">
              Saving&hellip;
            </div>
          )}
        </div>
      )}
    </div>
  );
}
