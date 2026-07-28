// @ts-nocheck
import React from 'react';
import { AbsoluteFill, Audio, Img, useVideoConfig, Video, useCurrentFrame, interpolate } from 'remotion';

import { isVideoUrl } from './media-detect';
import { limitBodyMaybe, limitCtaMaybe, limitHookMaybe } from './text-limits';

interface Props {
  script: {
    hookText?: string;
    bodyText?: string;
    ctaText?: string;
  };
  style: {
    fontFamily?: string;
    fontSize?: number;
    color?: string;
    backgroundColor?: string;
    ctaBackgroundColor?: string;
    align?: 'left' | 'center' | 'right';
    weight?: 'normal' | 'bold';
    italic?: boolean;
    underline?: boolean;
    noAnimation?: boolean;
    backgroundDimming?: number;
  };
  mediaSlots?: {
    background?: { url: string };
  };
  audioTrack?: {
    url: string;
    volume?: number;
  } | null;
  audioUrl?: string | null;
  audioDurationMs?: number | null;
  previewMode?: boolean;
}

export function UGCAdComposition({ script, style, mediaSlots, audioTrack, audioUrl, previewMode }: Props) {
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();

  // Bug 2 — truncate overlay text so long Blitz-generated hook/body/cta
  // don't overflow the frame. Skipped in live preview (CSS handles overflow).
  const hookText = limitHookMaybe(script.hookText, previewMode);
  const bodyText = limitBodyMaybe(script.bodyText, previewMode);
  const ctaText = limitCtaMaybe(script.ctaText, previewMode);

  // Background dim: scrim between source media and text overlay.
  const dimming = Math.max(0, Math.min(0.8, style.backgroundDimming ?? 0.3));
  const showDimming = Boolean(mediaSlots?.background?.url) && dimming > 0;

  const fontFamily = style.fontFamily || 'Inter';
  const base = style.fontSize || 48;
  const color = style.color || '#ffffff';
  const captionBg = style.backgroundColor ?? '#000000';
  const hasBox = captionBg !== 'transparent';
  const ctaBg = style.ctaBackgroundColor || '#864FFE';
  const align = style.align || 'center';
  const alignItems = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
  const italicStyle = style.italic ? 'italic' : 'normal';
  const underlineDeco = style.underline ? 'underline' : 'none';
  const noAnimation = style.noAnimation === true;

  // usefastlane per-line highlight — the box hugs each wrapped line
  // (display:inline + box-decoration-break:clone), matching EditorComposition.
  const captionBoxStyle = hasBox
    ? { backgroundColor: captionBg, padding: '0.16em 0.42em', borderRadius: '0.18em', boxShadow: '0 6px 24px rgba(0,0,0,0.28)' }
    : { textShadow: '0 2px 10px rgba(0,0,0,0.55)', WebkitTextStroke: '0.6px rgba(0,0,0,0.4)' };
  const captionSpanBase = {
    fontFamily,
    color,
    fontStyle: italicStyle,
    textDecoration: underlineDeco,
    lineHeight: 1.5,
    letterSpacing: '-0.01em',
    wordBreak: 'break-word',
    display: 'inline',
    boxDecorationBreak: 'clone',
    WebkitBoxDecorationBreak: 'clone',
    ...captionBoxStyle,
  };

  const fadeIn = (from: number, to: number) => (
    noAnimation ? 1 : interpolate(frame, [from, to], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  );
  const riseIn = (from: number, to: number) => (
    noAnimation ? 0 : interpolate(frame, [from, to], [10, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  );

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {audioTrack && audioTrack.url && (
        <Audio
          src={audioTrack.url}
          volume={Math.max(0, Math.min(1, (audioTrack.volume ?? 80) / 100))}
        />
      )}
      {/* Blitz voice-over (Phase A). Mounts alongside audioTrack. */}
      {audioUrl && <Audio src={audioUrl} volume={1} />}
      {mediaSlots?.background?.url && (
        isVideoUrl(mediaSlots.background.url) ? (
          <Video
            src={mediaSlots.background.url}
            style={{ width, height, objectFit: 'cover', position: 'absolute' }}
            muted
            loop
          />
        ) : (
          <Img
            src={mediaSlots.background.url}
            style={{ width, height, objectFit: 'cover', position: 'absolute' }}
          />
        )
      )}

      {/* Dimming scrim */}
      {showDimming && (
        <AbsoluteFill style={{ backgroundColor: `rgba(0, 0, 0, ${dimming})`, zIndex: 5 }} />
      )}

      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems,
          padding: 40,
          gap: 16,
        }}
      >
        {hookText && (
          <div
            style={{
              maxWidth: '92%',
              textAlign: align,
              opacity: fadeIn(0, 15),
              transform: `translateY(${riseIn(0, 15)}px)`,
            }}
          >
            <span style={{ ...captionSpanBase, fontSize: base * 1.15, fontWeight: 800 }}>
              {hookText}
            </span>
          </div>
        )}

        {bodyText && (
          <div
            style={{
              maxWidth: '92%',
              textAlign: align,
              opacity: fadeIn(15, 30),
              transform: `translateY(${riseIn(15, 30)}px)`,
            }}
          >
            <span style={{ ...captionSpanBase, fontSize: base, fontWeight: style.weight === 'normal' ? 600 : 800 }}>
              {bodyText}
            </span>
          </div>
        )}

        {ctaText && (
          <div
            style={{
              backgroundColor: ctaBg,
              padding: '12px 22px',
              borderRadius: 999,
              maxWidth: '92%',
              opacity: fadeIn(30, 45),
              transform: `translateY(${riseIn(30, 45)}px)`,
            }}
          >
            <p
              style={{
                fontFamily,
                fontSize: base * 0.9,
                color: '#ffffff',
                fontWeight: 700,
                fontStyle: italicStyle,
                textDecoration: underlineDeco,
                textAlign: align,
                margin: 0,
                textShadow: '0 2px 4px rgba(0,0,0,0.35)',
              }}
            >
              {ctaText}
            </p>
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
