// @ts-nocheck
import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';

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
}

export function WallOfTextComposition({ script, style }: Props) {
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
    </AbsoluteFill>
  );
}
