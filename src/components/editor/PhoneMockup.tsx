import React, { ReactNode } from 'react';

/**
 * Phone-shaped preview shell shared between the Video and Image editors.
 * Renders a rounded frame with a notch + home indicator. Any content
 * (Remotion Player, `<img>`, slide viewer) drops into the `children` slot
 * and fills the screen area.
 *
 * The frame's aspect ratio follows the editor's `aspectRatio` state. 9:16
 * (default) renders the classic phone silhouette; 1:1 and 16:9 render a
 * square or wide card of the same visual chrome so image-editor content
 * previews at the correct shape too. Without this, ImageEditorPreview
 * always presented a 9:16 crop regardless of the Aspect ratio tab choice,
 * making the 1:1 / 16:9 buttons appear broken.
 *
 * Extracted from `EditorPreview.tsx` so `ImageEditorPreview` can reuse the
 * identical visual chrome and the two editors stay pixel-consistent.
 */
export function PhoneMockup({
  children,
  aspectRatio = '9:16',
}: {
  children: ReactNode;
  aspectRatio?: string;
}) {
  const [w, h] = (aspectRatio || '9:16').split(':').map(n => Number(n));
  const validRatio = w && h && Number.isFinite(w) && Number.isFinite(h);
  const cssRatio = validRatio ? `${w} / ${h}` : '9 / 16';
  const isPortrait = validRatio ? h > w : true;
  // Width policy: portrait grows to fill height (max-h clamp); square/wide
  // stretch horizontally so the frame reads at a comfortable size in the
  // preview panel.
  const outerClass = isPortrait
    ? 'flex h-full max-h-[780px] w-auto flex-col justify-center'
    : 'flex w-full max-w-[720px] flex-col justify-center';
  return (
    <div className="flex h-full w-full items-center justify-center px-6 py-6">
      <div className={outerClass}>
        <div
          className="flex h-full max-h-full flex-col overflow-hidden rounded-[2rem] border-[1.5px] border-white/[0.06] bg-neutral-900/40 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_8px_32px_-12px_rgba(0,0,0,0.3)]"
          style={{ aspectRatio: cssRatio }}
        >
          {/* Notch / Dynamic Island — only for portrait, chrome would look
              wrong on a square/wide card. */}
          {isPortrait && (
            <div className="relative flex shrink-0 items-center justify-center py-1">
              <div className="h-1 w-12 rounded-full bg-white/8" />
            </div>
          )}

          {/* Screen */}
          <div className="relative flex flex-1 items-center justify-center overflow-hidden">
            {children}
          </div>

          {/* Home Indicator — portrait only, same reason. */}
          {isPortrait && (
            <div className="flex shrink-0 items-center justify-center py-1.5">
              <div className="h-1 w-[88px] rounded-full bg-white/10" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
