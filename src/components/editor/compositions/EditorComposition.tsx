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
import { limitBodyMaybe, limitCtaMaybe, limitHookMaybe } from './text-limits';

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
  /**
   * ElevenLabs voice-over URL (Phase A Blitz audio). Distinct from
   * `audioTrack` (music). Both mount simultaneously.
   */
  audioUrl?: string | null;
  /**
   * Voice-over duration in ms. Currently informational only — the
   * per-Sequence duration decisions live in the parent Composition
   * definition, not here.
   */
  audioDurationMs?: number | null;
  /**
   * Total composition duration in seconds. When present, overrides
   * `EDITOR_FIXED_DURATION_SECONDS` so voice-over runs through.
   * Callers must ensure the root Composition's `durationInFrames`
   * matches, otherwise Remotion cuts the tail.
   */
  durationSeconds?: number;
  /**
   * When true, skip the `limitHook/Body/Cta` character chop — live browser
   * previews rely on CSS `line-clamp`/overflow instead. Never set for
   * compile-to-MP4 mounts (Remotion has no CSS overflow control).
   */
  previewMode?: boolean;
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

  // text-align belongs on the block wrapper; the highlight span is display:inline
  // (transforms are ignored on inline elements, so animation lives on the wrapper).
  const { textAlign, ...spanStyle } = style;

  if (noAnimation) {
    return (
      <div style={{ width: '100%', textAlign }}>
        <span style={spanStyle}>{text}</span>
      </div>
    );
  }

  if (localFrame < 0 || localFrame > duration) return null;

  const opacity = interpolate(localFrame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  const y = interpolate(localFrame, [0, 10], [20, 0], { extrapolateRight: 'clamp' });

  return (
    <div style={{ opacity, transform: `translateY(${y}px)`, width: '100%', textAlign }}>
      <span style={spanStyle}>{text}</span>
    </div>
  );
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
  audioUrl,
  durationSeconds,
  previewMode,
}: EditorInputProps) {
  const { width, height, fps } = useVideoConfig();

  const noAnimation = noAnimationFromProps ?? (style as any)?.noAnimation;
  const isHookVideoContent = ['video_hook', 'ugc', 'talking_head'].includes(contentType);
  const isSlideshow = contentType === 'slideshow';

  // WYSIWYG: scale editor font (authored at ~360px phone mockup) to the 1080px
  // composition space, matching the engine renderer exactly (fontSize * 1.5).
  // This Player renders the same 1080px composition and is scaled down by CSS,
  // so the multiplier MUST match the engine or published video text drifts bigger.
  const fontSize = Math.round((style.fontSize || 30) * 1.5);

  // ── Canonical caption spec (MIRRORED byte-for-byte with the engine renderer
  // at NativPost-engine/video-renderer/src/compositions/EditorComposition.tsx).
  // Default look: per-line "highlight" — a solid bright box that hugs each line
  // of text (box-decoration-break: clone), the usefastlane style. Users can set
  // backgroundColor to 'transparent' for a boxless stroke+shadow caption.
  const captionBg = style.backgroundColor ?? '#000000';
  const hasBox = captionBg !== 'transparent';
  const textBaseStyle: React.CSSProperties = {
    fontFamily: resolveFont(style.fontFamily),
    fontSize: `${fontSize}px`,
    color: style.color || '#ffffff',
    textAlign: textAlignFrom(style.align),
    fontWeight: style.weight === 'normal' ? 600 : 800,
    fontStyle: style.italic ? 'italic' : 'normal',
    textDecoration: style.underline ? 'underline' : 'none',
    lineHeight: 1.5,
    letterSpacing: '-0.01em',
    wordBreak: 'break-word',
    // Per-line highlight requires display:inline so each wrapped line gets its
    // own box; box-decoration-break clones padding + radius onto every line.
    display: 'inline',
    boxDecorationBreak: 'clone',
    WebkitBoxDecorationBreak: 'clone',
    ...(hasBox
      ? {
          backgroundColor: captionBg,
          // em-based padding/radius scale with font size, so the box hugs the
          // text identically at preview (small px) and render (large px).
          padding: '0.16em 0.42em',
          borderRadius: '0.18em',
          boxShadow: '0 6px 24px rgba(0, 0, 0, 0.28)',
        }
      : {
          textShadow: '0 2px 10px rgba(0, 0, 0, 0.55)',
          WebkitTextStroke: '0.6px rgba(0, 0, 0, 0.4)',
        }),
  };

  const pos = layoutPosition(layout, width, height);

  const hookInsetWidth = Math.round(width * 0.35);
  const hookInsetHeight = Math.round(height * 0.3);
  const hookInsetRight = Math.round(width * 0.02);
  const hookInsetTop = Math.round(height * 0.05);

  // Bug 2 — truncate overlay text so long Blitz-generated hook/body/cta
  // don't overflow the frame.
  const hookText = limitHookMaybe(script.hookText, previewMode);
  const bodyText = limitBodyMaybe(script.bodyText, previewMode);
  const ctaText = limitCtaMaybe(script.ctaText, previewMode);
  const activeText = hookText || bodyText || ctaText;
  const totalFrames = (durationSeconds ?? EDITOR_FIXED_DURATION_SECONDS) * fps;
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
            {hookText && (
              <FadeInText
                text={hookText}
                style={textBaseStyle}
                startFrame={textStartFrame}
                duration={totalFrames - textStartFrame}
                noAnimation={noAnimation}
              />
            )}
            {bodyText && (
              <FadeInText
                text={bodyText}
                style={{ ...textBaseStyle, fontSize: bodyFontSize }}
                startFrame={noAnimation ? 0 : textStartFrame + 20}
                duration={totalFrames - textStartFrame - 20}
                noAnimation={noAnimation}
              />
            )}
            {ctaText && (
              <FadeInText
                text={ctaText}
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

      {/* ElevenLabs voice-over (Phase A Blitz). Independent of audioTrack;
          both mount together. Volume fixed at 1.0 — TTS is already leveled. */}
      {audioUrl && (
        <Audio src={audioUrl} volume={1} />
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
