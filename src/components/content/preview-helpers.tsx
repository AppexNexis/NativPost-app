'use client';

// Shared preview helpers for content items (posts + campaign review grid).
//
// Extracted from CampaignReviewGrid so the standalone /dashboard/posts page
// and the per-campaign review grid resolve thumbnails, video URLs, overlay
// text, and platform badges the same way. Keep this module the single
// source of truth — CampaignReviewGrid and PostCard both import from here.

import React from 'react';

import type { ContentItem } from '@/types/v2';

// ── Constants ─────────────────────────────────────────────────────────────
export const VIDEO_RE = /\.(mp4|webm|mov|m4v)(\?|$)/i;

// Content types whose canonical preview is a video (rendered via <video>
// with autoplay muted loop, poster = getThumb fallback).
export const VIDEO_CONTENT_TYPES = new Set<string>([
  'ugc',
  'talking_head',
  'video_hook_demo',
  'video_hook',
  'green_screen',
  'green_screen_meme',
  'reel',
]);

// ── Thumbnail resolver ────────────────────────────────────────────────────
// Returns the best available image URL for a card preview.
// Never returns a video URL (mp4/webm/mov) since those can't display in <img>.
export function getThumb(item: ContentItem | null | undefined): string | null {
  if (!item) return null;
  const enrichment = (item.enrichmentData ?? {}) as Record<string, any>;
  const mediaSlots = (enrichment.sourceMediaSlots ?? {}) as Record<string, any>;
  const snapshot = (enrichment.templateSnapshot ?? {}) as Record<string, any>;

  // 1. Slideshow / carousel — first slide image (skip if video).
  const slides = mediaSlots.slides;
  if (Array.isArray(slides) && slides.length > 0) {
    const url = slides[0]?.url;
    if (url && typeof url === 'string' && !VIDEO_RE.test(url)) return url;
  }

  // 2. Template snapshot thumbnailUrl.
  if (snapshot.thumbnailUrl && typeof snapshot.thumbnailUrl === 'string' && !VIDEO_RE.test(snapshot.thumbnailUrl)) {
    return snapshot.thumbnailUrl;
  }

  // 3. Template snapshot thumbnailUrls array/object.
  const tus = snapshot.thumbnailUrls;
  if (Array.isArray(tus) && tus.length > 0 && typeof tus[0] === 'string' && !VIDEO_RE.test(tus[0])) {
    return tus[0];
  }
  if (tus && typeof tus === 'object' && !Array.isArray(tus)) {
    const first = Object.values(tus)[0];
    if (typeof first === 'string' && !VIDEO_RE.test(first)) return first;
  }

  // 4. Background slot: thumbnailUrl → image-only url.
  const bg = (mediaSlots.background ?? {}) as Record<string, any>;
  if (bg.thumbnailUrl && typeof bg.thumbnailUrl === 'string' && !VIDEO_RE.test(bg.thumbnailUrl)) {
    return bg.thumbnailUrl;
  }
  if (bg.url && bg.assetType !== 'video' && !VIDEO_RE.test(bg.url)) return bg.url;

  // 5. hookVideo / demoVideo thumbnail images.
  const hookVid = (mediaSlots.hookVideo ?? {}) as Record<string, any>;
  if (hookVid.thumbnailUrl && typeof hookVid.thumbnailUrl === 'string' && !VIDEO_RE.test(hookVid.thumbnailUrl)) {
    return hookVid.thumbnailUrl;
  }
  const demoVid = (mediaSlots.demoVideo ?? {}) as Record<string, any>;
  if (demoVid.thumbnailUrl && typeof demoVid.thumbnailUrl === 'string' && !VIDEO_RE.test(demoVid.thumbnailUrl)) {
    return demoVid.thumbnailUrl;
  }

  // 6. graphicUrls — skip video URLs.
  const gUrl = item.graphicUrls?.[0];
  if (gUrl && typeof gUrl === 'string' && !VIDEO_RE.test(gUrl)) return gUrl;

  return null;
}

