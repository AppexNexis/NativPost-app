// @ts-nocheck
import React from 'react';
import { AbsoluteFill, Audio, Sequence, useVideoConfig } from 'remotion';

import { limitBodyMaybe, limitHookMaybe } from './text-limits';

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
    backgroundDimming?: number;
  };
  mediaSlots?: {
    slides?: Array<{ url: string }>;
  };
  audioTrack?: {
    url: string;
    volume?: number;
  } | null;
  previewMode?: boolean;
}

export function DataStoryComposition({ script, style, mediaSlots, audioTrack, previewMode }: Props) {
  const { width, height, fps } = useVideoConfig();

  // Background dim: scrim between source media and text overlay.
  const dimming = Math.max(0, Math.min(0.8, style.backgroundDimming ?? 0.3));

  const fontFamily = style.fontFamily || 'Inter';
  const fontSize = style.fontSize || 48;
  const color = style.color || '#ffffff';
  const bgColor = style.backgroundColor || 'rgba(0,0,0,0.6)';
  const align = style.align || 'center';

  const slides = mediaSlots?.slides || [];
  const slideCopy = script.slideCopy || [];
  const defaultDuration = 3;

  let frameOffset = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a1a' }}>
      {audioTrack && audioTrack.url && (
        <Audio
          src={audioTrack.url}
          volume={Math.max(0, Math.min(1, (audioTrack.volume ?? 80) / 100))}
        />
      )}
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
                alt={`Data ${idx + 1}`}
                style={{
                  width,
                  height,
                  objectFit: 'cover',
                  position: 'absolute',
                }}
              />
              {/* Dimming scrim */}
              {dimming > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    width,
                    height,
                    backgroundColor: `rgba(0, 0, 0, ${dimming})`,
                    zIndex: 5,
                  }}
                />
              )}
              {copyText && (
                <AbsoluteFill
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: 60,
                  }}
                >
                  <div
                    style={{
                      backgroundColor: bgColor,
                      padding: '24px 32px',
                      borderRadius: 12,
                      maxWidth: '85%',
                    }}
                  >
                    <p
                      style={{
                        fontFamily,
                        fontSize: fontSize * 1.1,
                        color,
                        fontWeight: 'bold',
                        textAlign: align,
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

      {/* Fallback: hook text if no slides */}
      {slides.length === 0 && limitHookMaybe(script.hookText, previewMode) && (
        <Sequence from={0} durationInFrames={fps * 3}>
          <AbsoluteFill
            style={{
              backgroundColor: '#0a0a1a',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              padding: 60,
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
              {limitHookMaybe(script.hookText, previewMode)}
            </p>
            {limitBodyMaybe(script.bodyText, previewMode) && (
              <p
                style={{
                  fontFamily,
                  fontSize,
                  color,
                  textAlign: 'center',
                  marginTop: 20,
                  opacity: 0.9,
                }}
              >
                {limitBodyMaybe(script.bodyText, previewMode)}
              </p>
            )}
          </AbsoluteFill>
        </Sequence>
      )}
    </AbsoluteFill>
  );
}
