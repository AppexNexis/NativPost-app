'use client';

/**
 * SlideView — single slide renderer used everywhere:
 *   - ImageEditorPreview (editor per-slide preview)
 *   - GalleryPreview     (detail page / posts page)
 *   - slide.ts           (Puppeteer carousel publish — CSS must match)
 *
 * WYSIWYG contract: every visual property rendered here defines the
 * "source of truth" for slide appearance. The Puppeteer endpoint
 * (image-engine/src/routes/slide.ts) mirrors these CSS values exactly
 * so the published carousel matches the editor preview.
 *
 * ── CSS properties to keep in sync with slide.ts ────────────────
 *   .bg            → object-fit:cover; position:absolute; inset:0
 *   .dim           → background:rgba(0,0,0,N); position:absolute; inset:0; pointer-events:none
 *   .caption-block → text-align:A; max-width:90% (95% wall)  [block wrapper]
 *   .caption-text  → display:inline; box-decoration-break:clone;
 *                    font-weight:800; line-height:1.5; letter-spacing:-0.01em;
 *                    color:white; word-break:break-word;
 *                    IF box: background-color:C; padding:0.16em 0.42em;
 *                            border-radius:0.18em; box-shadow:0 6px 24px rgba(0,0,0,0.28);
 *                    ELSE:   text-shadow:0 2px 10px rgba(0,0,0,0.55);
 *                            IF textStroke: -webkit-text-stroke:0.6px rgba(0,0,0,0.4)
 *   layout/bottom  → position:absolute; inset:auto 0 0 0; display:flex;
 *                    align-items:flex-end; justify-content:center; padding:1rem
 *   layout/center  → position:absolute; inset:0; display:flex;
 *                    align-items:center; justify-content:center; padding:1.5rem
 *   layout/top     → position:absolute; inset:0 0 auto 0; display:flex;
 *                    align-items:flex-start; justify-content:center; padding:1rem
 *   layout/wall    → position:absolute; inset:0; display:flex;
 *                    align-items:center; justify-content:center; padding:1rem
 * ────────────────────────────────────────────────────────────────
 */

import React from 'react';

type SlideViewProps = {
  /** Public URL of the slide background image. */
  backgroundUrl: string;
  /** Caption text to overlay. */
  text: string;
  /** Aspect ratio e.g. '9:16', '1:1'. Controls frame shape. */
  aspectRatio?: string;
  /** Text position on the slide. */
  layout?: 'centered' | 'bottom_caption' | 'top_caption' | 'wall_of_text' | string | null;
  /** Horizontal text alignment. */
  align?: 'left' | 'center' | 'right' | string | null;
  /** 0..1 dim overlay. */
  backgroundDimming?: number | null;
  /** CSS color for the caption box. 'transparent' = no box. */
  captionBackgroundColor?: string | null;
  /** Font family name. */
  fontFamily?: string | null;
  /** Font size at 1080px render width. Display scaled by 0.5 (norm) / 0.7 (wall). */
  fontSize?: number | null;
  /** Font color. Default #ffffff. */
  color?: string | null;
  /** Font weight. 700 (bold) or 400 (normal). */
  fontWeight?: number | null;
  fontStyle?: 'normal' | 'italic' | null;
  textDecoration?: 'none' | 'underline' | null;
  /** Enable text stroke + shadow for extra legibility on busy backgrounds. */
  textStroke?: boolean | null;
  /** Optional class name for the outer container. */
  className?: string;
};

export function SlideView({
  backgroundUrl,
  text,
  layout,
  align,
  backgroundDimming,
  captionBackgroundColor,
  fontFamily,
  fontSize,
  color,
  fontWeight,
  fontStyle,
  textDecoration,
  textStroke,
  className,
}: SlideViewProps) {
  const isWall = layout === 'wall_of_text';
  // Highlight box is the default look; only an explicit 'transparent' disables it.
  const boxColor = captionBackgroundColor === 'transparent'
    ? null
    : (captionBackgroundColor || '#000000');
  const hasBox = !!boxColor;
  // Scale authored (1080px) font down for this preview mockup (~360px): x0.5 / x0.7.
  const displayFontSize = Math.round((fontSize || 20) * (isWall ? 0.7 : 0.5));

  // Layout positioning — matches slide.ts layout switch
  const getContainerClass = () => {
    switch (layout) {
      case 'top_caption':
        return 'absolute inset-x-0 top-0 flex items-start justify-center p-4';
      case 'centered':
        return 'absolute inset-0 flex items-center justify-center p-6';
      case 'wall_of_text':
        return 'absolute inset-0 flex items-center justify-center p-4';
      case 'bottom_caption':
      default:
        return 'absolute inset-x-0 bottom-0 flex items-end justify-center p-4';
    }
  };

  const containerClass = getContainerClass();
  const textAlign = align === 'left' || align === 'right' ? align : 'center';

  // Canonical caption spec — MIRRORED byte-for-byte with the image engine at
  // NativPost-engine/image-engine/src/routes/slide.ts. Default look: per-line
  // "highlight" — a solid box hugging each wrapped line (box-decoration-break:
  // clone), the usefastlane style. text-align lives on the wrapper (below).
  const textStyle: React.CSSProperties = {
    fontWeight: fontWeight ?? 800,
    lineHeight: 1.5,
    letterSpacing: '-0.01em',
    color: color || '#ffffff',
    fontSize: displayFontSize,
    wordBreak: 'break-word',
    fontFamily: fontFamily || undefined,
    fontStyle: fontStyle || undefined,
    textDecoration: textDecoration || undefined,
    // Per-line highlight requires display:inline so each wrapped line gets its
    // own box; box-decoration-break clones padding + radius onto every line.
    display: 'inline',
    boxDecorationBreak: 'clone',
    WebkitBoxDecorationBreak: 'clone',
  };

  if (hasBox) {
    textStyle.backgroundColor = boxColor;
    // em-based padding/radius so the box hugs the text identically across sizes.
    textStyle.padding = '0.16em 0.42em';
    textStyle.borderRadius = '0.18em';
    textStyle.boxShadow = '0 6px 24px rgba(0,0,0,0.28)';
  } else {
    textStyle.textShadow = '0 2px 10px rgba(0,0,0,0.55)';
    if (textStroke) textStyle.WebkitTextStroke = '0.6px rgba(0,0,0,0.4)';
  }

  return (
    <div className={`relative size-full overflow-hidden ${className || ''}`}>
      {/* Background image */}
      {backgroundUrl && (
        <img
          src={backgroundUrl}
          alt=""
          className="absolute inset-0 size-full object-cover"
        />
      )}

      {/* Dim scrim */}
      {typeof backgroundDimming === 'number' && backgroundDimming > 0 && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundColor: `rgba(0,0,0,${Math.min(1, Math.max(0, backgroundDimming))})` }}
        />
      )}

      {/* Caption overlay. The block wrapper carries text-align + max-width so the
          text wraps; the inline span produces the per-line highlight boxes. */}
      {text && (
        <div className={`pointer-events-none ${containerClass}`}>
          <div style={{ textAlign, maxWidth: isWall ? '95%' : '90%' }}>
            <span style={textStyle}>{text}</span>
          </div>
        </div>
      )}
    </div>
  );
}
