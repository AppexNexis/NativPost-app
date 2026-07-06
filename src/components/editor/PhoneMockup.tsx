import React, { ReactNode } from 'react';

/**
 * Phone-shaped preview shell shared between the Video and Image editors.
 * Renders a 9:16 rounded frame with a notch + home indicator. Any content
 * (Remotion Player, `<img>`, slide viewer) drops into the `children` slot
 * and fills the screen area.
 *
 * Extracted from `EditorPreview.tsx` so `ImageEditorPreview` can reuse the
 * identical visual chrome and the two editors stay pixel-consistent.
 */
export function PhoneMockup({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center px-6 py-6">
      <div className="flex h-full max-h-[780px] w-auto flex-col justify-center">
        <div
          className="flex h-full max-h-full flex-col overflow-hidden rounded-[2rem] border-[1.5px] border-white/[0.06] bg-neutral-900/40 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_8px_32px_-12px_rgba(0,0,0,0.3)]"
          style={{ aspectRatio: '9 / 16' }}
        >
          {/* Notch / Dynamic Island */}
          <div className="relative flex shrink-0 items-center justify-center py-1">
            <div className="h-1 w-12 rounded-full bg-white/8" />
          </div>

          {/* Screen */}
          <div className="relative flex flex-1 items-center justify-center overflow-hidden">
            {children}
          </div>

          {/* Home Indicator */}
          <div className="flex shrink-0 items-center justify-center py-1.5">
            <div className="h-1 w-[88px] rounded-full bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}