// ── Video URL resolver ────────────────────────────────────────────────────
// Returns the raw video URL for video-type content, used for hover/autoplay
// <video> rendering.
export function getVideoUrl(item: ContentItem | null | undefined): string | null {
  if (!item) return null;
  const enrichment = (item.enrichmentData ?? {}) as Record<string, any>;
  const mediaSlots = (enrichment.sourceMediaSlots ?? {}) as Record<string, any>;
  const bg = (mediaSlots.background ?? {}) as Record<string, any>;
  if (bg.url && (bg.assetType === 'video' || VIDEO_RE.test(String(bg.url)))) return String(bg.url);
  const hookVid = (mediaSlots.hookVideo ?? {}) as Record<string, any>;
  if (hookVid.url && VIDEO_RE.test(String(hookVid.url))) return String(hookVid.url);
  const demoVid = (mediaSlots.demoVideo ?? {}) as Record<string, any>;
  if (demoVid.url && VIDEO_RE.test(String(demoVid.url))) return String(demoVid.url);
  const snapshot = (enrichment.templateSnapshot ?? {}) as Record<string, any>;
  const srcUrl = snapshot.sourceUrl || snapshot.mediaUrl;
  if (srcUrl && typeof srcUrl === 'string' && VIDEO_RE.test(srcUrl)) return srcUrl;
  const gUrl = item.graphicUrls?.[0];
  if (gUrl && typeof gUrl === 'string' && VIDEO_RE.test(gUrl)) return gUrl;
  return null;
}

// ── Overlay text resolver ─────────────────────────────────────────────────
// Returns the hook / body text overlaid on the card thumbnail so the preview
// matches how the post will look on the platform (usefastlane pattern).
export function getOverlayText(item: ContentItem | null | undefined): string {
  if (!item) return '';
  const enrichment = (item.enrichmentData ?? {}) as Record<string, any>;
  const script = (enrichment.editorScript ?? {}) as Record<string, any>;
  if (item.contentType === 'slideshow') {
    const slideCopy = Array.isArray(script.slideCopy) ? script.slideCopy : [];
    if (slideCopy[0] && typeof slideCopy[0] === 'string') return slideCopy[0];
    const slides = (enrichment.sourceMediaSlots as Record<string, any>)?.slides;
    if (Array.isArray(slides) && slides[0]?.caption) return String(slides[0].caption);
  }
  if (script.hookText && typeof script.hookText === 'string') return script.hookText;
  if (script.bodyText && typeof script.bodyText === 'string') return script.bodyText;
  return item.caption ?? '';
}

// ── Video-type check ──────────────────────────────────────────────────────
export function isVideoContentType(item: ContentItem | null | undefined): boolean {
  if (!item) return false;
  return VIDEO_CONTENT_TYPES.has(item.contentType ?? '');
}

// ── Content type label ────────────────────────────────────────────────────
export function ctLabel(contentType: string | null | undefined): string {
  if (!contentType) return '—';
  return contentType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Platform icon ─────────────────────────────────────────────────────────
export function PlatformIcon({ platform, size = 'default' }: { platform: string; size?: 'default' | 'sm' }) {
  const p = platform.toLowerCase();
  const wrap = size === 'sm' ? 'size-5' : 'size-6';
  const svg = size === 'sm' ? 'size-3' : 'size-3.5';
  const ytSvg = size === 'sm' ? 'size-3.5' : 'size-4';

  if (p === 'youtube') {
    return (
      <span className={`flex ${wrap} items-center justify-center rounded-full bg-white shadow-sm`}>
        <svg viewBox="0 0 24 24" className={`${ytSvg} fill-red-600`}>
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      </span>
    );
  }
  if (p === 'instagram') {
    return (
      <span className={`flex ${wrap} items-center justify-center rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 shadow-sm`}>
        <svg viewBox="0 0 24 24" className={`${svg} fill-white`}>
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
        </svg>
      </span>
    );
  }
  if (p === 'tiktok') {
    return (
      <span className={`flex ${wrap} items-center justify-center rounded-full bg-black shadow-sm`}>
        <svg viewBox="0 0 24 24" className={`${svg} fill-white`}>
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.79a4.85 4.85 0 0 1-1-.1z" />
        </svg>
      </span>
    );
  }
  if (p === 'linkedin') {
    return (
      <span className={`flex ${wrap} items-center justify-center rounded-full bg-[#0a66c2] shadow-sm`}>
        <svg viewBox="0 0 24 24" className={`${svg} fill-white`}>
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
      </span>
    );
  }
  if (p === 'x' || p === 'twitter') {
    return (
      <span className={`flex ${wrap} items-center justify-center rounded-full bg-black shadow-sm`}>
        <svg viewBox="0 0 24 24" className={`${svg} fill-white`}>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </span>
    );
  }
  return (
    <span className={`flex ${wrap} items-center justify-center rounded-full bg-blue-600 shadow-sm`}>
      <svg viewBox="0 0 24 24" className={`${svg} fill-white`}>
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    </span>
  );
}
