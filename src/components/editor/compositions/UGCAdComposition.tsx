// @ts-nocheck
import React from 'react';
import { AbsoluteFill, Audio, useVideoConfig } from 'remotion';

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
    align?: 'left' | 'center' | 'right';
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

  const fontFamily = style.fontFamily || 'Inter';
  const fontSize = style.fontSize || 48;
  const color = style.color || '#ffffff';
  const bgColor = style.backgroundColor || 'rgba(0,0,0,0.5)';
  const align = style.align || 'center';

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {audioTrack && audioTrack.url && (
        <Audio
          src={audioTrack.url}
          volume={Math.max(0, Math.min(1, (audioTrack.volume ?? 80) / 100))}
        />
      )}
      {mediaSlots?.background?.url && (
        <video
          src={mediaSlots.background.url}
          style={{ width, height, objectFit: 'cover', position: 'absolute' }}
          muted
          loop
        />
      )}

      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          alignItems: align === 'center' ? 'center' : align === 'left' ? 'flex-start' : 'flex-end',
          padding: 40,
        }}
      >
        <div
          style={{
            backgroundColor: bgColor,
            padding: '20px 28px',
            borderRadius: 12,
            maxWidth: '90%',
          }}
        >
          {script.hookText && (
            <p
              style={{
                fontFamily,
                fontSize: fontSize * 1.1,
                color,
                fontWeight: 'bold',
                textAlign: align,
                marginBottom: 12,
              }}
            >
              {script.hookText}
            </p>
          )}
          {script.bodyText && (
            <p
              style={{
                fontFamily,
                fontSize,
                color,
                textAlign: align,
                lineHeight: 1.4,
                marginBottom: 12,
              }}
            >
              {script.bodyText}
            </p>
          )}
          {script.ctaText && (
            <p
              style={{
                fontFamily,
                fontSize: fontSize * 0.85,
                color,
                fontWeight: 'bold',
                textAlign: align,
              }}
            >
              {script.ctaText}
            </p>
          )}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
