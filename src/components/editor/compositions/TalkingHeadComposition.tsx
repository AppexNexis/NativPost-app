// @ts-nocheck
import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';

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
}

export function TalkingHeadComposition({ script, style, mediaSlots }: Props) {
  const { width, height, fps, durationInFrames } = useVideoConfig();

  const hookFrames = 3 * fps;
  const bodyFrames = 5 * fps;
  const ctaFrames = 2 * fps;

  const fontFamily = style.fontFamily || 'Inter';
  const fontSize = style.fontSize || 48;
  const color = style.color || '#ffffff';
  const bgColor = style.backgroundColor || 'rgba(0,0,0,0.5)';
  const align = style.align || 'center';

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Background video */}
      {mediaSlots?.background?.url && (
        <video
          src={mediaSlots.background.url}
          style={{ width, height, objectFit: 'cover', position: 'absolute' }}
          muted
          loop
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
        {/* Hook */}
        {script.hookText && (
          <Sequence from={0} durationInFrames={hookFrames}>
            <div
              style={{
                backgroundColor: bgColor,
                padding: '16px 24px',
                borderRadius: 8,
                maxWidth: '90%',
              }}
            >
              <p
                style={{
                  fontFamily,
                  fontSize: fontSize * 1.2,
                  color,
                  fontWeight: 'bold',
                  textAlign: align,
                  lineHeight: 1.3,
                }}
              >
                {script.hookText}
              </p>
            </div>
          </Sequence>
        )}

        {/* Body */}
        {script.bodyText && (
          <Sequence from={hookFrames} durationInFrames={bodyFrames}>
            <div
              style={{
                backgroundColor: bgColor,
                padding: '16px 24px',
                borderRadius: 8,
                maxWidth: '90%',
              }}
            >
              <p
                style={{
                  fontFamily,
                  fontSize,
                  color,
                  textAlign: align,
                  lineHeight: 1.4,
                }}
              >
                {script.bodyText}
              </p>
            </div>
          </Sequence>
        )}

        {/* CTA */}
        {script.ctaText && (
          <Sequence from={hookFrames + bodyFrames} durationInFrames={ctaFrames}>
            <div
              style={{
                backgroundColor: bgColor,
                padding: '12px 20px',
                borderRadius: 8,
                maxWidth: '90%',
              }}
            >
              <p
                style={{
                  fontFamily,
                  fontSize: fontSize * 0.9,
                  color,
                  fontWeight: 'bold',
                  textAlign: align,
                }}
              >
                {script.ctaText}
              </p>
            </div>
          </Sequence>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
