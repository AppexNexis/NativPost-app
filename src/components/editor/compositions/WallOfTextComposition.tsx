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
  audioTrack?: {
    url: string;
    volume?: number;
  } | null;
}

export function WallOfTextComposition({ script, style, audioTrack }: Props) {
  const { width, height } = useVideoConfig();

  const fontFamily = style.fontFamily || 'Inter';
  const fontSize = style.fontSize || 64;
  const color = style.color || '#ffffff';
  const bgColor = style.backgroundColor || '#000000';
  const align = style.align || 'center';

  const allText = [script.hookText, script.bodyText, script.ctaText]
    .filter(Boolean)
    .join(' — ');

  return (
    <AbsoluteFill
      style={{
        backgroundColor: bgColor,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: align === 'center' ? 'center' : align === 'left' ? 'flex-start' : 'flex-end',
        padding: 60,
      }}
    >
      <p
        style={{
          fontFamily,
          fontSize,
          color,
          fontWeight: 'bold',
          textAlign: align,
          lineHeight: 1.2,
          maxWidth: '100%',
          wordBreak: 'break-word',
        }}
      >
        {allText}
      </p>
      {audioTrack && audioTrack.url && (
        <Audio
          src={audioTrack.url}
          volume={Math.max(0, Math.min(1, (audioTrack.volume ?? 80) / 100))}
        />
      )}
    </AbsoluteFill>
  );
}
