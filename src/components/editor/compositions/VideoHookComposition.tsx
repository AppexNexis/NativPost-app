// @ts-nocheck
import React from 'react';
import { AbsoluteFill, Audio, Sequence, useVideoConfig, Video } from 'remotion';

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
    hookVideo?: { url: string };
    demoVideo?: { url: string };
  };
  audioTrack?: {
    url: string;
    volume?: number;
  } | null;
}

export function VideoHookComposition({ script, style, mediaSlots, audioTrack }: Props) {
  const { width, height, fps } = useVideoConfig();

  const fontFamily = style.fontFamily || 'Inter';
  const fontSize = style.fontSize || 48;
  const color = style.color || '#ffffff';
  const bgColor = style.backgroundColor || 'rgba(0,0,0,0.5)';

  const hookFrames = 3 * fps;
  const bodyFrames = 5 * fps;
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
        <AbsoluteFill>
          {mediaSlots?.hookVideo?.url ? (
            <Video
              src={mediaSlots.hookVideo.url}
              style={{ width, height, objectFit: 'cover', position: 'absolute' }}
              muted
            />
          ) : (
            <div style={{ width, height, backgroundColor: '#1a1a2e' }} />
          )}
          {script.hookText && (
            <AbsoluteFill
              style={{
                display: 'flex',
                justifyContent: 'center',
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
                    fontSize: fontSize * 1.2,
                    color,
                    fontWeight: 'bold',
                    textAlign: 'center',
                    lineHeight: 1.3,
                  }}
                >
                  {script.hookText}
                </p>
              </div>
            </AbsoluteFill>
          )}
        </AbsoluteFill>
      </Sequence>

      {/* Body with demo video */}
      <Sequence from={hookFrames} durationInFrames={bodyFrames}>
        <AbsoluteFill>
          {mediaSlots?.demoVideo?.url ? (
            <Video
              src={mediaSlots.demoVideo.url}
              style={{ width, height, objectFit: 'cover', position: 'absolute' }}
              muted
            />
          ) : (
            <div style={{ width, height, backgroundColor: '#16213e' }} />
          )}
          {script.bodyText && (
            <AbsoluteFill
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-end',
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
                    textAlign: 'center',
                    lineHeight: 1.4,
                  }}
                >
                  {script.bodyText}
                </p>
              </div>
            </AbsoluteFill>
          )}
        </AbsoluteFill>
      </Sequence>

      {/* CTA */}
      <Sequence from={hookFrames + bodyFrames} durationInFrames={ctaFrames}>
        <AbsoluteFill
          style={{
            backgroundColor: '#1a1a2e',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 40,
          }}
        >
          {script.ctaText && (
            <p
              style={{
                fontFamily,
                fontSize: fontSize * 0.9,
                color,
                fontWeight: 'bold',
                textAlign: 'center',
              }}
            >
              {script.ctaText}
            </p>
          )}
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
}
