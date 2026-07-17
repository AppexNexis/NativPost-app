/**
 * applySetToSlots
 *
 * Swap template-derived media in a `sourceMediaSlots` shape with a user's
 * Media Set assets. Only invoked by Blitz for the safe-swap content types
 * (slideshow / carousel / wall_of_text). Text overlays / composition logic
 * are untouched — only the raw source URLs change.
 *
 * Behavior per content type:
 *   - slideshow / carousel → replace slides[] entries 1:1 by index. If the
 *     Set has fewer assets than the template had slides, keep the tail of
 *     the template slides (better than leaving blank frames).
 *   - wall_of_text → replace background with the Set's first image asset.
 *   - anything else → return slots unchanged.
 */

import type { SourceMediaSlots } from './build-source-media-slots';
import type { ResolvedSet } from './pick-default-set';

const SLIDESHOW_SWAP_TYPES = new Set(['slideshow', 'carousel', 'wall_of_text']);
const VIDEO_SWAP_TYPES = new Set([
  'talking_head',
  'video_hook',
  'video_hook_demo',
  'ugc',
  'green_screen',
  'scene',
  'reel',
]);

/**
 * Thrown by applySetToSlots when the selected Set does not have enough
 * distinct assets to fill a slideshow/carousel post without repeating
 * frames. Callers (Phase 1 / Phase 2 loops in campaign utils) MUST catch
 * this and skip to the next template so users never see duplicated slides.
 */
export class InsufficientAssetsError extends Error {
  readonly have: number;
  readonly need: number;
  readonly setId: string;

  constructor(setId: string, have: number, need: number) {
    super(`Set ${setId} has ${have} assets but ${need} slides needed`);
    this.name = 'InsufficientAssetsError';
    this.have = have;
    this.need = need;
    this.setId = setId;
  }
}

export function applySetToSlots(
  slots: SourceMediaSlots,
  set: ResolvedSet,
  contentType: string,
  /**
   * Rotate into the asset pool by this many positions so consecutive posts
   *  start on a different image. Defaults to 0 (original behaviour).
   */
  slideOffset: number = 0,
): SourceMediaSlots {
  if (!set.assets || set.assets.length === 0) {
    return slots;
  }

  // ── Video content types (talking_head, video_hook, ugc, etc.) ──────────
  // Route mp4/webm assets into hookVideo/demoVideo/background. If the Set
  // has no videos, leave template media untouched (don't shove a static
  // image into a <Video> tag — it renders as first-frame only).
  if (VIDEO_SWAP_TYPES.has(contentType)) {
    const videos = set.assets.filter(a => a.assetType === 'video');
    if (videos.length === 0) {
      return slots;
    }
    const n = videos.length;
    const pick = (i: number) => videos[(i + slideOffset) % n]!;

    const next: SourceMediaSlots = { ...slots };
    // Primary slot for every video type: prefer hookVideo, then demoVideo,
    // then background. Rotate secondary slots into the next asset so a
    // single-asset Set doesn't 2× the same clip.
    let idx = 0;
    if (slots.hookVideo !== undefined || contentType === 'video_hook' || contentType === 'video_hook_demo') {
      const asset = pick(idx++);
      next.hookVideo = { url: asset.url, assetType: 'video' as const };
    }
    if (slots.demoVideo !== undefined || contentType === 'video_hook_demo' || contentType === 'ugc' || contentType === 'talking_head') {
      const asset = pick(idx++);
      next.demoVideo = { url: asset.url, assetType: 'video' as const };
    }
    if (slots.background?.assetType === 'video' || contentType === 'green_screen' || contentType === 'scene' || contentType === 'reel') {
      const asset = pick(idx++);
      next.background = { url: asset.url, assetType: 'video' as const };
    }
    // talking_head extras: mirror hookVideo into faceVideo so the face
    // slot renders when no influencer is enabled.
    if (contentType === 'talking_head' && next.hookVideo) {
      next.faceVideo = { url: next.hookVideo.url, assetType: 'video' as const };
    }
    return next;
  }

  if (!SLIDESHOW_SWAP_TYPES.has(contentType)) {
    return slots;
  }

  if (contentType === 'wall_of_text') {
    const images = set.assets.filter(a => a.assetType === 'image');
    const pool = images.length > 0 ? images : set.assets;
    const picked = pool[slideOffset % pool.length] || pool[0]!;
    return {
      ...slots,
      background: { url: picked.url, assetType: picked.assetType },
    };
  }

  // slideshow / carousel — require enough distinct assets so slides never
  // repeat. Throws InsufficientAssetsError when the caller-selected Set
  // can't fill the template's slide count; the loop must catch + skip.
  const imageAssets = set.assets.filter(a => a.assetType === 'image');
  const assets = imageAssets.length > 0 ? imageAssets : set.assets;
  const n = assets.length;

  const templateSlides = slots.slides || [];
  const needed = templateSlides.length > 0 ? templateSlides.length : n;
  if (n < needed) {
    throw new InsufficientAssetsError(set.id, n, needed);
  }

  const nextSlides = templateSlides.length > 0
    ? templateSlides.map((slide, i) => {
        const swap = assets[(i + slideOffset) % n];
        if (!swap) {
          return slide;
        }
        return { url: swap.url, assetType: 'image' as const };
      })
    : assets.map((_, i) => {
        const asset = assets[(i + slideOffset) % n]!;
        return { url: asset.url, assetType: 'image' as const };
      });

  return {
    ...slots,
    slides: nextSlides,
  };
}
