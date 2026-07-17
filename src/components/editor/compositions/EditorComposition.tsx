import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  Video,
} from 'remotion';

// ── Font registration (mirrors engine-side; keeps preview & render in sync) ───
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadRoboto } from '@remotion/google-fonts/Roboto';
import { loadFont as loadMontserrat } from '@remotion/google-fonts/Montserrat';
import { loadFont as loadOswald } from '@remotion/google-fonts/Oswald';
import { loadFont as loadPlayfair } from '@remotion/google-fonts/PlayfairDisplay';

import { EDITOR_FIXED_DURATION_SECONDS } from '@/lib/editor-constants';

import { isVideoUrl } from './media-detect';

const FONT_REGISTRY: Record<string, { fontFamily: string }> = {
  'Inter': loadInter(),
  'Roboto': loadRoboto(),
  'Montserrat': loadMontserrat(),
  'Oswald': loadOswald(),
  'Playfair Display': loadPlayfair(),
};

function resolveFont(fontFamily?: string): string {
  const inter = FONT_REGISTRY['Inter']?.fontFamily ?? 'Inter';
  if (!fontFamily) return inter;
  return FONT_REGISTRY[fontFamily]?.fontFamily || fontFamily;
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EditorScript {
  hookText?: string;
  bodyText?: string;
  ctaText?: string;
}

export interface EditorStyle {
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
  ctaBackgroundColor?: string;
  align?: 'left' | 'center' | 'right';
  weight?: 'normal' | 'bold';
  italic?: boolean;
  underline?: boolean;
  backgroundDimming?: number;
}

export interface EditorSlide {
  url: string;
}

export interface EditorAudioTrack {
  name?: string;
  url: string;
  publicId?: string;
  source?: 'original' | 'library' | 'upload';
  volume?: number;
}

export interface EditorInputProps {
  backgroundUrl?: string;
  hookVideoUrl?: string;
  slides?: EditorSlide[];
  script: EditorScript;
  style: EditorStyle;
  layout: string;
  aspectRatio: string;
  contentType: string;
  noAnimation?: boolean;
  audioTrack?: EditorAudioTrack | null;
}

// ── Style helpers ──────────────────────────────────────────────────────────────

function textAlignFrom(align?: string): React.CSSProperties['textAlign'] {
  if (align === 'left' || align === 'center' || align === 'right') return align;
  return 'center';
}

// ── Layout → pixel positioning ─────────────────────────────────────────────────

interface LayoutCoords {
  top: string;
  left: string;
  right: string;
  bottom: string;
  justifyContent: string;
  alignItems: string;
  padding: number;
}

function layoutPosition(layout: string, width: number, _height: number): LayoutCoords {
  // Safe area: ≥6% of width so text never escapes phone-mockup overlay
  const p = Math.round(width * 0.06);

  switch (layout) {
    case 'centered':
    case 'wall_of_text':
      return { top: '0', left: '0', right: '0', bottom: '0', justifyContent: 'center', alignItems: 'center', padding: p };
    case 'top_caption':
      return { top: '0', left: '0', right: '0', bottom: 'auto', justifyContent: 'flex-start', alignItems: 'center', padding: p };
    case 'bottom_caption':
    case 'split_screen':
    case 'talking_head':
    case 'green_screen':
    case 'video_hook':
    default:
      return { top: 'auto', left: '0', right: '0', bottom: '0', justifyContent: 'flex-end', alignItems: 'center', padding: p };
  }
}

// ── Text block renderer (animated or static) ─────────────────────────────────────

function FadeInText({ text, style, startFrame, duration, noAnimation }: {
  text: string;
  style: React.CSSProperties;
  startFrame: number;
  duration: number;
  noAnimation?: boolean;
}) {
  const frame = useCurrentFrame();
  const localFrame = frame - startFrame;

  if (noAnimation) {
    return <div style={style}>{text}</div>;
  }

  if (localFrame < 0 || localFrame > duration) return null;

  const opacity = interpolate(localFrame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  const y = interpolate(localFrame, [0, 10], [20, 0], { extrapolateRight: 'clamp' });

  return <div style={{ opacity, transform: `translateY(${y}px)`, ...style }}>{text}</div>;
}

// ── EditorComposition ──────────────────────────────────────────────────────────

export function EditorComposition({
  backgroundUrl,
  hookVideoUrl,
  slides,
  script,
  style,
  layout,
  contentType,
  noAnimation: noAnimationFromProps,
  audioTrack,
}: EditorInputProps) {
  const { width, height, fps } = useVideoConfig();

  const noAnimation = noAnimationFromProps ?? (style as any)?.noAnimation;
  const isHookVideoContent = ['video_hook', 'ugc', 'talking_head'].includes(contentType);
  const isSlideshow = contentType === 'slideshow';

  const fontSize = style.fontSize || 20;
  const textBaseStyle: React.CSSProperties = {
    fontFamily: resolveFont(style.fontFamily),
    fontSize: `${fontSize}px`,
    color: style.color || '#ffffff',
    // Default to transparent (no dark slab over the whole video). Users can opt
    // into a Subtle / Strong preset via TextTab.
    backgroundColor: style.backgroundColor ?? 'transparent',
    textAlign: textAlignFrom(style.align),
    fontWeight: style.weight === 'bold' ? 'bold' : 'normal',
    fontStyle: style.italic ? 'italic' : 'normal',
    textDecoration: style.underline ? 'underline' : 'none',
    lineHeight: 1.6,
    letterSpacing: '0.02em',
    padding: '14px 20px',
    borderRadius: '8px',
    wordBreak: 'break-word',
    display: 'inline-block',
    maxWidth: '100%',
    // A subtle text shadow keeps light text legible on bright backgrounds
    // without the heavy slab.
    textShadow: '0 1px 3px rgba(0, 0, 0, 0.35)',
  };

  const pos = layoutPosition(layout, width, height);

  const hookInsetWidth = Math.round(width * 0.35);
  const hookInsetHeight = Math.round(height * 0.3);
  const hookInsetRight = Math.round(width * 0.02);
  const hookInsetTop = Math.round(height * 0.05);

  const activeText = script.hookText || script.bodyText || script.ctaText;
  const totalFrames = EDITOR_FIXED_DURATION_SECONDS * fps;
  const textStartFrame = noAnimation ? 0 : 10;
  const hookStartFrame = noAnimation ? 0 : 15;

  const bodyFontSize = `${Math.max(16, fontSize * 0.8)}px`;
  const ctaFontSize = `${Math.max(14, fontSize * 0.7)}px`;

  // Background dim: scrim between source media and text overlay so original
  // pixels (e.g. "STARTUP" on a laptop in stock photo) don't bleed through.
  // Default 0.3, user-configurable 0..0.8 via TextTab.
  const dimming = Math.max(0, Math.min(0.8, style.backgroundDimming ?? 0.3));
  const showDimming = Boolean(backgroundUrl) && dimming > 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Background media */}
      {backgroundUrl ? (
        isVideoUrl(backgroundUrl) ? (
          <Sequence from={0} durationInFrames={totalFrames}>
            <Video src={backgroundUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted loop />
          </Sequence>
        ) : (
          <Sequence from={0} durationInFrames={totalFrames}>
            <Img src={backgroundUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </Sequence>
        )
      ) : (
        <div style={{
          width: '100%', height: '100%',
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        }} />
      )}

      {/* Dimming scrim (only when there's a background and dim > 0) */}
      {showDimming && (
        <AbsoluteFill style={{ backgroundColor: `rgba(0, 0, 0, ${dimming})`, zIndex: 5 }} />
      )}

      {/* Text overlays */}
      {activeText && (
        <div style={{
          position: 'absolute',
          top: pos.top, left: pos.left, right: pos.right, bottom: pos.bottom,
          display: 'flex', justifyContent: pos.justifyContent, alignItems: pos.alignItems,
          padding: pos.padding, zIndex: 10,
        }}>
          <div style={{ maxWidth: '90%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {script.hookText && (
              <FadeInText
                text={script.hookText}
                style={textBaseStyle}
                startFrame={textStartFrame}
                duration={totalFrames - textStartFrame}
                noAnimation={noAnimation}
              />
            )}
            {script.bodyText && (
              <FadeInText
                text={script.bodyText}
                style={{ ...textBaseStyle, fontSize: bodyFontSize }}
                startFrame={noAnimation ? 0 : textStartFrame + 20}
                duration={totalFrames - textStartFrame - 20}
                noAnimation={noAnimation}
              />
            )}
            {script.ctaText && (
              <FadeInText
                text={script.ctaText}
                style={{
                  ...textBaseStyle,
                  fontSize: ctaFontSize,
                  fontWeight: 'bold',
                  backgroundColor: style.ctaBackgroundColor || 'rgba(134, 79, 254, 0.85)',
                }}
                startFrame={noAnimation ? 0 : textStartFrame + 40}
                duration={totalFrames - textStartFrame - 40}
                noAnimation={noAnimation}
              />
            )}
          </div>
        </div>
      )}

      {/* Hook video inset */}
      {isHookVideoContent && hookVideoUrl && (
        <Sequence from={hookStartFrame} durationInFrames={totalFrames - hookStartFrame}>
          <div style={{
            position: 'absolute', top: hookInsetTop, right: hookInsetRight,
            width: hookInsetWidth, height: hookInsetHeight,
            borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.3)', zIndex: 10,
          }}>
            {isVideoUrl(hookVideoUrl) ? (
              <Video src={hookVideoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted loop />
            ) : (
              <Img src={hookVideoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
          </div>
        </Sequence>
      )}

      {/* Background audio — baked into compiled MP4, played during preview */}
      {audioTrack && audioTrack.url && (
        <Audio
          src={audioTrack.url}
          volume={Math.max(0, Math.min(1, (audioTrack.volume ?? 80) / 100))}
        />
      )}

      {/* Slideshow preview strip */}
      {isSlideshow && slides && slides.length > 0 && (
        <Sequence from={30} durationInFrames={totalFrames - 30}>
          <div style={{
            position: 'absolute', bottom: Math.round(height * 0.15), left: 0, right: 0,
            display: 'flex', gap: 4, padding: '0 8px', justifyContent: 'center', zIndex: 10,
          }}>
            {slides.slice(0, 3).map((slide, i) => (
              <div key={i} style={{ width: Math.round(width * 0.18), height: Math.round(width * 0.18), borderRadius: 8, overflow: 'hidden' }}>
                <Img src={slide.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ))}
          </div>
        </Sequence>
      )}
    </AbsoluteFill>
  );
}
