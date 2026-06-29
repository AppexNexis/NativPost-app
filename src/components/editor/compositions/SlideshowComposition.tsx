// @ts-nocheck
import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';

interface Props {
  script: {
    hookText?: string;
    bodyText?: string;
    ctaText?: string;
    slideCopy?: Array<string | { text: string; durationSeconds?: number }>;
  };
  style: {
    fontFamily?: string;
    fontSize?: number;
    color?: string;
    backgroundColor?: string;
    align?: 'left' | 'center' | 'right';
  };
  mediaSlots?: {
    slides?: Array<{ url: string }>;
  };
}

export function SlideshowComposition({ script, style, mediaSlots }: Props) {
  const { width, height, fps } = useVideoConfig();

  const fontFamily = style.fontFamily || 'Inter';
  const fontSize = style.fontSize || 48;
  const color = style.color || '#ffffff';
  const bgColor = style.backgroundColor || 'rgba(0,0,0,0.6)';

  const slides = mediaSlots?.slides || [];
  const slideCopy = script.slideCopy || [];
  const defaultDuration = 3; // seconds per slide

  let frameOffset = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {slides.map((slide, idx) => {
        const copyItem = slideCopy[idx];
        const copyText = typeof copyItem === 'string' ? copyItem : copyItem?.text || '';
        const duration = typeof copyItem === 'object' && copyItem?.durationSeconds
          ? copyItem.durationSeconds
          : defaultDuration;
        const durationFrames = Math.round(duration * fps);

        const currentFrame = frameOffset;
        frameOffset += durationFrames;

        return (
          <Sequence key={idx} from={currentFrame} durationInFrames={durationFrames}>
            <AbsoluteFill>
              <img
                src={slide.url}
                alt={`Slide ${idx + 1}`}
                style={{
                  width,
                  height,
                  objectFit: 'cover',
                  position: 'absolute',
                }}
              />
              {copyText && (
                <AbsoluteFill
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    padding: 40,
                  }}
                >
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
                        fontWeight: 'bold',
                        textAlign: 'center',
                        lineHeight: 1.3,
                      }}
                    >
                      {copyText}
                    </p>
                  </div>
                </AbsoluteFill>
              )}
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {/* Hook overlay at start if no slides */}
      {slides.length === 0 && script.hookText && (
        <Sequence from={0} durationInFrames={fps * 3}>
          <AbsoluteFill
            style={{
              backgroundColor: '#1a1a2e',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              padding: 40,
            }}
          >
            <p
              style={{
                fontFamily,
                fontSize: fontSize * 1.2,
                color,
                fontWeight: 'bold',
                textAlign: 'center',
              }}
            >
              {script.hookText}
            </p>
          </AbsoluteFill>
        </Sequence>
      )}
    </AbsoluteFill>
  );
}
