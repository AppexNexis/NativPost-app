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

export function GreenScreenComposition({ script, style, mediaSlots, audioTrack }: Props) {
  const { width, height } = useVideoConfig();

  const fontFamily = style.fontFamily || 'Inter';
  const fontSize = style.fontSize || 48;
  const color = style.color || '#ffffff';
  const bgColor = style.backgroundColor || '#000000';
  const align = style.align || 'center';

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      {audioTrack && audioTrack.url && (
        <Audio
          src={audioTrack.url}
          volume={Math.max(0, Math.min(1, (audioTrack.volume ?? 80) / 100))}
        />
      )}
      {/* Background video or solid color */}
      {mediaSlots?.background?.url ? (
        <video
          src={mediaSlots.background.url}
          style={{ width, height, objectFit: 'cover', position: 'absolute' }}
          muted
          loop
        />
      ) : (
        <div
          style={{
            width,
            height,
            backgroundColor: '#00ff00',
            position: 'absolute',
          }}
        />
      )}

      {/* Text overlay */}
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: align === 'center' ? 'center' : align === 'left' ? 'flex-start' : 'flex-end',
          padding: 40,
        }}
      >
        {script.hookText && (
          <p
            style={{
              fontFamily,
              fontSize: fontSize * 1.2,
              color,
              fontWeight: 'bold',
              textAlign: align,
              textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
              marginBottom: 16,
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
              textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
              marginBottom: 16,
            }}
          >
            {script.bodyText}
          </p>
        )}
        {script.ctaText && (
          <p
            style={{
              fontFamily,
              fontSize: fontSize * 0.8,
              color,
              fontWeight: 'bold',
              textAlign: align,
              textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
            }}
          >
            {script.ctaText}
          </p>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
