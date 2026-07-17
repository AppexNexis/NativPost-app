// @ts-nocheck
import React from 'react';
import { AbsoluteFill, Audio, Img, useVideoConfig, Video, useCurrentFrame, interpolate } from 'remotion';

import { isVideoUrl } from './media-detect';
import { limitBody, limitCta, limitHook } from './text-limits';

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
}

export function UGCAdComposition({ script, style, mediaSlots, audioTrack }: Props) {
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();

  // Bug 2 — truncate overlay text so long Blitz-generated hook/body/cta
  // don't overflow the frame.
  const hookText = limitHook(script.hookText);
  const bodyText = limitBody(script.bodyText);
  const ctaText = limitCta(script.ctaText);

  // Background dim: scrim between source media and text overlay.
  const dimming = Math.max(0, Math.min(0.8, style.backgroundDimming ?? 0.3));
  const showDimming = Boolean(mediaSlots?.background?.url) && dimming > 0;

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
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {audioTrack && audioTrack.url && (
        <Audio
          src={audioTrack.url}
          volume={Math.max(0, Math.min(1, (audioTrack.volume ?? 80) / 100))}
        />
      )}
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
    </AbsoluteFill>
  );
}
