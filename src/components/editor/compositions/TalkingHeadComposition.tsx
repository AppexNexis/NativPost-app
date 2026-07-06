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
    background?: { url: string };
  };
  audioTrack?: {
    url: string;
    volume?: number;
  } | null;
}

export function TalkingHeadComposition({ script, style, mediaSlots, audioTrack }: Props) {
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
      {/* Background video — use Remotion <Video> so playback syncs with the
          Player timeline (plain HTML <video> only shows the first frame). */}
      {mediaSlots?.background?.url && (
        <Video
          src={mediaSlots.background.url}
          style={{ width, height, objectFit: 'cover', position: 'absolute' }}
          muted
        />
      )}

      {/* Text overlay — each Sequence gets its own AbsoluteFill so flex layout
          actually positions the caption. Wrapping Sequences inside a flex
          parent doesn't work because Sequence renders as position:absolute,
          which drops out of flex flow entirely. */}
      {script.hookText && (
        <Sequence from={0} durationInFrames={hookFrames}>
          <AbsoluteFill
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: align === 'center' ? 'center' : align === 'left' ? 'flex-start' : 'flex-end',
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
                  textAlign: align,
                  lineHeight: 1.3,
                  margin: 0,
                }}
              >
                {script.hookText}
              </p>
            </div>
          </AbsoluteFill>
        </Sequence>
      )}

      {script.bodyText && (
        <Sequence from={hookFrames} durationInFrames={bodyFrames}>
          <AbsoluteFill
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: align === 'center' ? 'center' : align === 'left' ? 'flex-start' : 'flex-end',
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
                  textAlign: align,
                  lineHeight: 1.4,
                  margin: 0,
                }}
              >
                {script.bodyText}
              </p>
            </div>
          </AbsoluteFill>
        </Sequence>
      )}

      {script.ctaText && (
        <Sequence from={hookFrames + bodyFrames} durationInFrames={ctaFrames}>
          <AbsoluteFill
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: align === 'center' ? 'center' : align === 'left' ? 'flex-start' : 'flex-end',
              padding: 40,
            }}
          >
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
                  margin: 0,
                }}
              >
                {script.ctaText}
              </p>
            </div>
          </AbsoluteFill>
        </Sequence>
      )}
      {audioTrack && audioTrack.url && (
        <Audio
          src={audioTrack.url}
          volume={Math.max(0, Math.min(1, (audioTrack.volume ?? 80) / 100))}
        />
      )}
    </AbsoluteFill>
  );
}
