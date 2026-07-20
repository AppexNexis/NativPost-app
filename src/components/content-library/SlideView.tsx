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
 *   .caption-box   → background-color:C; padding:16px 24px; border-radius:8px
 *   .caption-text  → font-weight:700; line-height:1.3; color:white;
 *                    -webkit-text-stroke:1px black;
 *                    text-shadow:0 1px 3px rgba(0,0,0,0.6);
 *                    font-size:Npx; text-align:A; word-break:break-word
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
  className,
}: SlideViewProps) {
  const isWall = layout === 'wall_of_text';
  const hasBox = captionBackgroundColor && captionBackgroundColor !== 'transparent';
  const displayFontSize = fontSize
    ? Math.round(fontSize * (isWall ? 0.7 : 0.5))
    : undefined;

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

  // Base text styling — applied regardless of caption box
  const textStyle: React.CSSProperties = {
    fontWeight: fontWeight ?? 700,
    lineHeight: 1.3,
    color: color || '#ffffff',
    fontSize: displayFontSize || undefined,
    textAlign,
    wordBreak: 'break-word',
    WebkitTextStroke: '1px black',
    textShadow: '0 1px 3px rgba(0,0,0,0.6)',
    fontFamily: fontFamily || undefined,
    fontStyle: fontStyle || undefined,
    textDecoration: textDecoration || undefined,
  };

  if (hasBox) {
    textStyle.backgroundColor = captionBackgroundColor;
    textStyle.padding = '16px 24px';
    textStyle.borderRadius = '8px';
    textStyle.maxWidth = isWall ? '95%' : '90%';
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

      {/* Caption overlay */}
      {text && (
        <div className={`pointer-events-none ${containerClass}`}>
          {hasBox ? (
            <div style={textStyle}>{text}</div>
          ) : (
            <p style={textStyle}>{text}</p>
          )}
        </div>
      )}
    </div>
  );
}
