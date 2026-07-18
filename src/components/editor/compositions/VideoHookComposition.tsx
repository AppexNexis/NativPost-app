// @ts-nocheck
import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, useVideoConfig, Video, useCurrentFrame, interpolate } from 'remotion';

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
    hookVideo?: { url: string };
    demoVideo?: { url: string };
  };
  audioTrack?: {
    url: string;
    volume?: number;
  } | null;
  previewMode?: boolean;
  // Poster / thumbnail shown when a media slot is empty, so we don't render a
  // solid `#1a1a2e` / `#16213e` block. Threaded from ContentPreview.
  posterUrl?: string;
}

// Shared text overlay used inside every Sequence — the same stacked+centered
// column so the viewer sees hook + body + cta together on every background
// clip. Fade-in stagger honors style.noAnimation.
function TextOverlay({ script, style, previewMode }: { script: Props['script']; style: Props['style']; previewMode?: boolean }) {
  // Bug 2 — truncate overlay text at render limits with "…" so long
  // Blitz-generated hook/body/cta don't overflow the frame. Skipped in
  // live preview (CSS handles overflow).
  const hookText = limitHookMaybe(script.hookText, previewMode);
  const bodyText = limitBodyMaybe(script.bodyText, previewMode);
  const ctaText = limitCtaMaybe(script.ctaText, previewMode);
  const frame = useCurrentFrame();
  const fontFamily = style.fontFamily || 'Inter';
  const base = style.fontSize || 48;
  const color = style.color || '#ffffff';
  const bgColor = style.backgroundColor || 'rgba(0,0,0,0.5)';
  const ctaBg = style.ctaBackgroundColor || '#864FFE';
  const align = style.align || 'center';
  const alignItems = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
  const bodyWeight = style.weight === 'bold' ? 700 : 400;
  const italicStyle = style.italic ? 'italic' : 'normal';
  const underlineDeco = style.underline ? 'underline' : 'none';
  const noAnimation = style.noAnimation === true;

  const fadeIn = (from: number, to: number) => (
    noAnimation ? 1 : interpolate(frame, [from, to], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  );
  const riseIn = (from: number, to: number) => (
    noAnimation ? 0 : interpolate(frame, [from, to], [10, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  );

  return (
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
            backgroundColor: bgColor,
            padding: '14px 22px',
            borderRadius: 8,
            maxWidth: '92%',
            opacity: fadeIn(0, 15),
            transform: `translateY(${riseIn(0, 15)}px)`,
          }}
        >
          <p
            style={{
              fontFamily,
              fontSize: base * 1.15,
              color,
              fontWeight: 700,
              fontStyle: italicStyle,
              textDecoration: underlineDeco,
              textAlign: align,
              lineHeight: 1.3,
              margin: 0,
              textShadow: '0 2px 4px rgba(0,0,0,0.35)',
            }}
          >
            {hookText}
          </p>
        </div>
      )}

      {bodyText && (
        <div
          style={{
            backgroundColor: bgColor,
            padding: '12px 20px',
            borderRadius: 8,
            maxWidth: '92%',
            opacity: fadeIn(15, 30),
            transform: `translateY(${riseIn(15, 30)}px)`,
          }}
        >
          <p
            style={{
              fontFamily,
              fontSize: base,
              color,
              fontWeight: bodyWeight,
              fontStyle: italicStyle,
              textDecoration: underlineDeco,
              textAlign: align,
              lineHeight: 1.4,
              margin: 0,
              textShadow: '0 2px 4px rgba(0,0,0,0.35)',
            }}
          >
            {bodyText}
          </p>
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
  );
}

export function VideoHookComposition({ script, style, mediaSlots, audioTrack, previewMode, posterUrl }: Props) {
  const { width, height, fps } = useVideoConfig();

  // Background dim: scrim between source media and text overlay.
  const dimming = Math.max(0, Math.min(0.8, style.backgroundDimming ?? 0.3));
  const DimScrim = dimming > 0
    ? ({ children, ...rest }: { children?: React.ReactNode; style?: React.CSSProperties }) => (
        <AbsoluteFill {...rest}>
          {children}
          <AbsoluteFill style={{ backgroundColor: `rgba(0, 0, 0, ${dimming})`, zIndex: 5 }} />
        </AbsoluteFill>
      )
    : ({ children, ...rest }: { children?: React.ReactNode; style?: React.CSSProperties }) => (
        <AbsoluteFill {...rest}>{children}</AbsoluteFill>
      );

  // Frame budget: EDITOR_TOTAL_FRAMES = 8s * 30fps = 240. Sequences must fit
  // inside 240 or the tail Sequence never enters the Player window.
  const hookFrames = 2 * fps;
  const bodyFrames = 4 * fps;
  const ctaFrames = 2 * fps;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {audioTrack && audioTrack.url && (
        <Audio
          src={audioTrack.url}
          volume={Math.max(0, Math.min(1, (audioTrack.volume ?? 80) / 100))}
        />
      )}
      {/* Hook video */}
      <Sequence from={0} durationInFrames={hookFrames}>
        <DimScrim>
          {mediaSlots?.hookVideo?.url ? (
            isVideoUrl(mediaSlots.hookVideo.url) ? (
              <Video
                src={mediaSlots.hookVideo.url}
                style={{ width, height, objectFit: 'cover', position: 'absolute' }}
                muted
                loop
              />
            ) : (
              <Img
                src={mediaSlots.hookVideo.url}
                style={{ width, height, objectFit: 'cover', position: 'absolute' }}
              />
            )
          ) : posterUrl ? (
            <Img
              src={posterUrl}
              style={{ width, height, objectFit: 'cover', position: 'absolute' }}
            />
          ) : (
            <div style={{ width, height, backgroundColor: '#1a1a2e' }} />
          )}
          <TextOverlay script={script} style={style} previewMode={previewMode} />
        </DimScrim>
      </Sequence>

      {/* Body with demo video */}
      <Sequence from={hookFrames} durationInFrames={bodyFrames}>
        <DimScrim>
          {mediaSlots?.demoVideo?.url ? (
            isVideoUrl(mediaSlots.demoVideo.url) ? (
              <Video
                src={mediaSlots.demoVideo.url}
                style={{ width, height, objectFit: 'cover', position: 'absolute' }}
                muted
                loop
              />
            ) : (
              <Img
                src={mediaSlots.demoVideo.url}
                style={{ width, height, objectFit: 'cover', position: 'absolute' }}
              />
            )
          ) : posterUrl ? (
            <Img
              src={posterUrl}
              style={{ width, height, objectFit: 'cover', position: 'absolute' }}
            />
          ) : (
            <div style={{ width, height, backgroundColor: '#16213e' }} />
          )}
          <TextOverlay script={script} style={style} previewMode={previewMode} />
        </DimScrim>
      </Sequence>

      {/* CTA — solid brand background beneath the same overlay */}
      <Sequence from={hookFrames + bodyFrames} durationInFrames={ctaFrames}>
        <AbsoluteFill style={{ backgroundColor: '#1a1a2e' }}>
          <TextOverlay script={script} style={style} previewMode={previewMode} />
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
}
