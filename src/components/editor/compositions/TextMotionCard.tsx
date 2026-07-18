// @ts-nocheck
import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';

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
    align?: 'left' | 'center' | 'right';
  };
  previewMode?: boolean;
}

export function TextMotionCard({ script, style, previewMode }: Props) {
  const { width, height } = useVideoConfig();

  const fontFamily = style.fontFamily || 'Inter';
  const fontSize = style.fontSize || 48;
  const color = style.color || '#ffffff';
  const bgColor = style.backgroundColor || '#1a1a2e';
  const align = style.align || 'center';

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
      {limitHookMaybe(script.hookText, previewMode) && (
        <p
          style={{
            fontFamily,
            fontSize: fontSize * 1.2,
            color,
            fontWeight: 'bold',
            textAlign: align,
            marginBottom: 24,
          }}
        >
          {limitHookMaybe(script.hookText, previewMode)}
        </p>
      )}
      {limitBodyMaybe(script.bodyText, previewMode) && (
        <p
          style={{
            fontFamily,
            fontSize,
            color,
            textAlign: align,
            lineHeight: 1.5,
            marginBottom: 24,
            opacity: 0.9,
          }}
        >
          {limitBodyMaybe(script.bodyText, previewMode)}
        </p>
      )}
      {limitCtaMaybe(script.ctaText, previewMode) && (
        <p
          style={{
            fontFamily,
            fontSize: fontSize * 0.8,
            color,
            fontWeight: 'bold',
            textAlign: align,
            opacity: 0.7,
          }}
        >
          {limitCtaMaybe(script.ctaText, previewMode)}
        </p>
      )}
    </AbsoluteFill>
  );
}
