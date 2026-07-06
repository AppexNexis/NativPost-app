// @ts-nocheck
import React from 'react';
import { AbsoluteFill, Audio, Sequence, useVideoConfig } from 'remotion';

interface Props {
  script: {
    hookText?: string;
    bodyText?: string;
    ctaText?: string;
    slideCopy?: Array<string | { text: string; durationSeconds?: number }>;
  };
  style: {
    fontFamily?: string;
    fontSize?: number;
    color?: string;
    backgroundColor?: string;
    align?: 'left' | 'center' | 'right';
    weight?: 'normal' | 'bold';
    italic?: boolean;
    underline?: boolean;
    backgroundDimming?: number;
  };
  layout?: string;
  // Accept both shapes:
  //  - flat `slides` (Player path via EditorPreview inputProps)
  //  - nested `mediaSlots.slides` (render-editor-video / legacy path)
  slides?: Array<{ url: string }>;
  mediaSlots?: {
    slides?: Array<{ url: string }>;
  };
  audioTrack?: {
    url: string;
    volume?: number;
  } | null;
}

/**
 * SlideshowComposition — MUST match ImageEditorPreview.tsx exactly.
 * WYSIWYG rule: any style/layout logic added here must also live in the
 * preview component, and vice versa.
 */
export function SlideshowComposition({ script, style, layout, mediaSlots, slides: slidesProp, audioTrack }: Props) {
  const { width, height, fps } = useVideoConfig();

  const fontFamily = style.fontFamily || 'Inter';
  const fontSize = style.fontSize || 48;
  const color = style.color || '#ffffff';
  const bgColor = style.backgroundColor || 'transparent';
  const align = style.align || 'center';
  const fontWeight = style.weight === 'bold' ? 700 : 400;
  const fontStyle = style.italic ? 'italic' : 'normal';
  const textDecoration = style.underline ? 'underline' : 'none';
  const dim = Math.max(0, Math.min(1, style.backgroundDimming ?? 0));

  const layoutKey = layout || 'centered';
  const isWall = layoutKey === 'wall_of_text';

  // Position mapping — mirrors ImageEditorPreview.
  const layoutStyle: React.CSSProperties = (() => {
    switch (layoutKey) {
      case 'bottom_caption':
        return { justifyContent: 'flex-end', paddingBottom: 120 };
      case 'top_caption':
        return { justifyContent: 'flex-start', paddingTop: 120 };
      case 'wall_of_text':
      case 'centered':
      default:
        return { justifyContent: 'center' };
    }
  })();

  const alignItems =
    align === 'left' ? 'flex-start'
    : align === 'right' ? 'flex-end'
    : 'center';

  const slides = slidesProp ?? mediaSlots?.slides ?? [];
  const slideCopy = script.slideCopy || [];
  const defaultDuration = 3; // seconds per slide

  let frameOffset = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {audioTrack && audioTrack.url && (
        <Audio
          src={audioTrack.url}
          volume={Math.max(0, Math.min(1, (audioTrack.volume ?? 80) / 100))}
        />
      )}
      {slides.map((slide, idx) => {
        const copyItem = slideCopy[idx];
        const copyText = typeof copyItem === 'string' ? copyItem : copyItem?.text || '';
        const duration = typeof copyItem === 'object' && copyItem?.durationSeconds
          ? copyItem.durationSeconds
          : defaultDuration;
        const durationFrames = Math.round(duration * fps);

        const currentFrame = frameOffset;
        frameOffset += durationFrames;

        return (
          <Sequence key={idx} from={currentFrame} durationInFrames={durationFrames}>
            <AbsoluteFill>
              <img
                src={slide.url}
                alt={`Slide ${idx + 1}`}
                style={{
                  width,
                  height,
                  objectFit: 'cover',
                  position: 'absolute',
                }}
              />
              {/* Full-bleed dim scrim — matches preview. */}
              {dim > 0 && (
                <AbsoluteFill
                  style={{ backgroundColor: `rgba(0,0,0,${dim})` }}
                />
              )}
              {copyText && (
                <AbsoluteFill
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems,
                    padding: 40,
                    ...layoutStyle,
                  }}
                >
                  <div
                    style={{
                      backgroundColor: bgColor,
                      padding: bgColor === 'transparent' ? 0 : '16px 24px',
                      borderRadius: 8,
                      maxWidth: isWall ? '95%' : '90%',
                    }}
                  >
                    <p
                      style={{
                        fontFamily,
                        fontSize: isWall ? fontSize * 1.15 : fontSize,
                        color,
                        fontWeight,
                        fontStyle,
                        textDecoration,
                        textAlign: align,
                        lineHeight: 1.3,
                        margin: 0,
                      }}
                    >
                      {copyText}
                    </p>
                  </div>
                </AbsoluteFill>
              )}
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {/* Hook overlay at start if no slides */}
      {slides.length === 0 && script.hookText && (
        <Sequence from={0} durationInFrames={fps * 3}>
          <AbsoluteFill
            style={{
              backgroundColor: '#1a1a2e',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              padding: 40,
            }}
          >
            <p
              style={{
                fontFamily,
                fontSize: fontSize * 1.2,
                color,
                fontWeight,
                fontStyle,
                textDecoration,
                textAlign: align,
              }}
            >
              {script.hookText}
            </p>
          </AbsoluteFill>
        </Sequence>
      )}
    </AbsoluteFill>
  );
}
