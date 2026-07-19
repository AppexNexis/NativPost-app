// @ts-nocheck
import React from 'react';
import { AbsoluteFill, Audio, Img, useVideoConfig, Video, useCurrentFrame, interpolate } from 'remotion';

import { isVideoUrl } from './media-detect';
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
    ctaBackgroundColor?: string;
    align?: 'left' | 'center' | 'right';
    weight?: 'normal' | 'bold';
    italic?: boolean;
    underline?: boolean;
    noAnimation?: boolean;
    backgroundDimming?: number;
  };
  mediaSlots?: {
    background?: { url: string };
    hookVideo?: { url: string };
    demoVideo?: { url: string };
  };
  audioTrack?: {
    url: string;
    volume?: number;
  } | null;
  previewMode?: boolean;
  // Poster / thumbnail shown when no media slot resolves to a usable URL.
  posterUrl?: string;
}

/**
 * VideoHookComposition — single top-level media element (mirrors
 * TalkingHeadComposition) with the hook/body/cta text stacked as timed
 * fade-in overlays.
 *
 * Previously this composition split the timeline into 3 `<Sequence>` blocks
 * (Hook 2s + Body 4s + CTA 2s) each mounting its OWN `<Video>` reading its own
 * slot (hookVideo / demoVideo). Two failure modes came out of that split:
 *   1. Any missing per-Sequence slot (demoVideo empty, hookVideo empty) fell
 *      back to solid #16213e — the "video hook demo shows a dark frame" bug
 *      reported across ContentPreview / Blitz / Editor previews.
 *   2. `loop` on the Player remounted every Sequence's `<Video>` every cycle;
 *      when a slot URL resolved to a jpg (Cloudinary /video/upload/*.jpg
 *      frame-extract, or an image-source Blitz template), the video decoder
 *      retry-loop ballooned Chrome memory to 500–800 MB and crashed the tab.
 *
 * This rewrite renders ONE `<Video>`/`<Img>` at the top level using the first
 * available slot (background → hookVideo → demoVideo → posterUrl). Text is
 * overlaid with staggered `interpolate` fade-ins — no Sequence remount, no
 * multi-decoder mount, no split-slot dependency.
 */
export function VideoHookComposition({ script, style, mediaSlots, audioTrack, previewMode, posterUrl }: Props) {
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();

  const hookText = limitHookMaybe(script.hookText, previewMode);
  const bodyText = limitBodyMaybe(script.bodyText, previewMode);
  const ctaText = limitCtaMaybe(script.ctaText, previewMode);

  // Resolve the single source URL. background wins because Blitz +
  // resolveMediaSlots stash it there; hookVideo / demoVideo are legacy
  // aliases some paths still populate; posterUrl is ContentPreview's
  // last-resort still image.
  const sourceUrl
    = mediaSlots?.background?.url
    || mediaSlots?.hookVideo?.url
    || mediaSlots?.demoVideo?.url
    || posterUrl
    || '';

  const dimming = Math.max(0, Math.min(0.8, style.backgroundDimming ?? 0.3));
  const showDimming = Boolean(sourceUrl) && dimming > 0;

  const fontFamily = style.fontFamily || 'Inter';
  const base = style.fontSize || 48;
  const color = style.color || '#ffffff';
  const bgColor = style.backgroundColor || 'rgba(0,0,0,0.5)';
  const ctaBg = style.ctaBackgroundColor || '#864FFE';
  const align = style.align || 'center';
  const alignItems = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
  const bodyWeight = style.weight === 'bold' ? 700 : 400;
  const italicStyle = style.italic ? 'italic' : 'normal';
  const underlineDeco = style.underline ? 'underline' : 'none';
  const noAnimation = style.noAnimation === true;

  const fadeIn = (from: number, to: number) => (
    noAnimation ? 1 : interpolate(frame, [from, to], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  );
  const riseIn = (from: number, to: number) => (
    noAnimation ? 0 : interpolate(frame, [from, to], [10, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  );

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {audioTrack && audioTrack.url && (
        <Audio
          src={audioTrack.url}
          volume={Math.max(0, Math.min(1, (audioTrack.volume ?? 80) / 100))}
        />
      )}

      {/* Single top-level media — one decoder, no Sequence remount storm. */}
      {sourceUrl && (
        isVideoUrl(sourceUrl) ? (
          <Video
            src={sourceUrl}
            style={{ width, height, objectFit: 'cover', position: 'absolute' }}
            muted
            loop
          />
        ) : (
          <Img
            src={sourceUrl}
            style={{ width, height, objectFit: 'cover', position: 'absolute' }}
          />
        )
      )}

      {showDimming && (
        <AbsoluteFill style={{ backgroundColor: `rgba(0, 0, 0, ${dimming})`, zIndex: 5 }} />
      )}

      {/* Text overlay — hook + body + cta stacked with staggered fade-ins.
        * Timing matches the old Sequence order so the visual rhythm is
        * preserved even though the background no longer switches. */}
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems,
          padding: 40,
          gap: 16,
          zIndex: 10,
        }}
      >
        {hookText && (
          <div
            style={{
              backgroundColor: bgColor,
              padding: '14px 22px',
              borderRadius: 8,
              maxWidth: '92%',
              opacity: fadeIn(0, 15),
              transform: `translateY(${riseIn(0, 15)}px)`,
            }}
          >
            <p
              style={{
                fontFamily,
                fontSize: base * 1.15,
                color,
                fontWeight: 700,
                fontStyle: italicStyle,
                textDecoration: underlineDeco,
                textAlign: align,
                lineHeight: 1.3,
                margin: 0,
                textShadow: '0 2px 4px rgba(0,0,0,0.35)',
              }}
            >
              {hookText}
            </p>
          </div>
        )}

        {bodyText && (
          <div
            style={{
              backgroundColor: bgColor,
              padding: '12px 20px',
              borderRadius: 8,
              maxWidth: '92%',
              opacity: fadeIn(15, 30),
              transform: `translateY(${riseIn(15, 30)}px)`,
            }}
          >
            <p
              style={{
                fontFamily,
                fontSize: base,
                color,
                fontWeight: bodyWeight,
                fontStyle: italicStyle,
                textDecoration: underlineDeco,
                textAlign: align,
                lineHeight: 1.4,
                margin: 0,
                textShadow: '0 2px 4px rgba(0,0,0,0.35)',
              }}
            >
              {bodyText}
            </p>
          </div>
        )}

        {ctaText && (
          <div
            style={{
              backgroundColor: ctaBg,
              padding: '12px 22px',
              borderRadius: 999,
              maxWidth: '92%',
              opacity: fadeIn(30, 45),
              transform: `translateY(${riseIn(30, 45)}px)`,
            }}
          >
            <p
              style={{
                fontFamily,
                fontSize: base * 0.9,
                color: '#ffffff',
                fontWeight: 700,
                fontStyle: italicStyle,
                textDecoration: underlineDeco,
                textAlign: align,
                margin: 0,
                textShadow: '0 2px 4px rgba(0,0,0,0.35)',
              }}
            >
              {ctaText}
            </p>
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
